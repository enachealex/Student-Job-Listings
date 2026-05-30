import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

  // Only admin can delete users
  if (requesterError || !requesterData?.user || requesterEmail !== adminEmail) {
    return new Response('Only admin can delete users', { status: 403, headers: corsHeaders });
  }

  let payload: { userId?: string };
  try { payload = await req.json(); } catch { return new Response('Invalid JSON', { status: 400, headers: corsHeaders }); }

  const { userId } = payload;
  if (!userId) return new Response('userId is required', { status: 400, headers: corsHeaders });

  const { data: targetData } = await client.auth.admin.getUserById(userId);
  if (!targetData?.user) return new Response('User not found', { status: 404, headers: corsHeaders });

  if (targetData.user.email?.toLowerCase() === adminEmail) {
    return new Response('Cannot delete the admin account', { status: 400, headers: corsHeaders });
  }

  const { error } = await client.auth.admin.deleteUser(userId);
  if (error) return new Response(error.message, { status: 500, headers: corsHeaders });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
