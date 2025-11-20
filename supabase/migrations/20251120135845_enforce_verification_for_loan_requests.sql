-- ENFORCE VERIFICATION FOR LOAN REQUESTS
-- Only allow verified borrowers to create loan requests

-- Create a function to check if borrower is verified
CREATE OR REPLACE FUNCTION public.check_borrower_verified()
RETURNS TRIGGER AS $$
DECLARE
  v_verification_status TEXT;
BEGIN
  -- Get the borrower's verification status
  SELECT verification_status INTO v_verification_status
  FROM public.borrower_self_verification_status
  WHERE borrower_id = NEW.borrower_id;

  -- Block if not approved
  IF v_verification_status IS NULL OR v_verification_status != 'approved' THEN
    RAISE EXCEPTION 'Borrower must complete identity verification before creating loan requests. Current status: %',
      COALESCE(v_verification_status, 'incomplete');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to enforce verification on loan request creation
DROP TRIGGER IF EXISTS enforce_borrower_verification ON public.loan_requests;

CREATE TRIGGER enforce_borrower_verification
  BEFORE INSERT ON public.loan_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.check_borrower_verified();

-- Add helpful comment
COMMENT ON FUNCTION public.check_borrower_verified() IS
  'Enforces that only verified borrowers (verification_status = approved) can create loan requests';
