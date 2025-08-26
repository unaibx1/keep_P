# Supabase Setup Guide

## Current Configuration ✅

Your project is already connected to Supabase with the following configuration:

- **Project URL**: `https://xireyolnnolopvtlpuzu.supabase.co`
- **Environment Variables**: Already configured in `.env`

## Database Setup

Make sure your Supabase project has the following table structure:

### 1. Create the `notes` table

Run this SQL in your Supabase SQL Editor:

```sql
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text,
  body text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 2. Enable Row Level Security (RLS)

```sql
alter table public.notes enable row level security;
```

### 3. Create RLS Policies

```sql
-- Allow users to read their own notes
create policy "allow read own" on public.notes
  for select using (auth.uid() = user_id);

-- Allow users to insert their own notes
create policy "allow insert own" on public.notes
  for insert with check (auth.uid() = user_id);

-- Allow users to update their own notes
create policy "allow update own" on public.notes
  for update using (auth.uid() = user_id);

-- Allow users to delete their own notes
create policy "allow delete own" on public.notes
  for delete using (auth.uid() = user_id);
```

## Authentication Setup

The app uses a hardcoded personal account for simplicity:
- **Email**: `personal@localhost.app`
- **Password**: `personal-use-only-2024`

The app will automatically create this account if it doesn't exist.

## Testing the Connection

1. Start the development server: `npm run dev`
2. Open the app in your browser
3. Check the browser console for any Supabase connection errors
4. Try creating a note to test the sync functionality

## Environment Variables

Your `.env` file should contain:

```env
VITE_SUPABASE_URL=https://xireyolnnolopvtlpuzu.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

## Troubleshooting

If you encounter issues:

1. **Check Supabase Dashboard**: Ensure your project is active
2. **Verify API Keys**: Check that the anon key is correct
3. **Database Permissions**: Ensure RLS policies are properly set
4. **Network Issues**: Check if your Supabase project is accessible

## Security Notes

- The anon key is safe to use in client-side code
- RLS policies ensure users can only access their own data
- The hardcoded account is for personal use only
