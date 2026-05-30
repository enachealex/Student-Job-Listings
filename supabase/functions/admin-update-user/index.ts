import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Payload = {
  userId?: string;
  canManageUsers?: boolean;
  firstName?: string;
  lastName?: string;
  resetPassword?: boolean;
};

const RESET_PASSWORD = 'TempPass#1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const adminEmail = (Deno.env.get('ADMIN_EMAIL') || 'lazyboy64@yahoo.com').toLowerCase();

  if (!supabaseUrl || !serviceRoleKey) return new Response('Not configured', { status: 500, headers: corsHeaders });

  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  if (!token) return new Response('Missing token', { status: 401, headers: corsHeaders });

  const client = createClient(supabaseUrl, serviceRoleKey);
  const { data: requesterData, error: requesterError } = await client.auth.getUser(token);
  const requesterEmail = (requesterData?.user?.email || '').toLowerCase();
  const requesterIsAdmin = requesterEmail === adminEmail;
  const requesterCanManage = requesterData?.user?.user_metadata?.can_manage_users === true;

  if (requesterError || !requesterData?.user || (!requesterIsAdmin && !requesterCanManage)) {
    return new Response('Forbidden', { status: 403, headers: corsHeaders });
  }

  let payload: Payload;
  try { payload = await req.json(); } catch { return new Response('Invalid JSON', { status: 400, headers: corsHeaders }); }

  const { userId, canManageUsers, firstName, lastName, resetPassword } = payload;
  if (!userId) return new Response('userId is required', { status: 400, headers: corsHeaders });

  const { data: targetData } = await client.auth.admin.getUserById(userId);
  if (!targetData?.user) return new Response('User not found', { status: 404, headers: corsHeaders });

  // Non-admin managers cannot modify permissions or touch the admin account
  if (!requesterIsAdmin && targetData.user.email?.toLowerCase() === adminEmail) {
    return new Response('Forbidden', { status: 403, headers: corsHeaders });
  }
  // Only admin can change permissions
  if (typeof canManageUsers === 'boolean' && !requesterIsAdmin) {
    return new Response('Only admin can change permissions', { status: 403, headers: corsHeaders });
  }
  // Protect admin's own permissions
  if (typeof canManageUsers === 'boolean' && targetData.user.email?.toLowerCase() === adminEmail) {
    return new Response('Cannot modify admin permissions', { status: 400, headers: corsHeaders });
  }

  const existingMeta = targetData.user.user_metadata || {};
  const newMeta: Record<string, unknown> = {
    ...existingMeta,
    ...(typeof firstName === 'string' ? { first_name: firstName.trim() } : {}),
    ...(typeof lastName === 'string' ? { last_name: lastName.trim() } : {}),
    ...(typeof canManageUsers === 'boolean' ? { can_manage_users: canManageUsers } : {}),
    ...(resetPassword ? { must_change_password: true } : {}),
  };

  const updatePayload: Record<string, unknown> = { user_metadata: newMeta };
  if (resetPassword) updatePayload.password = RESET_PASSWORD;

  const { error } = await client.auth.admin.updateUserById(userId, updatePayload);
  if (error) return new Response(error.message, { status: 500, headers: corsHeaders });

  return new Response(JSON.stringify({ ok: true, resetPassword: resetPassword ? RESET_PASSWORD : undefined }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
