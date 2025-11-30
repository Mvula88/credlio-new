-- Fix all notification trigger functions that reference l.full_name
-- The lenders table does NOT have a full_name column, only business_name

-- Fix 1: notify_on_new_message
CREATE OR REPLACE FUNCTION public.notify_on_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_recipient_user_id UUID;
  v_sender_name TEXT;
BEGIN
  -- Get thread info and determine recipient
  IF NEW.sender_type = 'lender' THEN
    -- Lender sent message, notify borrower
    SELECT
      bul.user_id,
      COALESCE(l.business_name, 'A lender')
    INTO v_recipient_user_id, v_sender_name
    FROM public.message_threads t
    JOIN public.borrowers b ON t.borrower_id = b.id
    JOIN public.borrower_user_links bul ON bul.borrower_id = b.id
    LEFT JOIN public.lenders l ON t.lender_id = l.user_id
    WHERE t.id = NEW.thread_id;
  ELSIF NEW.sender_type = 'borrower' THEN
    -- Borrower sent message, notify lender
    SELECT
      t.lender_id,
      COALESCE(b.full_name, 'A borrower')
    INTO v_recipient_user_id, v_sender_name
    FROM public.message_threads t
    JOIN public.borrowers b ON t.borrower_id = b.id
    WHERE t.id = NEW.thread_id;
  END IF;

  -- Create notification if recipient found
  IF v_recipient_user_id IS NOT NULL THEN
    PERFORM public.create_notification(
      v_recipient_user_id,
      'new_message',
      'New message from ' || v_sender_name,
      SUBSTRING(NEW.message FROM 1 FOR 100) || CASE WHEN LENGTH(NEW.message) > 100 THEN '...' ELSE '' END,
      '/messages',
      'normal',
      'View Message',
      '/messages'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Fix 2: notify_borrower_new_offer
CREATE OR REPLACE FUNCTION public.notify_borrower_new_offer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $_$
DECLARE
  v_borrower_user_id UUID;
  v_lender_name TEXT;
  v_request_purpose TEXT;
  v_amount TEXT;
BEGIN
  -- Get borrower user_id
  SELECT lr.borrower_user_id, lr.purpose
  INTO v_borrower_user_id, v_request_purpose
  FROM public.loan_requests lr
  WHERE lr.id = NEW.request_id;

  -- Get lender name (use business_name only, no full_name)
  SELECT COALESCE(l.business_name, 'A lender')
  INTO v_lender_name
  FROM public.lenders l
  WHERE l.user_id = NEW.lender_id;

  -- Format amount
  v_amount := (NEW.amount_minor / 100)::TEXT;

  -- Create notification
  IF v_borrower_user_id IS NOT NULL THEN
    PERFORM public.create_notification(
      v_borrower_user_id,
      'loan_offer',
      'New loan offer received',
      v_lender_name || ' has offered you $' || v_amount || ' for your request: ' || COALESCE(v_request_purpose, 'Loan Request'),
      '/b/loans',
      'high',
      'View Offer',
      '/b/loans'
    );
  END IF;

  RETURN NEW;
END;
$_$;

-- Fix 3: notify_agreement_signature
CREATE OR REPLACE FUNCTION public.notify_agreement_signature()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_borrower_user_id UUID;
  v_borrower_name TEXT;
  v_lender_name TEXT;
BEGIN
  -- Get party info
  SELECT bul.user_id, b.full_name
  INTO v_borrower_user_id, v_borrower_name
  FROM public.borrowers b
  JOIN public.borrower_user_links bul ON bul.borrower_id = b.id
  WHERE b.id = NEW.borrower_id;

  -- Get lender name (use business_name only, no full_name)
  SELECT COALESCE(l.business_name, 'Lender')
  INTO v_lender_name
  FROM public.lenders l
  WHERE l.user_id = NEW.lender_id;

  -- Lender signed
  IF NEW.lender_signed_at IS NOT NULL AND (OLD.lender_signed_at IS NULL OR TG_OP = 'INSERT') THEN
    IF v_borrower_user_id IS NOT NULL THEN
      PERFORM public.create_notification(
        v_borrower_user_id,
        'agreement_signed_lender',
        'Lender signed agreement',
        v_lender_name || ' has signed the loan agreement. Please review and sign.',
        '/b/loans',
        'high',
        'Sign Agreement',
        '/b/loans'
      );
    END IF;
  END IF;

  -- Borrower signed
  IF NEW.borrower_signed_at IS NOT NULL AND (OLD.borrower_signed_at IS NULL OR TG_OP = 'INSERT') THEN
    PERFORM public.create_notification(
      NEW.lender_id,
      'agreement_signed_borrower',
      'Borrower signed agreement',
      COALESCE(v_borrower_name, 'Borrower') || ' has signed the loan agreement.',
      '/l/loans/' || NEW.loan_id::TEXT,
      'normal'
    );
  END IF;

  -- Both signed (fully executed)
  IF NEW.lender_signed_at IS NOT NULL AND NEW.borrower_signed_at IS NOT NULL
     AND (OLD.lender_signed_at IS NULL OR OLD.borrower_signed_at IS NULL OR TG_OP = 'INSERT') THEN
    -- Notify both parties
    IF v_borrower_user_id IS NOT NULL THEN
      PERFORM public.create_notification(
        v_borrower_user_id,
        'agreement_fully_signed',
        'Agreement fully executed',
        'Your loan agreement has been signed by all parties and is now active.',
        '/b/loans',
        'normal'
      );
    END IF;

    PERFORM public.create_notification(
      NEW.lender_id,
      'agreement_fully_signed',
      'Agreement fully executed',
      'The loan agreement with ' || COALESCE(v_borrower_name, 'borrower') || ' is now fully signed.',
      '/l/loans/' || NEW.loan_id::TEXT,
      'normal'
    );
  END IF;

  RETURN NEW;
END;
$$;
