-- Add signed agreement upload support for legal enforceability
-- Both borrower and lender must upload signed copy after physical signature

-- Add columns for signed agreements
ALTER TABLE public.loan_agreements
ADD COLUMN IF NOT EXISTS borrower_signed_url TEXT,
ADD COLUMN IF NOT EXISTS borrower_signed_hash TEXT,
ADD COLUMN IF NOT EXISTS borrower_signed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS lender_signed_url TEXT,
ADD COLUMN IF NOT EXISTS lender_signed_hash TEXT,
ADD COLUMN IF NOT EXISTS lender_signed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS fully_signed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS fully_signed_at TIMESTAMPTZ;

-- Add comments
COMMENT ON COLUMN public.loan_agreements.borrower_signed_url IS
'URL to borrower''s signed agreement (photo/PDF of physically signed document)';

COMMENT ON COLUMN public.loan_agreements.borrower_signed_hash IS
'SHA-256 hash of borrower''s signed document for tamper detection';

COMMENT ON COLUMN public.loan_agreements.borrower_signed_at IS
'When borrower uploaded their signed copy';

COMMENT ON COLUMN public.loan_agreements.lender_signed_url IS
'URL to lender''s signed agreement (photo/PDF of physically signed document)';

COMMENT ON COLUMN public.loan_agreements.lender_signed_hash IS
'SHA-256 hash of lender''s signed document for tamper detection';

COMMENT ON COLUMN public.loan_agreements.lender_signed_at IS
'When lender uploaded their signed copy';

COMMENT ON COLUMN public.loan_agreements.fully_signed IS
'TRUE when both parties have uploaded signed copies';

COMMENT ON COLUMN public.loan_agreements.fully_signed_at IS
'When the agreement became fully signed by both parties';

-- Create indexes for quick lookups
CREATE INDEX IF NOT EXISTS idx_loan_agreements_borrower_signed
ON public.loan_agreements(borrower_signed_at) WHERE borrower_signed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_loan_agreements_lender_signed
ON public.loan_agreements(lender_signed_at) WHERE lender_signed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_loan_agreements_fully_signed
ON public.loan_agreements(fully_signed) WHERE fully_signed = TRUE;

-- Function to mark agreement as fully signed when both parties upload
CREATE OR REPLACE FUNCTION public.check_agreement_fully_signed()
RETURNS TRIGGER AS $$
BEGIN
  -- If both parties have signed, mark as fully signed
  IF NEW.borrower_signed_at IS NOT NULL AND NEW.lender_signed_at IS NOT NULL THEN
    NEW.fully_signed := TRUE;

    -- Set fully_signed_at to the later of the two signatures
    IF NEW.fully_signed_at IS NULL THEN
      NEW.fully_signed_at := GREATEST(NEW.borrower_signed_at, NEW.lender_signed_at);
    END IF;
  ELSE
    NEW.fully_signed := FALSE;
    NEW.fully_signed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update fully_signed status
DROP TRIGGER IF EXISTS trigger_check_agreement_fully_signed ON public.loan_agreements;
CREATE TRIGGER trigger_check_agreement_fully_signed
  BEFORE INSERT OR UPDATE OF borrower_signed_at, lender_signed_at
  ON public.loan_agreements
  FOR EACH ROW
  EXECUTE FUNCTION public.check_agreement_fully_signed();

-- Function for borrower to upload signed agreement
CREATE OR REPLACE FUNCTION public.upload_borrower_signed_agreement(
  p_agreement_id UUID,
  p_signed_url TEXT,
  p_signed_hash TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_loan_id UUID;
  v_borrower_id UUID;
  v_current_user_id UUID;
BEGIN
  -- Get current user
  v_current_user_id := auth.uid();

  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get loan_id and verify user is the borrower
  SELECT la.loan_id INTO v_loan_id
  FROM public.loan_agreements la
  JOIN public.loans l ON l.id = la.loan_id
  WHERE la.id = p_agreement_id;

  IF v_loan_id IS NULL THEN
    RAISE EXCEPTION 'Agreement not found';
  END IF;

  -- Check if user is the borrower for this loan
  SELECT l.borrower_id INTO v_borrower_id
  FROM public.loans l
  WHERE l.id = v_loan_id;

  -- Verify user owns this borrower account
  IF NOT EXISTS (
    SELECT 1 FROM public.borrowers b
    WHERE b.id = v_borrower_id AND b.user_id = v_current_user_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: You are not the borrower for this loan';
  END IF;

  -- Update with signed agreement
  UPDATE public.loan_agreements
  SET
    borrower_signed_url = p_signed_url,
    borrower_signed_hash = p_signed_hash,
    borrower_signed_at = NOW()
  WHERE id = p_agreement_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for lender to upload signed agreement
CREATE OR REPLACE FUNCTION public.upload_lender_signed_agreement(
  p_agreement_id UUID,
  p_signed_url TEXT,
  p_signed_hash TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_loan_id UUID;
  v_lender_id UUID;
  v_current_user_id UUID;
BEGIN
  -- Get current user
  v_current_user_id := auth.uid();

  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get loan_id and verify user is the lender
  SELECT la.loan_id INTO v_loan_id
  FROM public.loan_agreements la
  WHERE la.id = p_agreement_id;

  IF v_loan_id IS NULL THEN
    RAISE EXCEPTION 'Agreement not found';
  END IF;

  -- Get lender_id and verify it's the current user
  SELECT l.lender_id INTO v_lender_id
  FROM public.loans l
  WHERE l.id = v_loan_id;

  IF v_lender_id != v_current_user_id THEN
    RAISE EXCEPTION 'Unauthorized: You are not the lender for this loan';
  END IF;

  -- Update with signed agreement
  UPDATE public.loan_agreements
  SET
    lender_signed_url = p_signed_url,
    lender_signed_hash = p_signed_hash,
    lender_signed_at = NOW()
  WHERE id = p_agreement_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.upload_borrower_signed_agreement(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upload_lender_signed_agreement(UUID, TEXT, TEXT) TO authenticated;

-- Add RLS policies for viewing signed agreements
-- Borrowers can view their signed agreements
CREATE POLICY "Borrowers can view their signed agreements"
ON public.loan_agreements
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.loans l
    JOIN public.borrowers b ON b.id = l.borrower_id
    WHERE l.id = loan_agreements.loan_id
    AND b.user_id = auth.uid()
  )
);

-- Lenders can view their signed agreements
CREATE POLICY "Lenders can view their signed agreements"
ON public.loan_agreements
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.loans l
    WHERE l.id = loan_agreements.loan_id
    AND l.lender_id = auth.uid()
  )
);

-- Admins can view all signed agreements
CREATE POLICY "Admins can view all signed agreements"
ON public.loan_agreements
FOR SELECT
TO authenticated
USING (
  jwt_role() = 'admin'
);
