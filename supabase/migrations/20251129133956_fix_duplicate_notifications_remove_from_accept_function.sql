-- Fix duplicate notifications when accepting/declining loans
-- The trigger notify_loan_status_change already creates notifications on status change
-- So we remove the duplicate notification INSERT from accept_loan_offer and decline_loan_offer functions

-- Fix accept_loan_offer function - remove duplicate notification
CREATE OR REPLACE FUNCTION public.accept_loan_offer(p_loan_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_loan RECORD;
  v_borrower_user_id UUID;
  v_current_user_id UUID;
BEGIN
  v_current_user_id := auth.uid();

  -- Get the loan with borrower info
  SELECT l.*, b.id as borrower_id, b.full_name as borrower_name
  INTO v_loan
  FROM public.loans l
  JOIN public.borrowers b ON l.borrower_id = b.id
  WHERE l.id = p_loan_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Loan not found');
  END IF;

  -- Check if loan is in pending_offer status
  IF v_loan.status != 'pending_offer' THEN
    RETURN json_build_object('success', false, 'error', 'This loan is not awaiting acceptance');
  END IF;

  -- Verify the current user is linked to this borrower
  SELECT user_id INTO v_borrower_user_id
  FROM public.borrower_user_links
  WHERE borrower_id = v_loan.borrower_id AND user_id = v_current_user_id;

  IF v_borrower_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'You are not authorized to accept this loan');
  END IF;

  -- Update the loan status to active
  -- The trigger notify_loan_status_change will handle the notification
  UPDATE public.loans
  SET
    status = 'active',
    borrower_accepted_at = NOW(),
    start_date = NOW(),
    updated_at = NOW()
  WHERE id = p_loan_id;

  -- Create repayment schedule for newly active loan
  PERFORM generate_simple_repayment_schedule(
    p_loan_id,
    v_loan.principal_minor,
    COALESCE(v_loan.total_amount_minor, v_loan.principal_minor),
    COALESCE(v_loan.interest_amount_minor, 0),
    COALESCE(v_loan.payment_type, 'once_off'),
    COALESCE(v_loan.num_installments, 1),
    CURRENT_DATE
  );

  -- NOTE: Notification is created by trigger notify_loan_status_change

  RETURN json_build_object('success', true, 'message', 'Loan offer accepted successfully');
END;
$$;

-- Fix decline_loan_offer function - remove duplicate notification
CREATE OR REPLACE FUNCTION public.decline_loan_offer(p_loan_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_loan RECORD;
  v_borrower_user_id UUID;
  v_current_user_id UUID;
BEGIN
  v_current_user_id := auth.uid();

  -- Get the loan with borrower info
  SELECT l.*, b.id as borrower_id, b.full_name as borrower_name
  INTO v_loan
  FROM public.loans l
  JOIN public.borrowers b ON l.borrower_id = b.id
  WHERE l.id = p_loan_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Loan not found');
  END IF;

  IF v_loan.status != 'pending_offer' THEN
    RETURN json_build_object('success', false, 'error', 'This loan is not awaiting acceptance');
  END IF;

  SELECT user_id INTO v_borrower_user_id
  FROM public.borrower_user_links
  WHERE borrower_id = v_loan.borrower_id AND user_id = v_current_user_id;

  IF v_borrower_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'You are not authorized to decline this loan');
  END IF;

  UPDATE public.loans
  SET
    status = 'declined',
    borrower_declined_at = NOW(),
    decline_reason = p_reason,
    updated_at = NOW()
  WHERE id = p_loan_id;

  -- NOTE: Notification is created by trigger notify_loan_status_change

  RETURN json_build_object('success', true, 'message', 'Loan offer declined');
END;
$$;

-- Update trigger to include decline reason in notification
CREATE OR REPLACE FUNCTION public.notify_loan_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_borrower_user_id UUID;
  v_borrower_name TEXT;
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT bul.user_id, b.full_name
  INTO v_borrower_user_id, v_borrower_name
  FROM public.borrowers b
  LEFT JOIN public.borrower_user_links bul ON bul.borrower_id = b.id
  WHERE b.id = NEW.borrower_id;

  IF NEW.status = 'active' AND OLD.status = 'pending_offer' THEN
    INSERT INTO public.notifications (user_id, type, title, message, link)
    VALUES (
      NEW.lender_id,
      'loan_accepted',
      'Loan Offer Accepted',
      COALESCE(v_borrower_name, 'The borrower') || ' has accepted your loan offer.',
      '/l/loans/' || NEW.id::TEXT
    );
  ELSIF NEW.status = 'declined' AND OLD.status = 'pending_offer' THEN
    INSERT INTO public.notifications (user_id, type, title, message, link)
    VALUES (
      NEW.lender_id,
      'loan_accepted',
      'Loan Offer Declined',
      COALESCE(v_borrower_name, 'The borrower') || ' has declined your loan offer.' ||
        CASE WHEN NEW.decline_reason IS NOT NULL THEN ' Reason: ' || NEW.decline_reason ELSE '' END,
      '/l/loans/' || NEW.id::TEXT
    );
  ELSIF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    IF v_borrower_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, link)
      VALUES (v_borrower_user_id, 'loan_accepted', 'Loan fully repaid!', 'Congratulations! You have successfully repaid your loan.', '/b/loans');
    END IF;
    INSERT INTO public.notifications (user_id, type, title, message, link)
    VALUES (NEW.lender_id, 'loan_accepted', 'Loan fully repaid', 'Your loan to ' || COALESCE(v_borrower_name, 'borrower') || ' has been fully repaid.', '/l/loans/' || NEW.id::TEXT);
  ELSIF NEW.status = 'defaulted' AND OLD.status != 'defaulted' THEN
    INSERT INTO public.notifications (user_id, type, title, message, link)
    VALUES (NEW.lender_id, 'risk_flag', 'Loan marked as defaulted', 'A loan to ' || COALESCE(v_borrower_name, 'borrower') || ' has been marked as defaulted.', '/l/loans/' || NEW.id::TEXT);
  END IF;

  RETURN NEW;
END;
$func$;
