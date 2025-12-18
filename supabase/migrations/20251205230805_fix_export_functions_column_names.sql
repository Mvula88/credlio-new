-- Fix export_loans_data function to use correct column names
-- The function was referencing non-existent columns: interest_rate, monthly_payment_minor

CREATE OR REPLACE FUNCTION public.export_loans_data(
  p_status TEXT DEFAULT NULL,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_data JSON;
  v_count INTEGER;
BEGIN
  -- Get loan data for this lender
  SELECT json_agg(row_to_json(d)), COUNT(*)
  INTO v_data, v_count
  FROM (
    SELECT
      l.id as loan_id,
      b.full_name as borrower_name,
      b.phone_e164 as borrower_phone,
      l.principal_minor / 100.0 as principal,
      l.base_rate_percent as interest_rate,
      l.total_interest_percent as total_interest_rate,
      l.term_months,
      l.payment_type,
      l.num_installments,
      l.total_amount_minor / 100.0 as total_amount,
      l.total_repaid as total_repaid,
      (l.total_amount_minor / 100.0) - COALESCE(l.total_repaid, 0) as remaining_balance,
      l.status,
      l.currency,
      l.created_at::DATE as created_date,
      l.start_date,
      l.end_date,
      l.disbursed_at::DATE as disbursed_date,
      l.completed_at::DATE as completed_date,
      l.purpose,
      (SELECT COUNT(*) FROM public.repayment_schedules rs
       WHERE rs.loan_id = l.id AND rs.status = 'paid') as installments_paid,
      (SELECT COUNT(*) FROM public.repayment_schedules rs
       WHERE rs.loan_id = l.id AND rs.status IN ('overdue', 'pending')) as installments_remaining
    FROM public.loans l
    JOIN public.borrowers b ON b.id = l.borrower_id
    WHERE l.lender_id = auth.uid()
    AND (p_status IS NULL OR l.status::TEXT = p_status)
    AND (p_from_date IS NULL OR l.created_at::DATE >= p_from_date)
    AND (p_to_date IS NULL OR l.created_at::DATE <= p_to_date)
    ORDER BY l.created_at DESC
  ) d;

  -- Log the export
  INSERT INTO public.export_logs (user_id, export_type, filters, record_count)
  VALUES (
    auth.uid(),
    'loans',
    json_build_object('status', p_status, 'from_date', p_from_date, 'to_date', p_to_date),
    v_count
  );

  RETURN json_build_object(
    'success', TRUE,
    'count', v_count,
    'data', COALESCE(v_data, '[]'::json)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  RAISE NOTICE 'Fixed export_loans_data function column names';
END $$;
