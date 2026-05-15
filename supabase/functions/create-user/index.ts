import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type CreateUserPayload = {
  email?: string;
  temporaryPassword?: string;
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
  const adminEmail = (Deno.env.get('ADMIN_EMAIL') || 'enachealex1@gmail.com').toLowerCase();

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

  if (requester.error || !requester.data.user || requesterEmail !== adminEmail) {
    return new Response('Only admin can add users', { status: 403, headers: corsHeaders });
  }

  let payload: CreateUserPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON payload', { status: 400, headers: corsHeaders });
  }

  const email = (payload.email || '').trim().toLowerCase();
  const temporaryPassword = payload.temporaryPassword || '';

  if (!email || !temporaryPassword) {
    return new Response('Email and temporaryPassword are required', { status: 400, headers: corsHeaders });
  }

  if (temporaryPassword.length < 4) {
    return new Response('Temporary password must be at least 4 characters', { status: 400, headers: corsHeaders });
  }

  const created = await adminClient.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      must_change_password: true,
    },
  });

  if (created.error) {
    return new Response(created.error.message, { status: 400, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ userId: created.data.user?.id || null }), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
});
