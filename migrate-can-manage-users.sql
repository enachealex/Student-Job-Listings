-- One-time migration: move can_manage_users from user_metadata to app_metadata.
--
-- Why: user_metadata is writable by the user themselves via PUT /auth/v1/user, so any
-- signed-in user could set can_manage_users on their own account and gain access to
-- list-users and admin-update-user. app_metadata can only be written with the service
-- role key, so it is safe to use for authorization.
--
-- Run this in the Supabase SQL Editor AFTER deploying the updated edge functions.
-- Safe to re-run.

-- 1) Copy the flag across for anyone who legitimately had it.
--    raw_app_meta_data already holds {"provider":"email",...}, so merge rather than replace.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                        || jsonb_build_object('can_manage_users', true)
where coalesce(raw_user_meta_data ->> 'can_manage_users', 'false') = 'true';

-- 2) Remove the old self-writable copy so it can never be mistaken for the real flag.
update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'can_manage_users'
where raw_user_meta_data ? 'can_manage_users';

-- 3) Verify: this should list exactly the accounts you expect to manage users.
select email,
       raw_app_meta_data ->> 'can_manage_users'  as app_flag,
       raw_user_meta_data ->> 'can_manage_users' as leftover_user_flag
from auth.users
order by email;
