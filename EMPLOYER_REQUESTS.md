# Employer Job Requests

Employers send in listings from `/request-listing` without an account. Staff
review them at `/review-requests` and publish the ones they want.

Listing is **free**. The only paid option is sponsored placement, which pins a
listing above the others on the jobs page.

## How it flows

1. A signed-out visitor on `/jobs` sees **Request Job Listing** and goes to the
   five-step form.
2. Submitting posts to the `submit-job-request` edge function, which verifies the
   captcha and writes a row to `public.job_requests` with status `pending`.
3. Staff see a count badge on **Settings → Job Requests** and review each one.
4. **Publish** inserts a row into `public.jobs` and marks the request `approved`.
   **Decline** marks it `rejected` with an optional private note.

Nothing an employer submits appears on the site until a staff member publishes it.

## Setup

> **Run the SQL before you deploy the site.** Saving a listing now writes the
> `is_sponsored`, `sponsored_until` and `county` columns. If the new site code is live
> before `job-requests-schema.sql` has run, those columns do not exist yet and
> **staff will not be able to post or edit any listing**. Reading is unaffected.
> Order: SQL first, then the edge function, then push the site.

### 1) Run the schema

In the Supabase SQL Editor, run `job-requests-schema.sql`. It adds the
`job_requests` table and the `is_sponsored`, `sponsored_until` and `county`
columns on `public.jobs`. Safe to re-run.

Note that `job_requests` has **no anon policy on purpose**. The public form does
not touch the table directly — it calls the edge function, which uses the service
role key. Adding an anon insert policy would let anyone POST rows straight to
PostgREST and skip the captcha.

### 2) Deploy the edge function

```bash
supabase functions deploy submit-job-request
```

This function is reachable by the public, using the anon key as its bearer token
(the same key already in `app-config.js`).

### 3) Set the captcha secret — required

```bash
supabase secrets set HCAPTCHA_SECRET=your_hcaptcha_secret
```

Get the secret from your hCaptcha dashboard. It is the partner to the sitekey
already in `app-config.js`.

**If this secret is missing the function still accepts submissions**, so the form
is never dead on arrival, but it logs a warning on every request and you have no
spam protection. Set it before announcing the URL to anyone.

### 4) Restrict CORS if the domain changes

`supabase/functions/submit-job-request/index.ts` has an `ALLOWED_ORIGINS` list at
the top. It covers `https://jobs.thejumpvault.com` plus local dev ports. Add any
new domain there.

## Sending the form to employers

Give them the direct link:

```
https://jobs.thejumpvault.com/request-listing
```

It needs no account and works on a phone.

## City and county

Both forms use the same picker, defined in `location-data.js`:

- City and county stay **disabled until a state is chosen**.
- Choosing a city fills in its county automatically.
- Choosing a county narrows the city list to that county's towns.
- **Either one is enough.** Some towns are unincorporated and will not be in the
  city list, and some employers only know the county.

`location-data.js` holds a city-to-county map for Idaho (197 towns, 44 counties)
and Washington (281 towns, 39 counties). County lists are derived from that map
rather than stored separately, so the two cannot drift apart. To add a state, add
another entry with the same shape; everything else picks it up.

The displayed `location` string is `"Moscow, ID"` when there is a city and
`"Latah County, ID"` when only the county is known.

## Sponsored placement

`wants_sponsorship` on a request only records that the employer asked to hear
about featuring. It is not a payment and grants nothing.

To feature a listing, tick **Feature this at the top of the list** in the Publish
dialog, once the employer has paid by whatever means you settle on. Sponsored
listings sort above everything else regardless of the visitor's chosen sort, and
carry a "Featured" badge.

`sponsored_until` is available on `public.jobs` for timed sponsorships. Nothing
sets it yet — when a value is present the listing stops being featured after that
date, with no cleanup job needed. Leave it null for open-ended.

## Things not built yet

- **Email to the employer.** The form promises "we will email you when it is
  live", but nothing sends that email — a staff member has to. Wiring it up needs
  an email provider (Supabase does not send arbitrary mail).
- **Payment.** Deliberately left out until a provider is chosen. The seam is the
  sponsored checkbox in the Publish dialog.
- **Rate limiting.** The function has a duplicate guard (same email + same role
  while pending) but no per-IP throttle. The captcha is the main defence.
