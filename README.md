# PWA Prompt Manager

A mobile-first, offline-first Progressive Web App (PWA) inspired by Google Keep. Create, view, copy, and edit prompt cards. Installable, fast, deployable to Netlify, and syncs with Supabase. Uses Dexie for offline cache and a Workbox service worker for offline support & background sync triggers.

## Tech Stack
- React + Vite + TypeScript
- Tailwind CSS
- Supabase (auth, database, storage)
- Dexie.js (IndexedDB)
- Workbox (service worker, offline caching)
- Netlify (deployment)

## Quick Start
```bash
pnpm i # or npm i or yarn
cp .env.sample .env
# Fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

## Build & Deploy (Netlify)
- Connect your repo to Netlify (or drag-drop `dist/`).
- Build command: `npm run build`
- Publish directory: `dist`
- The service worker is at `/public/sw.js` and will be copied as-is.

## Supabase Setup
1. Create a new Supabase project.
2. In **SQL Editor**, create the `notes` table and RLS:

```sql
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text,
  body text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.notes enable row level security;

create policy "allow read own" on public.notes
  for select using (auth.uid() = user_id);

create policy "allow insert own" on public.notes
  for insert with check (auth.uid() = user_id);

create policy "allow update own" on public.notes
  for update using (auth.uid() = user_id);

create policy "allow delete own" on public.notes
  for delete using (auth.uid() = user_id);
```

3. Go to **Project Settings → API**, copy:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public` key → `VITE_SUPABASE_ANON_KEY`

4. (Optional) Enable Email OTP auth in **Authentication → Providers**.

## How Sync Works
- Notes are always saved locally (Dexie). Mutations (create/update/delete) are queued if offline.
- The service worker registers a background sync (`sync-notes`) when back online and nudges the app.
- The app then flushes the pending Dexie queue to Supabase and pulls latest remote notes.
- If you're not signed in, notes remain local only. Sign in to sync them.

## Features Checklist
- [x] Create, edit, delete notes (prompt cards)
- [x] Copy button on each note (copies only body)
- [x] Edit button on each note
- [x] Offline-first caching (Dexie + Workbox)
- [x] Installable PWA (manifest + SW)
- [x] Responsive grid: 2 cols (mobile) → 5 cols (desktop)
- [x] Fast-loading Tailwind-based UI
- [x] Dark mode toggle
- [x] Netlify-ready

## Notes
- This project uses manual Workbox setup via CDN `workbox-sw.js`. For more advanced precaching (hashed assets), consider using `vite-plugin-pwa` which uses Workbox under the hood.
- Background sync here is triggered from the SW and executed by the app (which has the Supabase client). This avoids shipping secrets into the service worker.
- You can customize card size in `src/styles.css` (`.card` height).

## License
MIT
