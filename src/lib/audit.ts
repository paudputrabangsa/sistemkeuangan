import { db } from '../db';
import type { AuditLog } from '../db/types';

interface CreateAuditInput {
  tabel: string;
  record_id: string;
  aksi: 'create' | 'update' | 'delete' | 'batal' | 'lainnya';
  deskripsi: string;
  user_id: string;
  payload?: any;
}

export async function logAudit(input: CreateAuditInput): Promise<void> {
  const auditEntry: AuditLog = {
    id: crypto.randomUUID(),
    tabel: input.tabel,
    record_id: input.record_id,
    aksi: input.aksi,
    deskripsi: input.deskripsi,
    user_id: input.user_id,
    payload: input.payload,
    created_at: new Date().toISOString(),
    _sync_status: 'pending',
  };

  try {
    await db.audit_log.add(auditEntry);
  } catch (error) {
    console.error('Failed to save audit log', error);
  }
}
