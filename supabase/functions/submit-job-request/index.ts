import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Public endpoint: anyone on the internet can reach this. Everything below
// assumes the payload is hostile until proven otherwise.

const ALLOWED_ORIGINS = [
  'https://jobs.thejumpvault.com',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

type RequestPayload = Record<string, unknown>;

const LIMITS = {
  contactName: 120,
  contactEmail: 254,
  contactPhone: 40,
  role: 160,
  organization: 160,
  state: 40,
  city: 80,
  county: 80,
  type: 60,
  category: 60,
  details: 5000,
  postingUrl: 2048,
  phone: 40,
  benefit: 160,
};

// "Boise, ID" with a city, "Ada County, ID" when only the county is known.
const locationLabel = (city: string, county: string, state: string): string => {
  const place = city || (county ? `${county} County` : '');
  if (place && state) return `${place}, ${state}`;
  return place || state;
};

const str = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

// Deliberately permissive: a wrong-but-plausible address is the employer's
// problem to fix, and over-strict email regexes reject valid addresses.
const looksLikeEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

async function verifyCaptcha(token: string, remoteIp: string): Promise<{ ok: boolean; reason: string }> {
  const secret = Deno.env.get('HCAPTCHA_SECRET') || '';

  if (!secret) {
    // Not configured yet. Allow the submission so the form is not dead on
    // arrival, but make the gap loud in the function logs.
    console.warn(
      'HCAPTCHA_SECRET is not set — accepting submission WITHOUT captcha verification. ' +
      'Set it with: supabase secrets set HCAPTCHA_SECRET=...',
    );
    return { ok: true, reason: 'unverified' };
  }

  if (!token) return { ok: false, reason: 'missing' };

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);

    const resp = await fetch('https://api.hcaptcha.com/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const result = await resp.json();
    return { ok: result?.success === true, reason: (result?.['error-codes'] || []).join(',') };
  } catch (err) {
    console.error('hCaptcha verification request failed', err);
    return { ok: false, reason: 'verification-unavailable' };
  }
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Function is not configured' }, 500);

  let payload: RequestPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'We could not read that submission. Please try again.' }, 400);
  }

  const remoteIp = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const captcha = await verifyCaptcha(str(payload.captchaToken, 4000), remoteIp);
  if (!captcha.ok) {
    return json(
      { error: 'We could not confirm you are human. Please complete the checkbox and try again.' },
      400,
    );
  }

  const contactName = str(payload.contactName, LIMITS.contactName);
  const contactEmail = str(payload.contactEmail, LIMITS.contactEmail).toLowerCase();
  const contactPhone = str(payload.contactPhone, LIMITS.contactPhone);
  const role = str(payload.role, LIMITS.role);
  const organization = str(payload.organization, LIMITS.organization);
  const state = str(payload.state, LIMITS.state);
  const city = str(payload.city, LIMITS.city);
  const county = str(payload.county, LIMITS.county);
  const type = str(payload.type, LIMITS.type);
  const category = str(payload.category, LIMITS.category) || 'pta';
  const details = str(payload.details, LIMITS.details);
  const phone = str(payload.phone, LIMITS.phone);
  let postingUrl = str(payload.postingUrl, LIMITS.postingUrl);

  // Field-keyed so the wizard can jump the employer back to the exact step.
  const errors: Record<string, string> = {};
  if (!contactName) errors.contactName = 'Please tell us your name.';
  if (!contactEmail) errors.contactEmail = 'Please give us an email address.';
  else if (!looksLikeEmail(contactEmail)) errors.contactEmail = 'That email address does not look right.';
  if (!role) errors.role = 'Please enter the job title.';
  if (!organization) errors.organization = 'Please enter your organization name.';
  if (!state) errors.state = 'Please choose a state.';
  // Either is enough: some towns are unincorporated and some employers only
  // know the county.
  if (!city && !county) errors.city = 'Please choose either a city or a county.';
  if (!type) errors.type = 'Please choose an employment type.';
  if (!details) errors.details = 'Please describe the job.';

  if (postingUrl && !/^https?:\/\//i.test(postingUrl)) {
    postingUrl = `https://${postingUrl}`;
  }
  if (postingUrl && !/^https?:\/\/[^\s]+\.[^\s]+/i.test(postingUrl)) {
    errors.postingUrl = 'That web address does not look right. It should start with https://';
  }

  if (Object.keys(errors).length > 0) {
    return json({ error: 'Some answers need fixing.', fieldErrors: errors }, 400);
  }

  const payRaw = payload.pay;
  const payNumber = typeof payRaw === 'number'
    ? payRaw
    : typeof payRaw === 'string' && payRaw.trim() !== ''
      ? Number(payRaw.replace(/[^0-9.]/g, ''))
      : null;
  const pay = payNumber != null && Number.isFinite(payNumber) && payNumber >= 0 ? payNumber : null;

  const benefits = Array.isArray(payload.benefits)
    ? payload.benefits
        .map((benefit) => str(benefit, LIMITS.benefit))
        .filter(Boolean)
        .slice(0, 25)
    : [];

  const client = createClient(supabaseUrl, serviceRoleKey);

  // Cheap duplicate guard: same employer, same role, still pending.
  const { data: existing } = await client
    .from('job_requests')
    .select('id')
    .eq('contact_email', contactEmail)
    .eq('role', role)
    .eq('status', 'pending')
    .limit(1);

  if (existing && existing.length > 0) {
    return json(
      {
        ok: true,
        duplicate: true,
        message: 'We already have this request and are reviewing it.',
      },
      200,
    );
  }

  const id = `req-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

  const { error } = await client.from('job_requests').insert({
    id,
    status: 'pending',
    contact_name: contactName,
    contact_email: contactEmail,
    contact_phone: contactPhone,
    entry_mode: postingUrl ? 'url' : 'template',
    role,
    organization,
    location: locationLabel(city, county, state),
    state,
    city,
    county,
    type,
    category,
    details,
    posting_url: postingUrl,
    phone,
    pay,
    benefits,
    wants_sponsorship: payload.wantsSponsorship === true,
  });

  if (error) {
    console.error('job_requests insert failed', error);
    return json({ error: 'We could not save your request. Please try again in a moment.' }, 500);
  }

  return json({ ok: true, id }, 200);
});
