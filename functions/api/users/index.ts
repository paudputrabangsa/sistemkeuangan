import { getSupabaseAdmin, verifyAuth } from '../../utils/supabase';

export async function onRequestGet(context: any) {
  try {
    await verifyAuth(context.request, context.env);
    
    const supabase = getSupabaseAdmin(context.env);
    
    const { data: users, error } = await supabase.auth.admin.listUsers();
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
    
    const formattedUsers = users.users.map(u => ({
      id: u.id,
      email: u.email,
      nama: u.user_metadata?.nama || 'Tanpa Nama',
      role: u.app_metadata?.role || 'admin',
      aktif: true, // we can derive from u.banned_until etc if needed
      created_at: u.created_at
    }));

    return new Response(JSON.stringify(formattedUsers), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 401 });
  }
}

export async function onRequestPost(context: any) {
  try {
    await verifyAuth(context.request, context.env);
    
    const body = await context.request.json();
    const { email, password, nama, role } = body;
    
    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Email dan password wajib diisi' }), { status: 400 });
    }
    
    const supabase = getSupabaseAdmin(context.env);
    
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        nama: nama || 'Admin'
      },
      app_metadata: {
        role: role || 'admin'
      }
    });
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({
      id: data.user.id,
      email: data.user.email,
      nama: data.user.user_metadata?.nama,
      role: data.user.app_metadata?.role
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 401 });
  }
}
