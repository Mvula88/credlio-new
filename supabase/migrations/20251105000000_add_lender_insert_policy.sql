-- Add INSERT policy for lenders table
-- This allows users to create their own lender profile

CREATE POLICY "Lenders can insert own record" ON public.lenders
  FOR INSERT WITH CHECK (auth.uid() = user_id);
