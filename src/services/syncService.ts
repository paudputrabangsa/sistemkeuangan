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
 * Pushes local queued changes to Supabase sequentially to respect Foreign Key dependencies.
 */
export async function pushSync(): Promise<void> {
  if (!import.meta.env.VITE_SUPABASE_URL || !navigator.onLine) return;

  // Only process pending queue items
  const queue = await db.sync_queue
    .where('status').notEqual('failed') // We need to index 'status' or just filter
    .toArray();
    
  // Since 'status' is not fully indexed in Dexie yet, let's filter manually just in case
  const pendingQueue = queue.filter(q => q.status !== 'failed').sort((a, b) => a.id! - b.id!);

  if (pendingQueue.length === 0) return;

  for (const item of pendingQueue) {
    const payload = { ...item.payload };
    // Remove dexie-only metadata
    delete payload._sync_status;
    delete payload._sync_at;
    delete payload._local_only;

    try {
      const state = (await import('../store/authStore')).useAuthStore.getState();
      if (!navigator.onLine || state.forceOffline) break; // Abort if network lost or forced offline mid-sync
      // Upsert sequentially
      const { error } = await supabase.from(item.tabel).upsert(payload);
      
      if (error) {
        console.error(`Failed to push item ${item.id} to ${item.tabel}:`, error);
        
        // Mark as failed instead of blocking the entire queue
        await db.sync_queue.update(item.id!, {
          status: 'failed',
          error_message: error.message,
          retry_count: item.retry_count + 1
        });
        
        await db.sync_log.add({
          tabel: item.tabel,
          record_id: item.record_id,
          status: 'failed',
          created_at: new Date().toISOString(),
          error_message: error.message
        });
      } else {
        // Success
        await db.sync_queue.delete(item.id!);
        
        // Update local record to 'synced'
        const dexieTable = db.table(item.tabel);
        const record = await dexieTable.get(item.record_id);
        if (record) {
          record._sync_status = 'synced';
          record._sync_at = new Date().toISOString();
          await dexieTable.put(record);
        }
        
        // Log success
        await db.sync_log.add({
          tabel: item.tabel,
          record_id: item.record_id,
          status: 'success',
          created_at: new Date().toISOString()
        });
      }
    } catch (err: any) {
      console.error(`Error during push for item ${item.id} in ${item.tabel}:`, err);
      // Hard error (e.g. network lost mid-sync), stop processing to avoid out-of-order execution
      break; 
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
  let hasChanges = false;

  for (const table of SYNCABLE_TABLES) {
    let query = supabase.from(table).select('*');
    if (lastSync) {
      query = query.gt('updated_at', lastSync);
    }

    try {
      const state = (await import('../store/authStore')).useAuthStore.getState();
      if (!navigator.onLine || state.forceOffline) break; // Abort if network lost or forced offline mid-sync
      const { data, error } = await query;
      
      if (error) {
        console.error(`Failed to pull from ${table}:`, error);
        continue;
      }

      if (data && data.length > 0) {
        hasChanges = true;
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

  // Save new sync timestamp using the exact maximum timestamp we saw
  if (hasChanges && latestTimestamp > (lastSync || '')) {
    localStorage.setItem(LAST_SYNC_KEY, latestTimestamp);
  } else if (isInitial) {
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  }
}

let isSyncing = false;

/**
 * Triggers a full sync cycle: Push then Pull.
 * Prevents overlapping if the previous sync is still running (e.g. timeout on dead server).
 */
export async function triggerFullSync(): Promise<void> {
  if (isSyncing) return;
  isSyncing = true;
  try {
    await pushSync();
    await pullSync();
  } finally {
    isSyncing = false;
  }
}

/**
 * Retries a failed sync item by marking it as pending and triggering a sync.
 */
export async function retrySyncItem(queueId: number): Promise<void> {
  const item = await db.sync_queue.get(queueId);
  if (!item || item.status !== 'failed') return;
  
  await db.sync_queue.update(queueId, { status: 'pending', error_message: null });
  // Fire-and-forget trigger to attempt sync immediately
  triggerFullSync().catch(console.error);
}

/**
 * Discards a failed sync item and reverts the local database state.
 * For 'insert', it deletes the local record permanently.
 * For 'update'/'delete', it fetches the true state from Supabase and overwrites the local record.
 */
export async function discardSyncItem(queueId: number): Promise<void> {
  const item = await db.sync_queue.get(queueId);
  if (!item) return;

  try {
    const dexieTable = db.table(item.tabel);

    if (item.aksi === 'insert') {
      // Local creation failed, discard means we delete it entirely
      await dexieTable.delete(item.record_id);
    } else {
      // It was an update or delete that failed, we need to revert to remote state
      const { data, error } = await supabase.from(item.tabel).select('*').eq('id', item.record_id).maybeSingle();
      if (error) throw error;
      
      if (data) {
        // Remote data exists, overwrite local
        await dexieTable.put({
          ...data,
          _sync_status: 'synced',
          _sync_at: new Date().toISOString()
        });
      } else {
        // Remote data doesn't exist anymore, delete local
        await dexieTable.delete(item.record_id);
      }
    }

    // Clean up queue and log the discard action
    await db.sync_queue.delete(queueId);
    await db.sync_log.add({
      tabel: item.tabel,
      record_id: item.record_id,
      status: 'success', // or 'discarded' if you prefer, but 'success' indicates the queue resolved
      created_at: new Date().toISOString(),
      error_message: 'Discarded by user'
    });
  } catch (err: any) {
    console.error(`Failed to discard sync item ${queueId}:`, err);
    throw new Error('Gagal membuang antrean: ' + err.message);
  }
}
