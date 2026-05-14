-- Re-apply the resolve_risk_flag admin fix.
--
-- The fix was originally written into 20260513150000_admin_quota_and_helpers.sql
-- but the timestamp had already been recorded as applied on the remote BEFORE
-- the fix was added to the file (Supabase tracks migrations by filename, not
-- content hash). This migration ensures the fix actually reaches production.
--
-- CREATE OR REPLACE is idempotent, so re-running on environments that already
-- have the fix from 20260513150000 is a no-op.
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
  IF NOT (jwt_has_role('lender') OR jwt_has_role('admin')) THEN
    RAISE EXCEPTION 'Only lenders and admins can resolve risk flags';
  END IF;

  SELECT
    rf.borrower_id, rf.country_code, rf.origin, rf.created_by
  INTO v_borrower_id, v_country, v_origin, v_created_by
  FROM public.risk_flags rf
  WHERE rf.id = p_risk_id;

  IF v_borrower_id IS NULL THEN
    RAISE EXCEPTION 'Risk flag not found';
  END IF;

  IF NOT jwt_has_role('admin') THEN
    IF v_country != jwt_country() THEN
      RAISE EXCEPTION 'Cannot resolve flag from different country';
    END IF;

    SELECT user_id INTO v_current_lender_id
    FROM public.lenders
    WHERE user_id = jwt_uid()
      AND country_code = jwt_country();

    IF v_current_lender_id IS NULL THEN
      RAISE EXCEPTION 'Lender not found';
    END IF;

    IF v_origin = 'LENDER_REPORTED' THEN
      IF v_created_by != jwt_uid() THEN
        RAISE EXCEPTION 'Only the lender who reported this flag can resolve it';
      END IF;
    ELSIF v_origin = 'SYSTEM_AUTO' THEN
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

  UPDATE public.risk_flags
  SET resolved_at = NOW(),
      resolved_by = jwt_uid(),
      resolution_reason = p_resolution_reason,
      type = 'CLEARED'
  WHERE id = p_risk_id
    AND resolved_at IS NULL;

  PERFORM public.calculate_borrower_score(v_borrower_id);

  BEGIN
    INSERT INTO public.audit_logs (
      actor_id, actor_role, action, target, target_type, target_id, country_code
    ) VALUES (
      jwt_uid(),
      CASE WHEN jwt_has_role('admin') THEN 'admin'::app_role ELSE 'lender'::app_role END,
      'resolve_risk',
      'risk_flag',
      'risk_flag',
      p_risk_id,
      v_country
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
