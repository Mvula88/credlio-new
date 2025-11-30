-- Add direct messaging feature for lenders to message borrowers
-- This allows lenders to initiate conversations without a loan offer

-- Add thread_type to distinguish direct messages from loan-related messages
ALTER TABLE public.message_threads
ADD COLUMN IF NOT EXISTS thread_type TEXT DEFAULT 'loan_related';

-- Add check constraint for thread_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'message_threads_type_check'
  ) THEN
    ALTER TABLE public.message_threads
    ADD CONSTRAINT message_threads_type_check CHECK (thread_type IN ('loan_related', 'direct', 'support'));
  END IF;
END $$;

-- Add subject field for direct message threads
ALTER TABLE public.message_threads
ADD COLUMN IF NOT EXISTS subject TEXT;

-- Create index for thread_type
CREATE INDEX IF NOT EXISTS idx_threads_type ON public.message_threads(thread_type);

-- Function to create or get existing direct message thread between lender and borrower
CREATE OR REPLACE FUNCTION public.get_or_create_direct_thread(
  p_lender_id UUID,
  p_borrower_id UUID,
  p_subject TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_thread_id UUID;
BEGIN
  -- Check if a direct thread already exists between this lender and borrower
  SELECT id INTO v_thread_id
  FROM public.message_threads
  WHERE lender_id = p_lender_id
    AND borrower_id = p_borrower_id
    AND thread_type = 'direct'
    AND status = 'active'
  LIMIT 1;

  -- If no thread exists, create one
  IF v_thread_id IS NULL THEN
    INSERT INTO public.message_threads (
      lender_id,
      borrower_id,
      thread_type,
      subject,
      status,
      created_at,
      last_message_at
    ) VALUES (
      p_lender_id,
      p_borrower_id,
      'direct',
      p_subject,
      'active',
      NOW(),
      NOW()
    ) RETURNING id INTO v_thread_id;
  END IF;

  RETURN v_thread_id;
END;
$func$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_thread(UUID, UUID, TEXT) TO authenticated;

-- Function for lender to send a direct message to borrower
CREATE OR REPLACE FUNCTION public.send_direct_message(
  p_borrower_id UUID,
  p_message TEXT,
  p_subject TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_lender_id UUID;
  v_thread_id UUID;
  v_message_id UUID;
  v_borrower_user_id UUID;
  v_lender_name TEXT;
  v_is_flagged BOOLEAN := FALSE;
  v_spam_keywords TEXT[] := ARRAY['bank account', 'password', 'pin', 'otp', 'verification code', 'send money'];
BEGIN
  -- Get the lender_id from current user
  SELECT user_id INTO v_lender_id
  FROM public.lenders
  WHERE user_id = auth.uid();

  IF v_lender_id IS NULL THEN
    RAISE EXCEPTION 'Only lenders can initiate direct messages';
  END IF;

  -- Verify borrower exists
  IF NOT EXISTS (SELECT 1 FROM public.borrowers WHERE id = p_borrower_id) THEN
    RAISE EXCEPTION 'Borrower not found';
  END IF;

  -- Get or create the thread
  v_thread_id := public.get_or_create_direct_thread(v_lender_id, p_borrower_id, p_subject);

  -- Check for spam keywords
  FOR i IN 1..array_length(v_spam_keywords, 1) LOOP
    IF lower(p_message) LIKE '%' || v_spam_keywords[i] || '%' THEN
      v_is_flagged := TRUE;
      EXIT;
    END IF;
  END LOOP;

  -- Insert the message
  INSERT INTO public.messages (
    thread_id,
    sender_type,
    sender_id,
    message,
    flagged_as_spam,
    created_at
  ) VALUES (
    v_thread_id,
    'lender',
    v_lender_id,
    p_message,
    v_is_flagged,
    NOW()
  ) RETURNING id INTO v_message_id;

  -- Update thread last_message_at
  UPDATE public.message_threads
  SET last_message_at = NOW()
  WHERE id = v_thread_id;

  -- Create notification for borrower
  SELECT bul.user_id INTO v_borrower_user_id
  FROM public.borrower_user_links bul
  WHERE bul.borrower_id = p_borrower_id;

  SELECT COALESCE(l.business_name, l.full_name, 'A lender') INTO v_lender_name
  FROM public.lenders l
  WHERE l.user_id = v_lender_id;

  IF v_borrower_user_id IS NOT NULL THEN
    PERFORM public.create_notification(
      v_borrower_user_id,
      'new_message',
      'New message from ' || v_lender_name,
      SUBSTRING(p_message FROM 1 FOR 100) || CASE WHEN LENGTH(p_message) > 100 THEN '...' ELSE '' END,
      '/b/messages',
      'normal',
      'View Message',
      '/b/messages'
    );
  END IF;

  RETURN v_message_id;
END;
$func$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.send_direct_message(UUID, TEXT, TEXT) TO authenticated;

-- Update RLS policies for message_threads to allow admin access
DROP POLICY IF EXISTS "Admin can view all threads" ON public.message_threads;
CREATE POLICY "Admin can view all threads" ON public.message_threads
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Update RLS policies for messages to allow admin access
DROP POLICY IF EXISTS "Admin can view all messages" ON public.messages;
CREATE POLICY "Admin can view all messages" ON public.messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Comments
COMMENT ON COLUMN public.message_threads.thread_type IS 'Type of thread: loan_related, direct, or support';
COMMENT ON COLUMN public.message_threads.subject IS 'Subject line for direct message threads';
COMMENT ON FUNCTION public.get_or_create_direct_thread IS 'Gets existing or creates new direct message thread between lender and borrower';
COMMENT ON FUNCTION public.send_direct_message IS 'Allows lenders to send direct messages to borrowers';
