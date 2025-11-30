-- Fix notify_agreement_signature trigger
-- loan_agreements table has loan_id, NOT borrower_id/lender_id
-- Must look up borrower/lender via the loans table

CREATE OR REPLACE FUNCTION public.notify_agreement_signature()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_loan RECORD;
  v_borrower_user_id UUID;
  v_borrower_name TEXT;
  v_lender_name TEXT;
BEGIN
  -- Get loan details (loan_agreements has loan_id, not borrower_id/lender_id)
  SELECT l.borrower_id, l.lender_id
  INTO v_loan
  FROM public.loans l
  WHERE l.id = NEW.loan_id;

  IF v_loan IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get borrower info
  SELECT bul.user_id, b.full_name
  INTO v_borrower_user_id, v_borrower_name
  FROM public.borrowers b
  JOIN public.borrower_user_links bul ON bul.borrower_id = b.id
  WHERE b.id = v_loan.borrower_id;

  -- Get lender name
  SELECT COALESCE(l.business_name, p.full_name, 'Lender')
  INTO v_lender_name
  FROM public.lenders l
  LEFT JOIN public.profiles p ON p.user_id = l.user_id
  WHERE l.user_id = v_loan.lender_id;

  -- Lender signed
  IF NEW.lender_signed_at IS NOT NULL AND (OLD IS NULL OR OLD.lender_signed_at IS NULL) THEN
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
  IF NEW.borrower_signed_at IS NOT NULL AND (OLD IS NULL OR OLD.borrower_signed_at IS NULL) THEN
    PERFORM public.create_notification(
      v_loan.lender_id,
      'agreement_signed_borrower',
      'Borrower signed agreement',
      COALESCE(v_borrower_name, 'Borrower') || ' has signed the loan agreement.',
      '/l/loans/' || NEW.loan_id::TEXT,
      'normal'
    );
  END IF;

  -- Both signed (fully executed)
  IF NEW.lender_signed_at IS NOT NULL AND NEW.borrower_signed_at IS NOT NULL
     AND (OLD IS NULL OR OLD.lender_signed_at IS NULL OR OLD.borrower_signed_at IS NULL) THEN
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
      v_loan.lender_id,
      'agreement_fully_signed',
      'Agreement fully executed',
      'The loan agreement with ' || COALESCE(v_borrower_name, 'borrower') || ' is now fully signed.',
      '/l/loans/' || NEW.loan_id::TEXT,
      'normal'
    );
  END IF;

  RETURN NEW;
END;
$func$;

-- Recreate trigger
DROP TRIGGER IF EXISTS trigger_notify_agreement_signature ON public.loan_agreements;
CREATE TRIGGER trigger_notify_agreement_signature
  AFTER INSERT OR UPDATE ON public.loan_agreements
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_agreement_signature();
