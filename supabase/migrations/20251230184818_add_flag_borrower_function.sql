-- Create a function for lenders to flag borrowers
-- This uses SECURITY DEFINER to bypass RLS and validates the lender properly
-- IMPORTANT: Enforces country isolation - lenders can only flag borrowers in their own country

CREATE OR REPLACE FUNCTION public.flag_borrower(
  p_borrower_id UUID,
  p_type TEXT,
  p_reason TEXT,
  p_amount_at_issue_minor INTEGER DEFAULT NULL,
  p_proof_url TEXT DEFAULT NULL,
  p_proof_sha256 TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_lender_record RECORD;
  v_borrower_record RECORD;
  v_flag_id UUID;
BEGIN
  -- Get the current user ID
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Check if user is a lender and get their country
  SELECT id, user_id, country_code
  INTO v_lender_record
  FROM public.lenders
  WHERE user_id = v_user_id;

  IF v_lender_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Only lenders can flag borrowers');
  END IF;

  IF v_lender_record.country_code IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Lender country not set');
  END IF;

  -- Get borrower and their country
  SELECT id, country_code
  INTO v_borrower_record
  FROM public.borrowers
  WHERE id = p_borrower_id;

  IF v_borrower_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Borrower not found');
  END IF;

  -- COUNTRY ISOLATION: Lender can only flag borrowers in their own country
  IF v_borrower_record.country_code IS NULL OR v_borrower_record.country_code != v_lender_record.country_code THEN
    RETURN json_build_object('success', false, 'error', 'You can only flag borrowers in your country');
  END IF;

  -- Validate type
  IF p_type NOT IN ('LATE_1_7', 'LATE_8_30', 'LATE_31_60', 'DEFAULT', 'CLEARED') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid risk type');
  END IF;

  -- Insert the risk flag using the BORROWER's country (for proper country isolation)
  -- This ensures flags are visible to all lenders in that country
  INSERT INTO public.risk_flags (
    borrower_id,
    country_code,
    origin,
    type,
    reason,
    amount_at_issue_minor,
    proof_url,
    proof_sha256,
    created_by
  ) VALUES (
    p_borrower_id,
    v_borrower_record.country_code,  -- Use borrower's country for proper isolation
    'LENDER_REPORTED',
    p_type,
    p_reason,
    p_amount_at_issue_minor,
    p_proof_url,
    p_proof_sha256,
    v_user_id
  )
  RETURNING id INTO v_flag_id;

  RETURN json_build_object(
    'success', true,
    'flag_id', v_flag_id,
    'message', 'Borrower flagged successfully'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.flag_borrower TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.flag_borrower IS 'Allows lenders to flag borrowers as risky. Enforces country isolation - lenders can only flag borrowers in their own country. Uses borrower country for the flag.';
