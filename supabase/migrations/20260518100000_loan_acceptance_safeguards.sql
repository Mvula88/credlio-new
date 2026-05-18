-- Loan-acceptance safeguards: in-flight visibility + 48h cooling-off +
-- borrower acknowledgment of parallel loans.
--
-- WHY: today nothing stops a borrower from accepting offer A (status →
-- pending_signatures), then immediately posting a new loan request the
-- next minute and accepting offer Z from a different lender. By the time
-- either loan reaches `active`, both lenders have already disbursed and
-- the borrower has 2× the cash. This migration adds three soft locks
-- that close that window without breaking the marketplace dynamic
-- (multiple lenders bidding on one request remains fine).
--
-- Pieces:
--   1. New columns on `loans` capturing what the borrower saw + clicked
--      through at the moment of acceptance. Audit trail for disputes.
--   2. SECURITY DEFINER RPC `get_borrower_inflight_loans` so any lender
--      vetting a borrower can see who else has a loan in pending_signatures
--      or pending_disbursement with them.
--   3. `accept_loan_offer` updated with two new checks:
--      a) 48h cooling-off — borrower cannot accept a second offer within
--         48h of their most recent acceptance unless that loan is now
--         active or completed.
--      b) Acknowledgment requirement — when in-flight loans exist, caller
--         must pass `p_acknowledged_inflight = true` or the function
--         refuses.

BEGIN;

-- 1. Acknowledgment audit columns. We store both the boolean (did they
-- click through?) and a JSONB snapshot of WHAT they were shown at click
-- time. The snapshot is what a dispute will hinge on.
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS borrower_acknowledged_inflight_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS borrower_acknowledged_inflight_snapshot JSONB;

COMMENT ON COLUMN public.loans.borrower_acknowledged_inflight_at IS
  'Set when the borrower clicked through a confirmation that they have other in-progress loans at the time of accepting this one.';
COMMENT ON COLUMN public.loans.borrower_acknowledged_inflight_snapshot IS
  'JSONB snapshot of the other in-progress loans the borrower was shown at the moment they accepted this one. Evidence in a later dispute.';

