-- Add RLS policies for borrower_user_links table
-- This table links borrowers to user accounts and needs read access for users

-- Enable RLS if not already enabled
ALTER TABLE public.borrower_user_links ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own borrower link
CREATE POLICY "Users can view own borrower link" ON public.borrower_user_links
  FOR SELECT
  USING (auth.uid() = user_id);

-- Note: INSERT/UPDATE/DELETE are handled by the API with service role
-- so we don't need policies for those operations
