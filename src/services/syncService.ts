import { supabase } from '../lib/supabase';
import { db } from '../db';
import type { SyncableTableName } from './service-helpers';
import type { BaseEntity } from '../db/types';

// The tables we sync (excluding akun and permission which are managed differently for now, but we can include them if needed)
export const SYNCABLE_TABLES: SyncableTableName[] = [
  'profil_sekolah',
  'pengaturan',
  'tahun_ajaran',
  'tingkat',
  'kelas',
  'pengaturan_pendaftaran_tahun_ajaran',
  'siswa',
  'siswa_kelas',
  'tagihan',
  'pembayaran',
  'audit_log'
];

/**
 * Pushes local queued changes to Supabase
 */
export async function pushSync(): Promise<void> {
  if (!import.meta.env.VITE_SUPABASE_URL || !navigator.onLine) return;

  const queue = await db.sync_queue.orderBy('created_at').toArray();
  if (queue.length === 0) return;

  // Group by table
  const byTable = queue.reduce((acc, item) => {
    if (!acc[item.tabel]) acc[item.tabel] = [];
    acc[item.tabel].push(item);
    return acc;
  }, {} as Record<string, typeof queue>);

  for (const table of Object.keys(byTable)) {
    const items = byTable[table];
    
    // We only process 'insert' and 'update' via upsert.
    // For 'delete', we just ensure it gets pushed if we use soft deletes.
    // Our app uses soft deletes (deleted_at is set), so 'delete' action in queue is actually just an update setting deleted_at.
    
    const payloads = items.map(i => {
      const p = { ...i.payload };
      // Remove dexie-only metadata
      delete p._sync_status;
      delete p._sync_at;
      delete p._local_only;
      return p;
    });

    try {
      const { error } = await supabase.from(table).upsert(payloads);
      
      if (error) {
        console.error(`Failed to push to ${table}:`, error);
        // Log failure
        for (const item of items) {
          await db.sync_log.add({
            tabel: table,
            record_id: item.record_id,
            status: 'failed',
            created_at: new Date().toISOString(),
            error_message: error.message
          });
        }
      } else {
        // Success
        const idsToDelete = items.map(i => i.id!);
        await db.sync_queue.bulkDelete(idsToDelete);
        
        // Update local records to 'synced'
        const recordIds = items.map(i => i.record_id);
        const dexieTable = db.table(table);
        const recordsToUpdate = await dexieTable.where('id').anyOf(recordIds).toArray();
        for (const record of recordsToUpdate) {
          record._sync_status = 'synced';
          record._sync_at = new Date().toISOString();
        }
        await dexieTable.bulkPut(recordsToUpdate);
        
        // Log success
        for (const item of items) {
          await db.sync_log.add({
            tabel: table,
            record_id: item.record_id,
            status: 'success',
            created_at: new Date().toISOString()
          });
        }
      }
    } catch (err) {
      console.error(`Error during push for ${table}:`, err);
    }
  }
}

/**
 * Pulls recent changes from Supabase to Local DB.
 * Uses 'updated_at' to resolve conflicts.
 * @param isInitial Setup phase pull, ignores lastSyncDate and pulls everything
 */
export async function pullSync(isInitial = false): Promise<void> {
  if (!import.meta.env.VITE_SUPABASE_URL || !navigator.onLine) return;

  const LAST_SYNC_KEY = 'paud_last_sync_timestamp';
  const lastSync = isInitial ? null : localStorage.getItem(LAST_SYNC_KEY);
  
  let latestTimestamp = lastSync || '2000-01-01T00:00:00.000Z';

  for (const table of SYNCABLE_TABLES) {
    let query = supabase.from(table).select('*');
    if (lastSync) {
      query = query.gt('updated_at', lastSync);
    }

    try {
      const { data, error } = await query;
      
      if (error) {
        console.error(`Failed to pull from ${table}:`, error);
        continue;
      }

      if (data && data.length > 0) {
        const dexieTable = db.table(table);
        const localRecords = await dexieTable.where('id').anyOf(data.map(d => d.id)).toArray();
        const localMap = new Map(localRecords.map(r => [r.id, r]));

        const toPut: any[] = [];

        for (const remoteRecord of data) {
          const localRecord = localMap.get(remoteRecord.id) as BaseEntity | undefined;
          
          if (!localRecord) {
            // New record from remote
            toPut.push({
              ...remoteRecord,
              _sync_status: 'synced',
              _sync_at: new Date().toISOString()
            });
          } else {
            // Conflict resolution: Last-Write-Wins based on updated_at
            const remoteTime = new Date(remoteRecord.updated_at).getTime();
            const localTime = new Date(localRecord.updated_at).getTime();

            if (remoteTime > localTime) {
              toPut.push({
                ...remoteRecord,
                _sync_status: 'synced',
                _sync_at: new Date().toISOString()
              });
            } else if (remoteTime === localTime) {
               // If equal, just mark as synced if it was pending
               if (localRecord._sync_status === 'pending') {
                  localRecord._sync_status = 'synced';
                  toPut.push(localRecord);
               }
            }
            // If localTime > remoteTime, we ignore. Our pending local change will be pushed eventually.
          }

          if (remoteRecord.updated_at > latestTimestamp) {
            latestTimestamp = remoteRecord.updated_at;
          }
        }

        if (toPut.length > 0) {
          await dexieTable.bulkPut(toPut);
        }
      }
    } catch (err) {
      console.error(`Error during pull for ${table}:`, err);
    }
  }

  // Save new sync timestamp
  localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
}

/**
 * Triggers a full sync cycle: Push then Pull.
 */
export async function triggerFullSync(): Promise<void> {
  await pushSync();
  await pullSync();
}
