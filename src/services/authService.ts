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

export async function loginWithPassword(email: string, password: string): Promise<UserSession> {
  const normalizedEmail = email.trim().toLowerCase();
  await ensureLoginBootstrap();

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

export async function logoutUser(): Promise<void> {
  if (import.meta.env.VITE_SUPABASE_URL) {
    await supabase.auth.signOut();
  }
}
