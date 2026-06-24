import { db } from '../db';
import { ensureLoginBootstrap } from '../db/seed';
import { supabase } from '../lib/supabase';
import { AuthenticationError } from './service-errors';

export interface UserSession {
  id: string;
  nama: string;
  email: string;
  role: 'admin';
  aktif: boolean;
  token?: string;
}

const DEFAULT_ADMIN_PASSWORD = 'admin123';

export async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function loginWithPassword(email: string, password: string): Promise<UserSession> {
  const normalizedEmail = email.trim().toLowerCase();
  await ensureLoginBootstrap();

  try {
    return await loginWithSandiDarurat(password);
  } catch (err) {
    // Bukan sandi darurat
  }

  try {
    return await loginWithPin(password);
  } catch (err) {
    // Bukan PIN
  }

  if (!navigator.onLine) {
    throw new AuthenticationError('Anda sedang offline. Gunakan PIN Kasir atau Sandi Darurat.');
  }

  let token = undefined;
  
  // Coba Supabase Auth jika terkonfigurasi
  if (import.meta.env.VITE_SUPABASE_URL) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    if (error) {
      throw new AuthenticationError('Email atau password salah (Supabase).');
    }
    if (data.session) {
      token = data.session.access_token;
    }
  }

  // Cek database lokal untuk sync
  let akun = (await db.akun.toArray()).find((item) => item.email.trim().toLowerCase() === normalizedEmail);

  if (!akun) {
    // Jika login Supabase berhasil tapi di DB lokal belum ada (misal akun baru), kita auto create di lokal
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        akun = {
          id: user.id,
          nama: user.user_metadata?.nama || 'Admin',
          email: normalizedEmail,
          role: user.app_metadata?.role || 'admin',
          aktif: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          _sync_status: 'synced'
        };
        await db.akun.put(akun);
      }
    } else {
      throw new AuthenticationError();
    }
  }

  if (akun && (akun.deleted_at || !akun.aktif)) {
    throw new AuthenticationError('Akun ini dinonaktifkan dan tidak dapat login.');
  }

  // Jika tidak menggunakan Supabase, fallback ke password mock lokal
  if (!token && import.meta.env.VITE_SUPABASE_URL === undefined) {
    if (normalizedEmail !== 'admin@paud.sch.id' || password !== DEFAULT_ADMIN_PASSWORD) {
      throw new AuthenticationError();
    }
  }

  return {
    id: akun!.id,
    nama: akun!.nama,
    email: akun!.email,
    role: akun!.role as 'admin',
    aktif: akun!.aktif,
    token
  };
}

export async function loginWithPin(pin: string): Promise<UserSession> {
  await ensureLoginBootstrap();
  const pinHash = await hashString(pin);
  const settingPin = await db.pengaturan.where('kunci').equals('auth_pin_hash').first();
  if (!settingPin || settingPin.nilai?.hash !== pinHash) {
    throw new AuthenticationError('PIN salah.');
  }

  const akunAdmin = await db.akun.filter(a => a.role === 'admin' && a.aktif && !a.deleted_at).first();
  if (!akunAdmin) throw new AuthenticationError('Tidak ada akun admin aktif.');

  return { id: akunAdmin.id, nama: akunAdmin.nama, email: akunAdmin.email, role: 'admin', aktif: true };
}

export async function loginWithSandiDarurat(sandi: string): Promise<UserSession> {
  await ensureLoginBootstrap();
  const sandiHash = await hashString(sandi);
  const settingSandi = await db.pengaturan.where('kunci').equals('auth_sandi_darurat_hash').first();
  if (!settingSandi || settingSandi.nilai?.hash !== sandiHash) {
    throw new AuthenticationError('Sandi darurat salah.');
  }

  const akunAdmin = await db.akun.filter(a => a.role === 'admin' && a.aktif && !a.deleted_at).first();
  if (!akunAdmin) throw new AuthenticationError('Tidak ada akun admin aktif.');

  return { id: akunAdmin.id, nama: akunAdmin.nama, email: akunAdmin.email, role: 'admin', aktif: true };
}

export async function setPinKasir(pin: string) {
  const hash = await hashString(pin);
  const existing = await db.pengaturan.where('kunci').equals('auth_pin_hash').first();
  const now = new Date().toISOString();
  if (existing) {
    existing.nilai = { hash };
    existing.updated_at = now;
    await db.pengaturan.put(existing);
  } else {
    await db.pengaturan.add({ id: crypto.randomUUID(), kunci: 'auth_pin_hash', nilai: { hash }, created_at: now, updated_at: now, keterangan: 'PIN Kasir', _sync_status: 'synced', _sync_at: now, _local_only: false });
  }
}

export async function setSandiDarurat(sandi: string) {
  const hash = await hashString(sandi);
  const existing = await db.pengaturan.where('kunci').equals('auth_sandi_darurat_hash').first();
  const now = new Date().toISOString();
  if (existing) {
    existing.nilai = { hash };
    existing.updated_at = now;
    await db.pengaturan.put(existing);
  } else {
    await db.pengaturan.add({ id: crypto.randomUUID(), kunci: 'auth_sandi_darurat_hash', nilai: { hash }, created_at: now, updated_at: now, keterangan: 'Sandi Darurat', _sync_status: 'synced', _sync_at: now, _local_only: false });
  }
}

export async function logoutUser(): Promise<void> {
  if (import.meta.env.VITE_SUPABASE_URL) {
    await supabase.auth.signOut();
  }
}
