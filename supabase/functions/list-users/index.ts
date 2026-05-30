import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const adminEmail = (Deno.env.get('ADMIN_EMAIL') || 'lazyboy64@yahoo.com').toLowerCase();

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response('Function is not configured', { status: 500, headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return new Response('Missing authorization token', { status: 401, headers: corsHeaders });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const requester = await adminClient.auth.getUser(token);
  const requesterEmail = (requester.data.user?.email || '').toLowerCase();
  const canManage = requester.data.user?.user_metadata?.can_manage_users === true;

  if (requester.error || !requester.data.user || (requesterEmail !== adminEmail && !canManage)) {
    return new Response('Not authorized to list users', { status: 403, headers: corsHeaders });
  }

  const { data, error } = await adminClient.auth.admin.listUsers();
  if (error) {
    return new Response(error.message, { status: 500, headers: corsHeaders });
  }

  const users = (data.users || []).map((u) => ({
    id: u.id,
    email: u.email,
    createdAt: u.created_at,
    lastSignIn: u.last_sign_in_at,
    mustChangePassword: u.user_metadata?.must_change_password === true,
    canManageUsers: u.user_metadata?.can_manage_users === true,
    isAdmin: u.email?.toLowerCase() === adminEmail,
  }));

  return new Response(JSON.stringify({ users }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
