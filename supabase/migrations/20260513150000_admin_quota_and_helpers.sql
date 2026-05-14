-- Admin helpers exposed by the audit findings:
--   1. Quota override — admin can reset a lender's monthly cross-lender
--      search quota (e.g. to extend a trial for a friendly early customer,
--      or to undo a misclick). The original quota stays in place; this
--      just clears the usage rows for the current month so the lender
--      gets fresh slots.
--   2. Cron run listing — admin can read the most recent job_runs without
--      leaving the dashboard. RLS already allows admins to SELECT but a
--      dedicated function keeps the API tidy and lets us order/limit
--      consistently.
--
-- The dispute → risk_flag auto-resolution found in the same audit is
-- handled in the UI layer (app/admin/disputes/page.tsx) using the
-- existing resolve_risk_flag RPC, so no schema change is needed for it.

-- (1) Admin: reset cross-lender search quota for one lender for the
-- current month. Returns the number of quota rows that were cleared.
CREATE OR REPLACE FUNCTION public.admin_reset_lender_quota(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id UUID;
  v_is_admin BOOLEAN;
  v_month_year TEXT;
  v_deleted INT;
BEGIN
  v_admin_id := auth.uid();

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_admin_id AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admins can reset quotas';
  END IF;

  v_month_year := TO_CHAR(NOW(), 'YYYY-MM');

  WITH deleted AS (
    DELETE FROM public.lender_searched_borrowers
    WHERE lender_user_id = p_user_id
      AND month_year = v_month_year
    RETURNING id
  )
  SELECT count(*) INTO v_deleted FROM deleted;

  -- Best-effort audit (don't block if audit infra fails for any reason).
  BEGIN
    PERFORM public.create_audit_log(
      p_action := 'update',
      p_action_category := 'admin_quota_reset',
      p_target_type := 'lender',
      p_target_id := p_user_id::TEXT,
      p_metadata := jsonb_build_object(
        'rows_cleared', v_deleted,
        'month', v_month_year,
        'reason', p_reason
      ),
      p_severity := 'info'
    );
  EXCEPTION WHEN OTHERS THEN
    -- Audit failures shouldn't roll back the operational change.
    NULL;
  END;

  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_lender_quota(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.admin_reset_lender_quota IS
  'Admin-only. Clears the calling lender''s cross-lender search quota usage for the current month. Used for trial extensions and goodwill resets.';

-- (2) Admin: list recent cron job_runs. Returns the last N rows ordered
-- newest first. Admin-only via the SECURITY DEFINER + role check pattern.
CREATE OR REPLACE FUNCTION public.admin_recent_job_runs(p_limit INT DEFAULT 20)
RETURNS TABLE (
  id UUID,
  job_name TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  status TEXT,
  error TEXT,
  records_processed INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  v_admin_id := auth.uid();

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_admin_id AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admins can view job runs';
  END IF;

  RETURN QUERY
    SELECT
      jr.id, jr.job_name, jr.started_at, jr.finished_at,
      jr.status::TEXT, jr.error, jr.records_processed
    FROM public.job_runs jr
    ORDER BY jr.started_at DESC
    LIMIT GREATEST(1, LEAST(p_limit, 200));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_recent_job_runs(INT) TO authenticated;

COMMENT ON FUNCTION public.admin_recent_job_runs IS
  'Admin-only. Returns most recent cron job runs for the operations dashboard.';

-- (3) Fix resolve_risk_flag so it stops crashing on admin invocations.
-- The previous version (20251108101641_update_resolve_risk_flag_with_ownership_check)
-- did `SELECT id FROM public.lenders` at the very top of the function.
-- lenders has user_id as PK, not id, so the query raised
-- 'column "id" does not exist' before the role check could short-circuit.
-- This broke dispute resolution: when /admin/disputes calls resolve_risk_flag
-- to release a flag in a borrower's favour, the call failed and the borrower
-- stayed flagged.
--
-- Fix: lender lookup only runs for non-admin callers, and uses user_id.
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

  -- Ownership / country check only for non-admins.
  IF NOT jwt_has_role('admin') THEN
    IF v_country != jwt_country() THEN
      RAISE EXCEPTION 'Cannot resolve flag from different country';
    END IF;

    -- lenders.user_id is the PK; the original code used .id which never existed.
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

  -- Best-effort audit. action enum allows 'resolve_risk'; backfill the
  -- legacy `target` text column to match the new audit_logs schema.
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

COMMENT ON FUNCTION public.resolve_risk_flag IS
  'Resolves a risk flag. Admins can resolve any flag (used by dispute pipeline). Non-admin lenders can only resolve flags they created (LENDER_REPORTED) or where they hold the active loan (SYSTEM_AUTO).';
