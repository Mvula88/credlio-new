-- Update resolve_risk_flag function to enforce ownership check
-- Only the lender who created the flag (or gave the loan) can resolve it

CREATE OR REPLACE FUNCTION public.resolve_risk_flag(
  p_risk_id UUID,
  p_resolution_reason TEXT
)
RETURNS VOID AS $$
DECLARE
  v_borrower_id UUID;
  v_country TEXT;
  v_origin risk_origin;
  v_created_by UUID;
  v_loan_lender_id UUID;
  v_current_lender_id UUID;
BEGIN
  -- Check caller is lender or admin
  IF NOT (jwt_has_role('lender') OR jwt_has_role('admin')) THEN
    RAISE EXCEPTION 'Only lenders and admins can resolve risk flags';
  END IF;

  -- Get current lender ID
  SELECT id INTO v_current_lender_id
  FROM public.lenders
  WHERE user_id = jwt_uid()
    AND country_code = jwt_country();

  -- Get flag details
  SELECT
    rf.borrower_id,
    rf.country_code,
    rf.origin,
    rf.created_by
  INTO v_borrower_id, v_country, v_origin, v_created_by
  FROM public.risk_flags rf
  WHERE rf.id = p_risk_id;

  IF v_borrower_id IS NULL THEN
    RAISE EXCEPTION 'Risk flag not found';
  END IF;

  -- Check country match (unless admin)
  IF NOT jwt_has_role('admin') THEN
    IF v_country != jwt_country() THEN
      RAISE EXCEPTION 'Cannot resolve flag from different country';
    END IF;
  END IF;

  -- Verify ownership: Only the lender who created it can resolve
  IF NOT jwt_has_role('admin') THEN
    IF v_origin = 'LENDER_REPORTED' THEN
      -- For manual reports, check if current lender created it
      IF v_created_by != jwt_uid() THEN
        RAISE EXCEPTION 'Only the lender who reported this flag can resolve it';
      END IF;
    ELSIF v_origin = 'SYSTEM_AUTO' THEN
      -- For system flags, check if current lender owns the related loan
      -- Find the loan that triggered this flag
      SELECT l.lender_id INTO v_loan_lender_id
      FROM public.loans l
      WHERE l.borrower_id = v_borrower_id
        AND l.lender_id = v_current_lender_id
        AND l.status = 'active'
      LIMIT 1;

      IF v_loan_lender_id IS NULL THEN
        RAISE EXCEPTION 'Only the lender who gave the loan can resolve this system flag';
      END IF;
    END IF;
  END IF;

  -- Resolve the flag
  UPDATE public.risk_flags
  SET
    resolved_at = NOW(),
    resolved_by = jwt_uid(),
    resolution_reason = p_resolution_reason,
    type = 'CLEARED'
  WHERE id = p_risk_id;

  -- Recalculate score
  PERFORM calculate_borrower_score(v_borrower_id);

  -- Log the action
  INSERT INTO public.audit_logs (actor_id, actor_role, action, target, target_id, country_code)
  VALUES (jwt_uid(), 'lender', 'resolve_risk', 'risk_flag', p_risk_id, v_country);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add helpful comment
COMMENT ON FUNCTION public.resolve_risk_flag IS
'Resolves a risk flag when borrower pays up. Only the lender who created the flag (manual) or gave the loan (auto) can resolve it. History is preserved.';
