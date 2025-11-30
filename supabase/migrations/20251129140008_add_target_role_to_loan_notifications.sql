-- Fix notifications to use target_role properly
-- This ensures borrowers only see borrower notifications and lenders only see lender notifications

-- Update notify_loan_status_change to set target_role
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
    -- Loan was accepted - notify lender (target_role = 'lender')
    INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
    VALUES (
      NEW.lender_id,
      'loan_accepted',
      'Loan Offer Accepted',
      COALESCE(v_borrower_name, 'The borrower') || ' has accepted your loan offer.',
      '/l/loans/' || NEW.id::TEXT,
      'lender'
    );
  ELSIF NEW.status = 'declined' AND OLD.status = 'pending_offer' THEN
    -- Loan was declined - notify lender (target_role = 'lender')
    INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
    VALUES (
      NEW.lender_id,
      'loan_accepted',
      'Loan Offer Declined',
      COALESCE(v_borrower_name, 'The borrower') || ' has declined your loan offer.' ||
        CASE WHEN NEW.decline_reason IS NOT NULL THEN ' Reason: ' || NEW.decline_reason ELSE '' END,
      '/l/loans/' || NEW.id::TEXT,
      'lender'
    );
  ELSIF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Notify borrower (target_role = 'borrower')
    IF v_borrower_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
      VALUES (v_borrower_user_id, 'loan_accepted', 'Loan fully repaid!', 'Congratulations! You have successfully repaid your loan.', '/b/loans', 'borrower');
    END IF;
    -- Notify lender (target_role = 'lender')
    INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
    VALUES (NEW.lender_id, 'loan_accepted', 'Loan fully repaid', 'Your loan to ' || COALESCE(v_borrower_name, 'borrower') || ' has been fully repaid.', '/l/loans/' || NEW.id::TEXT, 'lender');
  ELSIF NEW.status = 'defaulted' AND OLD.status != 'defaulted' THEN
    -- Notify lender (target_role = 'lender')
    INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
    VALUES (NEW.lender_id, 'risk_flag', 'Loan marked as defaulted', 'A loan to ' || COALESCE(v_borrower_name, 'borrower') || ' has been marked as defaulted.', '/l/loans/' || NEW.id::TEXT, 'lender');
  END IF;

  RETURN NEW;
END;
$func$;

-- Update notify_borrower_of_loan_offer to set target_role = 'borrower'
CREATE OR REPLACE FUNCTION public.notify_borrower_of_loan_offer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_borrower_user_id UUID;
  v_lender_name TEXT;
  v_currency_symbol TEXT;
  v_amount DECIMAL;
BEGIN
  -- Only notify if the loan requires borrower acceptance
  IF NEW.requires_borrower_acceptance = TRUE AND NEW.status = 'pending_offer' THEN
    -- Get the borrower's user_id if they have an account
    SELECT user_id INTO v_borrower_user_id
    FROM public.borrower_user_links
    WHERE borrower_id = NEW.borrower_id;

    IF v_borrower_user_id IS NOT NULL THEN
      -- Get lender name
      SELECT COALESCE(l.business_name, 'A lender') INTO v_lender_name
      FROM public.lenders l
      WHERE l.user_id = NEW.lender_id;

      -- Calculate amount in major units
      v_amount := COALESCE(NEW.principal_minor, 0) / 100.0;

      -- Get currency symbol
      SELECT cca.currency_symbol INTO v_currency_symbol
      FROM public.country_currency_allowed cca
      WHERE cca.country_code = NEW.country_code
      LIMIT 1;

      -- Create notification for borrower with target_role = 'borrower'
      INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
      VALUES (
        v_borrower_user_id,
        'loan_offer_received',
        'New Loan Offer',
        v_lender_name || ' has offered you a loan of ' || COALESCE(v_currency_symbol, '') || v_amount::TEXT || '. Review and accept or decline.',
        '/b/loans/offers',
        'borrower'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Update existing loan-related notifications to have proper target_role
-- Lender notifications (link starts with /l/)
UPDATE public.notifications
SET target_role = 'lender'
WHERE (target_role IS NULL OR target_role = 'all')
  AND link LIKE '/l/%';

-- Borrower notifications (link starts with /b/)
UPDATE public.notifications
SET target_role = 'borrower'
WHERE (target_role IS NULL OR target_role = 'all')
  AND link LIKE '/b/%';
