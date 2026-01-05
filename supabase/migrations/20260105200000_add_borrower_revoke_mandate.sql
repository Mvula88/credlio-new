-- Add borrower revoke mandate function
-- Allows borrowers to cancel automatic deductions

CREATE OR REPLACE FUNCTION public.revoke_mandate_by_borrower(
  p_mandate_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mandate RECORD;
BEGIN
  -- Get mandate
  SELECT * INTO v_mandate
  FROM public.payment_mandates
  WHERE id = p_mandate_id;

  IF v_mandate IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Mandate not found'
    );
  END IF;

  -- Check if mandate can be cancelled
  IF v_mandate.status IN ('cancelled_borrower', 'cancelled_lender', 'completed') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Mandate has already ended'
    );
  END IF;

  -- Update mandate status
  UPDATE public.payment_mandates
  SET
    status = 'cancelled_borrower',
    cancelled_at = NOW(),
    updated_at = NOW()
  WHERE id = p_mandate_id;

  -- Cancel all pending scheduled deductions
  UPDATE public.scheduled_deductions
  SET
    status = 'cancelled',
    updated_at = NOW()
  WHERE mandate_id = p_mandate_id
    AND status IN ('scheduled', 'failed');

  -- Deactivate payment methods used for this mandate
  UPDATE public.payment_methods
  SET
    is_active = FALSE,
    deactivated_at = NOW()
  WHERE id IN (
    SELECT DISTINCT payment_method_id
    FROM public.scheduled_deductions
    WHERE mandate_id = p_mandate_id
  );

  -- TODO: Send notification to lender about cancellation
  -- INSERT INTO notifications (...)

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Automatic deductions have been cancelled. You must now make manual payments.'
  );
END;
$$;

-- Grant execute to public (borrowers don't need to be logged in)
GRANT EXECUTE ON FUNCTION public.revoke_mandate_by_borrower(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.revoke_mandate_by_borrower(UUID) TO authenticated;

COMMENT ON FUNCTION public.revoke_mandate_by_borrower IS 'Allows borrowers to cancel automatic deduction mandates';
