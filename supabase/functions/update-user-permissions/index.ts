import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Payload = {
  userId?: string;
  canManageUsers?: boolean;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
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

  // Only the admin can grant/revoke manage permissions
  if (requester.error || !requester.data.user || requesterEmail !== adminEmail) {
    return new Response('Only admin can update user permissions', { status: 403, headers: corsHeaders });
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON payload', { status: 400, headers: corsHeaders });
  }

  const { userId, canManageUsers } = payload;
  if (!userId || typeof canManageUsers !== 'boolean') {
    return new Response('userId and canManageUsers are required', { status: 400, headers: corsHeaders });
  }

  const { data: target } = await adminClient.auth.admin.getUserById(userId);
  if (!target?.user) {
    return new Response('User not found', { status: 404, headers: corsHeaders });
  }

  // Prevent modifying admin's own permissions
  if (target.user.email?.toLowerCase() === adminEmail) {
    return new Response('Cannot modify admin permissions', { status: 400, headers: corsHeaders });
  }

  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...target.user.user_metadata,
      can_manage_users: canManageUsers,
    },
  });

  if (error) {
    return new Response(error.message, { status: 500, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
