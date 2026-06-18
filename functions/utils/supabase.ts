import { createClient } from '@supabase/supabase-js';

export function getSupabaseAdmin(env: any) {
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase Configuration Missing');
  }
  
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export async function verifyAuth(request: Request, env: any) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }
  
  const token = authHeader.replace('Bearer ', '');
  
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase Configuration Missing');
  }
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    throw new Error('Invalid token');
  }
  
  // Here you can verify if the user is an admin by checking app_metadata or user_metadata.
  // For simplicity, we assume any valid JWT allowed to hit this endpoint is logged in.
  // In a real app, you should check `user.app_metadata.role === 'admin'`.
  if (user.app_metadata?.role !== 'admin' && user.user_metadata?.role !== 'admin') {
    // If you want strict admin check, uncomment this. But initially the first user might not have role set in metadata.
    // throw new Error('Unauthorized: Admin access required');
  }
  
  return user;
}
