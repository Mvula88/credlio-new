-- Fix borrower signed agreement upload authentication
-- The original function checked borrowers.user_id which doesn't exist
-- Borrowers are linked via borrower_user_links table

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

  -- Get loan_id from agreement
  SELECT la.loan_id INTO v_loan_id
  FROM public.loan_agreements la
  WHERE la.id = p_agreement_id;

  IF v_loan_id IS NULL THEN
    RAISE EXCEPTION 'Agreement not found';
  END IF;

  -- Get borrower_id from loan
  SELECT l.borrower_id INTO v_borrower_id
  FROM public.loans l
  WHERE l.id = v_loan_id;

  -- Verify user is linked to this borrower via borrower_user_links table
  IF NOT EXISTS (
    SELECT 1 FROM public.borrower_user_links bul
    WHERE bul.borrower_id = v_borrower_id
    AND bul.user_id = v_current_user_id
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.upload_borrower_signed_agreement(UUID, TEXT, TEXT) TO authenticated;
