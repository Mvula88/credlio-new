-- Fix the notify_loan_offer_status_change trigger to use valid enum values
-- 'rejected' is not a valid offer_status - use 'declined' or 'withdrawn' instead

CREATE OR REPLACE FUNCTION public.notify_loan_offer_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_borrower_user_id UUID;
  v_borrower_name TEXT;
BEGIN
  -- Only fire when status changes
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Get borrower info
  SELECT lr.borrower_user_id, b.full_name
  INTO v_borrower_user_id, v_borrower_name
  FROM public.loan_requests lr
  JOIN public.borrowers b ON lr.borrower_id = b.id
  WHERE lr.id = NEW.request_id;

  IF NEW.status = 'accepted' THEN
    -- Notify lender that their offer was accepted
    PERFORM public.create_notification(
      NEW.lender_id,
      'loan_accepted',
      'Your loan offer was accepted!',
      COALESCE(v_borrower_name, 'A borrower') || ' has accepted your loan offer of $' || (NEW.amount_minor / 100)::TEXT,
      '/l/loans',
      'high',
      'View Loan',
      '/l/loans'
    );
  ELSIF NEW.status = 'declined' THEN
    -- Notify lender that their offer was declined by borrower
    PERFORM public.create_notification(
      NEW.lender_id,
      'loan_rejected',
      'Loan offer not accepted',
      'Your loan offer of $' || (NEW.amount_minor / 100)::TEXT || ' was not accepted by the borrower.',
      '/l/marketplace',
      'normal',
      'View Marketplace',
      '/l/marketplace'
    );
  ELSIF NEW.status = 'withdrawn' THEN
    -- Notify lender that the offer was withdrawn (borrower cancelled)
    PERFORM public.create_notification(
      NEW.lender_id,
      'loan_rejected',
      'Loan cancelled by borrower',
      'The borrower cancelled the loan. Your offer of $' || (NEW.amount_minor / 100)::TEXT || ' has been withdrawn.',
      '/l/marketplace',
      'normal',
      'View Marketplace',
      '/l/marketplace'
    );
  END IF;

  RETURN NEW;
END;
$func$;

-- Now fix existing cancelled loans: update their offers from 'accepted' to 'withdrawn'
UPDATE public.loan_offers
SET status = 'withdrawn'::offer_status,
    updated_at = NOW()
WHERE status = 'accepted'::offer_status
  AND request_id IN (
    SELECT lr.id
    FROM public.loan_requests lr
    JOIN public.loans l ON l.request_id = lr.id
    WHERE l.status = 'cancelled'
  );
