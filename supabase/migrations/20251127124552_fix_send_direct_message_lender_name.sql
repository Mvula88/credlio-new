-- Fix send_direct_message function to use correct lender column (business_name instead of full_name)

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

  -- Use business_name (lenders don't have full_name column)
  SELECT COALESCE(l.business_name, 'A lender') INTO v_lender_name
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
