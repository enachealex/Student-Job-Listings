# Supabase Auth Setup (Required for Full Functionality)

This project is already coded to enforce:

- Public visitors can view jobs only.
- Signed-in users can add/edit/delete/manage job listings.
- Only the admin user can create additional users.
- Newly created users must change password on first sign-in.

Use these steps to make it fully functional in production.

## 1) Fill runtime config

Edit `app-config.js`:

```js
globalThis.APP_CONFIG = {
  supabaseUrl: 'https://YOUR_PROJECT_ID.supabase.co',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY',
  adminEmail: 'enachealex1@gmail.com',
};
```

Notes:

- `supabaseAnonKey` is safe for browser usage.
- Keep `adminEmail` exactly equal to the admin account email.

## 2) Run database SQL

In Supabase SQL Editor, run `supabase-schema.sql` from this repository.

This creates:

- `public.jobs` table
- `updated_at` trigger
- RLS policies:
  - select for anon/authenticated
  - insert/update/delete for authenticated

## 3) Lock down authentication settings

In Supabase Dashboard -> Authentication -> Providers/Settings:

- Disable public sign-ups.
- Keep Email provider enabled for sign-in.

This is required so users cannot self-register.

## 4) Create the default admin account

In Supabase Dashboard -> Authentication -> Users:

- Create user: `enachealex1@gmail.com`
- Temporary password: `1234`
- Mark email as confirmed.

Then set user metadata to:

```json
{
  "must_change_password": true
}
```

## 5) Deploy the create-user edge function

Function source is at `supabase/functions/create-user/index.ts`.

Deploy with Supabase CLI (run from project root after `supabase login` and `supabase link`):

```bash
supabase functions deploy create-user
```

Set function secrets:

```bash
supabase secrets set ADMIN_EMAIL=enachealex1@gmail.com
supabase secrets set SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

Important:

- Use `SERVICE_ROLE_KEY` only in edge function secrets, never in `app-config.js`.

## 6) Redeploy site after config changes

After updating `app-config.js`, push and redeploy so production serves real Supabase values.

## 7) Verify full auth flow

1. Open `/jobs` as signed-out user: listings visible, no upload/edit access.
2. Click Sign In: navigate to `/login`.
3. Sign in with admin default account.
4. First login redirects to `/change-password`.
5. Set new password (8+ chars), then redirect to `/jobs`.
6. Open Settings -> Manage Users (admin only) and create a new user.
7. New user signs in and is forced to `/change-password`.

If user creation fails, the UI now surfaces the exact edge-function error text.
