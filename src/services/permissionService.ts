import { db } from '../db';
import type { Permission } from '../db/types';
import { PermissionDeniedError } from './service-errors';

export async function canAccess(role: string, modul: Permission['modul'], aksi: Permission['aksi'][number]) {
  const permissions = await db.permission
    .where('role')
    .equals(role)
    .toArray();
  return permissions.some((permission) => permission.modul === modul && permission.aktif && permission.aksi.includes(aksi));
}

export async function assertCanAccess(role: string, modul: Permission['modul'], aksi: Permission['aksi'][number]) {
  const allowed = await canAccess(role, modul, aksi);
  if (!allowed) {
    throw new PermissionDeniedError();
  }
}
