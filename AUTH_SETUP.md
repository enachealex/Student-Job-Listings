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
  adminEmail: 'lazyboy64@yahoo.com',
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

- Create user: `lazyboy64@yahoo.com`
- Set a strong temporary password (8+ characters). Do not commit it to the repo or share it publicly.
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
supabase secrets set ADMIN_EMAIL=lazyboy64@yahoo.com
supabase secrets set SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

Important:

- Use `SERVICE_ROLE_KEY` only in edge function secrets, never in `app-config.js`.

## 5b) Migrate the user-management permission flag

`can_manage_users` is stored in `app_metadata`, not `user_metadata`.

This matters: `user_metadata` is writable by the signed-in user via
`PUT /auth/v1/user`, so a flag kept there could be set by any user on their own
account. `app_metadata` can only be written with the service role key.

If you deployed an earlier version that used `user_metadata`, deploy the updated
functions first, then run `migrate-can-manage-users.sql` in the Supabase SQL Editor.
It copies the flag to `app_metadata` and strips the old copy. Safe to re-run.

```bash
supabase functions deploy admin-update-user
supabase functions deploy list-users
```

Note: the flag is carried in the JWT, so after the admin grants or revokes it the
affected user sees the change on their next token refresh or sign-in, not instantly.

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
