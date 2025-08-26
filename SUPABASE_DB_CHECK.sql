-- Check if notes table exists
SELECT EXISTS (
   SELECT FROM information_schema.tables 
   WHERE table_schema = 'public'
   AND table_name = 'notes'
);

-- Create notes table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  body text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "allow read own" ON public.notes;
DROP POLICY IF EXISTS "allow insert own" ON public.notes;
DROP POLICY IF EXISTS "allow update own" ON public.notes;
DROP POLICY IF EXISTS "allow delete own" ON public.notes;

-- Create RLS policies
CREATE POLICY "allow read own" ON public.notes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "allow insert own" ON public.notes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "allow update own" ON public.notes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "allow delete own" ON public.notes
  FOR DELETE USING (auth.uid() = user_id);

-- Check table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'notes' 
ORDER BY ordinal_position;

-- Check RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'notes';
