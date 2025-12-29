-- Fix notify_lenders_of_matching_request function
-- The old function referenced b.borrower_scores[1].score which doesn't exist
-- The borrowers table has a direct credit_score column instead

CREATE OR REPLACE FUNCTION public.notify_lenders_of_matching_request(p_request_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request record;
  v_search record;
BEGIN
  -- Get request details with borrower's credit score
  SELECT
    lr.*,
    b.credit_score
  INTO v_request
  FROM public.loan_requests lr
  JOIN public.borrowers b ON lr.borrower_id = b.id
  WHERE lr.id = p_request_id;

  -- If no request found, exit early
  IF v_request IS NULL THEN
    RETURN;
  END IF;

  -- Find matching saved searches
  FOR v_search IN
    SELECT * FROM public.lender_saved_searches
    WHERE is_active = TRUE
      AND notify_on_match = TRUE
      AND (min_credit_score IS NULL OR v_request.credit_score >= min_credit_score)
      AND (max_credit_score IS NULL OR v_request.credit_score <= max_credit_score)
      AND (min_amount_minor IS NULL OR v_request.amount_minor >= min_amount_minor)
      AND (max_amount_minor IS NULL OR v_request.amount_minor <= max_amount_minor)
      AND (country_codes IS NULL OR v_request.country_code = ANY(country_codes))
  LOOP
    -- Log notification
    INSERT INTO public.lender_notification_log (lender_id, request_id, saved_search_id)
    VALUES (v_search.lender_id, p_request_id, v_search.id);
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.notify_lenders_of_matching_request IS
  'Notifies lenders with matching saved searches when new loan request is created. Uses borrowers.credit_score column.';
