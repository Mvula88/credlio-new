-- Add avatar_url column to profiles table for profile photos

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN avatar_url TEXT;
    COMMENT ON COLUMN public.profiles.avatar_url IS 'URL to user profile avatar stored in Supabase Storage';
  END IF;
END $$;
