-- Fix notify_loan_status_change function
-- The lenders table does NOT have a full_name column, only business_name

CREATE OR REPLACE FUNCTION public.notify_loan_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_borrower_user_id UUID;
  v_borrower_name TEXT;
  v_lender_name TEXT;
BEGIN
  -- Only fire when status changes
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Get borrower info
  SELECT bul.user_id, b.full_name
  INTO v_borrower_user_id, v_borrower_name
  FROM public.borrowers b
  LEFT JOIN public.borrower_user_links bul ON bul.borrower_id = b.id
  WHERE b.id = NEW.borrower_id;

  -- Get lender name (use business_name only, NOT full_name which doesn't exist)
  SELECT COALESCE(l.business_name, 'Your lender')
  INTO v_lender_name
  FROM public.lenders l
  WHERE l.user_id = NEW.lender_id;

  IF NEW.status = 'disbursed' AND OLD.status != 'disbursed' THEN
    -- Notify borrower that funds were disbursed
    IF v_borrower_user_id IS NOT NULL THEN
      PERFORM public.create_notification(
        v_borrower_user_id,
        'loan_disbursed',
        'Loan funds disbursed!',
        'Great news! Your loan of $' || (NEW.principal_minor / 100)::TEXT || ' has been disbursed by ' || v_lender_name,
        '/b/loans',
        'high',
        'View Loan',
        '/b/loans'
      );
    END IF;

    -- Notify lender
    PERFORM public.create_notification(
      NEW.lender_id,
      'loan_disbursed',
      'Loan disbursed successfully',
      'You have disbursed $' || (NEW.principal_minor / 100)::TEXT || ' to ' || COALESCE(v_borrower_name, 'borrower'),
      '/l/loans/' || NEW.id::TEXT,
      'normal'
    );
  ELSIF NEW.status = 'active' AND OLD.status = 'pending_offer' THEN
    -- Loan was accepted - notify lender
    PERFORM public.create_notification(
      NEW.lender_id,
      'loan_accepted',
      'Loan Offer Accepted',
      COALESCE(v_borrower_name, 'The borrower') || ' has accepted your loan offer.',
      '/l/loans/' || NEW.id::TEXT,
      'normal'
    );
  ELSIF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Notify both parties loan is completed
    IF v_borrower_user_id IS NOT NULL THEN
      PERFORM public.create_notification(
        v_borrower_user_id,
        'loan_completed',
        'Loan fully repaid!',
        'Congratulations! You have successfully repaid your loan of $' || (NEW.principal_minor / 100)::TEXT,
        '/b/loans',
        'normal'
      );
    END IF;

    PERFORM public.create_notification(
      NEW.lender_id,
      'loan_completed',
      'Loan fully repaid',
      'Your loan to ' || COALESCE(v_borrower_name, 'borrower') || ' has been fully repaid.',
      '/l/loans/' || NEW.id::TEXT,
      'normal'
    );
  ELSIF NEW.status = 'defaulted' AND OLD.status != 'defaulted' THEN
    -- Notify lender of default (high priority)
    PERFORM public.create_notification(
      NEW.lender_id,
      'loan_defaulted',
      'Loan marked as defaulted',
      'A loan of $' || (NEW.principal_minor / 100)::TEXT || ' to ' || COALESCE(v_borrower_name, 'borrower') || ' has been marked as defaulted.',
      '/l/loans/' || NEW.id::TEXT,
      'urgent',
      'View Details',
      '/l/loans/' || NEW.id::TEXT
    );
  ELSIF NEW.status = 'declined' AND OLD.status = 'pending_offer' THEN
    -- Loan was declined - notify lender
    PERFORM public.create_notification(
      NEW.lender_id,
      'loan_accepted',  -- Using existing type
      'Loan Offer Declined',
      COALESCE(v_borrower_name, 'The borrower') || ' has declined your loan offer.',
      '/l/loans/' || NEW.id::TEXT,
      'normal'
    );
  END IF;

  RETURN NEW;
END;
$func$;
