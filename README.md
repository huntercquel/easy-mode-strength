# Life-Proof Strength Block v2

Mobile-first strength tracking app with:

- tier-based workout selection (A/B/C) for quick tap input
- exact set/rep logging with smart prefill
- Supabase authentication (email/password and email OTP)
- Supabase cloud persistence (per-user training state)

## 1. Install

```bash
npm install
```

## 2. Configure Supabase env

Create `.env` from `.env.example` and set:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- optional: `VITE_SUPABASE_STATE_TABLE` (defaults to `training_state`)

## 3. Create the persistence table + RLS policies

Run SQL from:

- `supabase/schema.sql`

This creates:

- `public.training_state` keyed by `user_id`
- row-level policies so users can only read/write their own state

## 4. Run locally

```bash
npm run dev
```

## Auth behavior

- Not signed in: auth screen is shown first.
- Signed in: app loads state from Supabase for that user.
- State edits auto-sync to Supabase; localStorage is only a cache fallback.

## Build

```bash
npm run build
```
