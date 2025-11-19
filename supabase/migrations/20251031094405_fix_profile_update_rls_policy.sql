-- Fix RLS policy for profile updates
-- The original policy was missing WITH CHECK clause, which prevents updates

-- Drop the old policy
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Recreate with both USING and WITH CHECK clauses
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
