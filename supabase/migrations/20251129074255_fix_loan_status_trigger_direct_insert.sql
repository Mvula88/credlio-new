-- Fix notify_loan_status_change function
-- Use direct INSERT instead of create_notification to avoid function overload ambiguity

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

  -- Get lender name (use business_name only)
  SELECT COALESCE(l.business_name, 'Your lender')
  INTO v_lender_name
  FROM public.lenders l
  WHERE l.user_id = NEW.lender_id;

  -- Handle status transitions using direct INSERT
  IF NEW.status = 'active' AND OLD.status = 'pending_offer' THEN
    -- Loan was accepted - notify lender
    INSERT INTO public.notifications (user_id, type, title, message, link)
    VALUES (
      NEW.lender_id,
      'loan_accepted',
      'Loan Offer Accepted',
      COALESCE(v_borrower_name, 'The borrower') || ' has accepted your loan offer.',
      '/l/loans/' || NEW.id::TEXT
    );
  ELSIF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Notify borrower loan is completed
    IF v_borrower_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, link)
      VALUES (
        v_borrower_user_id,
        'loan_accepted',
        'Loan fully repaid!',
        'Congratulations! You have successfully repaid your loan.',
        '/b/loans'
      );
    END IF;

    -- Notify lender
    INSERT INTO public.notifications (user_id, type, title, message, link)
    VALUES (
      NEW.lender_id,
      'loan_accepted',
      'Loan fully repaid',
      'Your loan to ' || COALESCE(v_borrower_name, 'borrower') || ' has been fully repaid.',
      '/l/loans/' || NEW.id::TEXT
    );
  ELSIF NEW.status = 'defaulted' AND OLD.status != 'defaulted' THEN
    -- Notify lender of default
    INSERT INTO public.notifications (user_id, type, title, message, link)
    VALUES (
      NEW.lender_id,
      'risk_flag',
      'Loan marked as defaulted',
      'A loan to ' || COALESCE(v_borrower_name, 'borrower') || ' has been marked as defaulted.',
      '/l/loans/' || NEW.id::TEXT
    );
  ELSIF NEW.status = 'declined' AND OLD.status = 'pending_offer' THEN
    -- Loan was declined - notify lender
    INSERT INTO public.notifications (user_id, type, title, message, link)
    VALUES (
      NEW.lender_id,
      'loan_accepted',
      'Loan Offer Declined',
      COALESCE(v_borrower_name, 'The borrower') || ' has declined your loan offer.',
      '/l/loans/' || NEW.id::TEXT
    );
  END IF;

  RETURN NEW;
END;
$func$;
