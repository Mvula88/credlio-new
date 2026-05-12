-- Allow a borrower to hold multiple ACTIVE loans across different lenders.
--
-- Previous behaviour:
--   A partial unique index (uniq_active_loan_per_borrower) made it impossible
--   for a borrower to have more than one loan with status='active' at a time.
--   accept_offer (and the older create-loan paths) also raised an exception
--   when a second active loan was attempted.
--
--   This was over-strict for the informal cashloan market — lenders can
--   legitimately want to lend to a borrower who already has another small
--   active loan, knowing the full debt picture from the affordability page
--   and risk flags. The lender should decide, not the database.
--
-- New rule:
--   A borrower can hold any number of ACTIVE loans concurrently. The decision
--   to lend stays with the lender, who can see the borrower's full debt and
--   risk profile via the affordability/credit-intelligence views.
--
--   What we DO still prevent is two loans being created in parallel for the
--   same borrower (race condition where two lenders both finalise a loan in
--   the same instant before either has visibility into the other). The
--   pending_offer state is the in-progress window: a lender direct-creates
--   a loan as pending_offer while waiting for the borrower to confirm, and
--   while that's open no other in-progress creation can be started for the
--   same borrower. Once the borrower accepts (status flips to active) or
--   declines, the next creation can proceed.

-- (1) Drop the old strict rule.
DROP INDEX IF EXISTS public.uniq_active_loan_per_borrower;

-- (2) Replace with a race-condition guard on pending_offer only.
-- Partial unique index = at most one row per borrower while status =
-- 'pending_offer'. Multiple 'active' rows are now permitted.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_offer_per_borrower
  ON public.loans (borrower_id)
  WHERE status = 'pending_offer';

COMMENT ON INDEX public.uniq_pending_offer_per_borrower IS
  'Allows multiple active loans per borrower; prevents two concurrent in-progress loan creations for the same borrower.';

-- (3) Update accept_offer so it no longer rejects when an active loan
-- already exists. It still rejects when a pending_offer is in flight,
-- because allowing that would conflict with the unique index above and
-- would also mean a borrower could be mid-creation with two lenders at
-- once. The "whoever comes first" rule the user described.
CREATE OR REPLACE FUNCTION public.accept_offer(p_offer_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request_id UUID;
  v_borrower_id UUID;
  v_borrower_user_id UUID;
  v_country TEXT;
  v_currency TEXT;
  v_lender_id UUID;
  v_principal BIGINT;
  v_apr_bps INT;
  v_term_months INT;
  v_fees_minor BIGINT;
  v_new_loan_id UUID;
  v_monthly_payment BIGINT;
  v_total_interest BIGINT;
  v_monthly_principal BIGINT;
  v_monthly_interest BIGINT;
BEGIN
  SELECT
    o.request_id,
    o.lender_id,
    o.amount_minor,
    o.apr_bps,
    o.term_months,
    o.fees_minor,
    r.borrower_id,
    r.borrower_user_id,
    r.country_code,
    r.currency
  INTO
    v_request_id,
    v_lender_id,
    v_principal,
    v_apr_bps,
    v_term_months,
    v_fees_minor,
    v_borrower_id,
    v_borrower_user_id,
    v_country,
    v_currency
  FROM public.loan_offers o
  JOIN public.loan_requests r ON r.id = o.request_id
  WHERE o.id = p_offer_id
  FOR UPDATE;

  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'Offer not found';
  END IF;

  IF v_borrower_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the borrower who made the request can accept offers';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.loan_offers
    WHERE id = p_offer_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Offer is no longer available';
  END IF;

  -- RACE-CONDITION GUARD (replaces the old "active loan exists" block):
  -- Reject only if another loan creation is currently in flight for this
  -- borrower (i.e. a pending_offer is open with some lender). Multiple
  -- concurrent ACTIVE loans are now permitted.
  IF EXISTS (
    SELECT 1 FROM public.loans
    WHERE borrower_id = v_borrower_id
      AND status = 'pending_offer'
  ) THEN
    RAISE EXCEPTION 'You have another loan offer pending acceptance. Confirm or decline it before accepting this one.';
  END IF;

  UPDATE public.loan_offers
    SET status = 'accepted',
        updated_at = NOW()
  WHERE id = p_offer_id;

  UPDATE public.loan_offers
    SET status = 'declined',
        updated_at = NOW()
  WHERE request_id = v_request_id
    AND id != p_offer_id
    AND status = 'pending';

  v_new_loan_id := uuid_generate_v4();

  INSERT INTO public.loans (
    id, borrower_id, lender_id, request_id, country_code, currency,
    principal_minor, apr_bps, fees_minor, term_months,
    start_date, end_date, status, total_repaid_minor, created_at
  ) VALUES (
    v_new_loan_id, v_borrower_id, v_lender_id, v_request_id, v_country, v_currency,
    v_principal, v_apr_bps, COALESCE(v_fees_minor, 0), v_term_months,
    CURRENT_DATE, CURRENT_DATE + make_interval(months => v_term_months),
    'active', 0, NOW()
  );

  v_total_interest := (v_principal * v_apr_bps * v_term_months) / (10000 * 12);
  v_monthly_payment := (v_principal + v_total_interest + COALESCE(v_fees_minor, 0)) / v_term_months;
  v_monthly_principal := v_principal / v_term_months;
  v_monthly_interest := v_total_interest / v_term_months;

  FOR i IN 1..v_term_months LOOP
    INSERT INTO public.repayment_schedules (
      loan_id, installment_no, due_date, amount_due_minor,
      principal_minor, interest_minor, created_at
    ) VALUES (
      v_new_loan_id, i, CURRENT_DATE + make_interval(months => i),
      v_monthly_payment, v_monthly_principal, v_monthly_interest, NOW()
    );
  END LOOP;

  UPDATE public.loan_requests
    SET status = 'accepted',
        accepted_offer_id = p_offer_id,
        updated_at = NOW()
  WHERE id = v_request_id;

  RETURN v_new_loan_id;
END;
$$;

COMMENT ON FUNCTION public.accept_offer IS
  'Borrower accepts a marketplace offer. Allows multiple concurrent active loans; only rejects if a pending_offer is currently mid-creation for the same borrower.';
