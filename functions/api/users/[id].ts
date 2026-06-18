import { getSupabaseAdmin, verifyAuth } from '../../utils/supabase';

export async function onRequestPut(context: any) {
  try {
    await verifyAuth(context.request, context.env);
    
    const id = context.params.id;
    const body = await context.request.json();
    const { nama, role, password } = body;
    
    const supabase = getSupabaseAdmin(context.env);
    
    const updateData: any = {};
    if (password) updateData.password = password;
    if (nama) updateData.user_metadata = { nama };
    if (role) updateData.app_metadata = { role };
    
    const { data, error } = await supabase.auth.admin.updateUserById(id, updateData);
    
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

export async function onRequestDelete(context: any) {
  try {
    await verifyAuth(context.request, context.env);
    
    const id = context.params.id;
    
    const supabase = getSupabaseAdmin(context.env);
    
    const { error } = await supabase.auth.admin.deleteUser(id);
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 401 });
  }
}