-- 2. Cross-lender in-flight loans RPC.
-- "In-flight" = post-accept, pre-active. Statuses: pending_signatures,
-- pending_disbursement. Active loans are visible via the existing
-- borrower_unpaid_summary path. Once a loan hits final states
-- (completed/defaulted/declined/cancelled) it's no longer in-flight.
CREATE OR REPLACE FUNCTION public.get_borrower_inflight_loans(p_borrower_id UUID)
RETURNS TABLE (
  loan_id UUID,
  lender_id UUID,
  lender_name TEXT,
  status TEXT,
  principal_minor BIGINT,
  currency TEXT,
  country_code TEXT,
  borrower_accepted_at TIMESTAMPTZ,
  hours_since_accept NUMERIC,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.lender_id,
    COALESCE(lp.business_name, pp.full_name, 'Lender')::TEXT,
    l.status::TEXT,
    l.principal_minor,
    l.currency,
    l.country_code,
    l.borrower_accepted_at,
    EXTRACT(EPOCH FROM (NOW() - COALESCE(l.borrower_accepted_at, l.created_at))) / 3600,
    l.created_at
  FROM public.loans l
  LEFT JOIN public.lenders lp ON lp.user_id = l.lender_id
  LEFT JOIN public.profiles pp ON pp.user_id = l.lender_id
  WHERE l.borrower_id = p_borrower_id
    AND l.status IN ('pending_signatures', 'pending_disbursement')
  ORDER BY COALESCE(l.borrower_accepted_at, l.created_at) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_borrower_inflight_loans(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_borrower_inflight_loans IS
  'Returns loans currently in pending_signatures or pending_disbursement state for a borrower, across all lenders. Used by lender-side warnings and the borrower acknowledgment flow.';

-- 3. Replace accept_loan_offer with cooling-off + acknowledgment checks.
-- Keeps the existing happy path; adds two refusal paths before it.
DROP FUNCTION IF EXISTS public.accept_loan_offer(UUID);
DROP FUNCTION IF EXISTS public.accept_loan_offer(UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION public.accept_loan_offer(
  p_loan_id UUID,
  p_acknowledged_inflight BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_loan RECORD;
  v_borrower_user_id UUID;
  v_current_user_id UUID;
  v_recent_accept RECORD;
  v_hours_since_recent NUMERIC;
  v_inflight_count INT;
  v_inflight_snapshot JSONB;
BEGIN
  v_current_user_id := auth.uid();

  SELECT l.*, b.id as b_id, b.full_name as borrower_name
  INTO v_loan
  FROM public.loans l
  JOIN public.borrowers b ON l.borrower_id = b.id
  WHERE l.id = p_loan_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Loan not found');
  END IF;

  IF v_loan.status != 'pending_offer' THEN
    RETURN json_build_object('success', false, 'error', 'This loan is not awaiting acceptance');
  END IF;

  SELECT user_id INTO v_borrower_user_id
  FROM public.borrower_user_links
  WHERE borrower_id = v_loan.borrower_id AND user_id = v_current_user_id;

  IF v_borrower_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'You are not authorized to accept this loan');
  END IF;

  -- CHECK A: 48-hour cooling-off. Look for the borrower's most recent
  -- acceptance that is NOT yet in a final state. If it's within 48h, block.
  -- "Final state" = active, completed, defaulted, declined, cancelled.
  -- A loan that's been active for >0 minutes is fair game — the cooling
  -- off only applies to in-flight (accepted but not yet active) loans.
  SELECT l2.id, l2.borrower_accepted_at, l2.status, l2.lender_id
  INTO v_recent_accept
  FROM public.loans l2
  WHERE l2.borrower_id = v_loan.borrower_id
    AND l2.id <> p_loan_id
    AND l2.borrower_accepted_at IS NOT NULL
    AND l2.borrower_accepted_at > NOW() - INTERVAL '48 hours'
    AND l2.status IN ('pending_signatures', 'pending_disbursement')
  ORDER BY l2.borrower_accepted_at DESC
  LIMIT 1;

  IF v_recent_accept.id IS NOT NULL THEN
    v_hours_since_recent := EXTRACT(EPOCH FROM (NOW() - v_recent_accept.borrower_accepted_at)) / 3600;
    RETURN json_build_object(
      'success', false,
      'error', FORMAT(
        'You accepted another loan offer %s hours ago, and it has not yet been disbursed. To prevent accidentally taking on more debt than you can manage, you must wait %s hours before accepting another loan.',
        ROUND(v_hours_since_recent, 1)::TEXT,
        CEIL(48 - v_hours_since_recent)::TEXT
      ),
      'cooling_off_hours_remaining', CEIL(48 - v_hours_since_recent),
      'blocking_loan_id', v_recent_accept.id
    );
  END IF;

  -- CHECK B: Build the in-flight snapshot. If there are any in-flight
  -- loans with other lenders, the borrower must have acknowledged them.
  SELECT
    COUNT(*),
    jsonb_agg(jsonb_build_object(
      'loan_id', loan_id,
      'lender_id', lender_id,
      'lender_name', lender_name,
      'status', status,
      'principal_minor', principal_minor,
      'currency', currency,
      'borrower_accepted_at', borrower_accepted_at
    ))
  INTO v_inflight_count, v_inflight_snapshot
  FROM public.get_borrower_inflight_loans(v_loan.borrower_id)
  WHERE loan_id <> p_loan_id;

  IF v_inflight_count > 0 AND NOT p_acknowledged_inflight THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You have other loans in progress. You must acknowledge them before accepting this offer.',
      'requires_acknowledgment', true,
      'inflight_loans', v_inflight_snapshot
    );
  END IF;

  -- Happy path: do the accept.
  UPDATE public.loans
  SET
    status = 'pending_signatures',
    borrower_accepted_at = NOW(),
    borrower_acknowledged_inflight_at = CASE
      WHEN v_inflight_count > 0 THEN NOW()
      ELSE NULL
    END,
    borrower_acknowledged_inflight_snapshot = CASE
      WHEN v_inflight_count > 0 THEN v_inflight_snapshot
      ELSE NULL
    END,
    updated_at = NOW()
  WHERE id = p_loan_id;

  PERFORM public.generate_loan_agreement(p_loan_id);

  RETURN json_build_object(
    'success', true,
    'message', 'Loan offer accepted. Please sign the agreement to activate the loan.',
    'next_step', 'sign_agreement',
    'acknowledged_inflight_count', v_inflight_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_loan_offer(UUID, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.accept_loan_offer IS
  'Borrower accepts a pending_offer loan. Enforces 48h cooling-off after a previous accept and requires explicit acknowledgment of any other in-flight loans. The snapshot of acknowledged loans is stored on the row for dispute evidence.';

COMMIT;
