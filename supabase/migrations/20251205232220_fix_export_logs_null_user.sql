-- Fix export_logs to allow null user_id (for service role calls)
-- and update functions to only log when user_id is available

-- Make user_id nullable
ALTER TABLE public.export_logs ALTER COLUMN user_id DROP NOT NULL;

-- Update export_loans_data to only log when there's a user
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
      l.status::TEXT as status,
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

  -- Only log if there's an authenticated user
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO public.export_logs (user_id, export_type, filters, record_count)
    VALUES (
      auth.uid(),
      'loans',
      json_build_object('status', p_status, 'from_date', p_from_date, 'to_date', p_to_date),
      v_count
    );
  END IF;

  RETURN json_build_object(
    'success', TRUE,
    'count', v_count,
    'data', COALESCE(v_data, '[]'::json)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update export_repayments_data
CREATE OR REPLACE FUNCTION public.export_repayments_data(
  p_loan_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_data JSON;
  v_count INTEGER;
BEGIN
  SELECT json_agg(row_to_json(d)), COUNT(*)
  INTO v_data, v_count
  FROM (
    SELECT
      rs.id as schedule_id,
      l.id as loan_id,
      b.full_name as borrower_name,
      rs.installment_no,
      rs.due_date,
      rs.amount_due_minor / 100.0 as amount_due,
      COALESCE(rs.paid_amount_minor, 0) / 100.0 as amount_paid,
      COALESCE(rs.late_fee_minor, 0) / 100.0 as late_fee,
      rs.status::TEXT as status,
      rs.paid_at::DATE as paid_date,
      rs.is_early_payment,
      l.currency
    FROM public.repayment_schedules rs
    JOIN public.loans l ON l.id = rs.loan_id
    JOIN public.borrowers b ON b.id = l.borrower_id
    WHERE l.lender_id = auth.uid()
    AND (p_loan_id IS NULL OR l.id = p_loan_id)
    AND (p_status IS NULL OR rs.status::TEXT = p_status)
    AND (p_from_date IS NULL OR rs.due_date >= p_from_date)
    AND (p_to_date IS NULL OR rs.due_date <= p_to_date)
    ORDER BY rs.due_date DESC
  ) d;

  IF auth.uid() IS NOT NULL THEN
    INSERT INTO public.export_logs (user_id, export_type, filters, record_count)
    VALUES (
      auth.uid(),
      'repayments',
      json_build_object('loan_id', p_loan_id, 'status', p_status, 'from_date', p_from_date, 'to_date', p_to_date),
      v_count
    );
  END IF;

  RETURN json_build_object(
    'success', TRUE,
    'count', v_count,
    'data', COALESCE(v_data, '[]'::json)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update export_borrowers_data
CREATE OR REPLACE FUNCTION public.export_borrowers_data()
RETURNS JSON AS $$
DECLARE
  v_data JSON;
  v_count INTEGER;
BEGIN
  SELECT json_agg(row_to_json(d)), COUNT(*)
  INTO v_data, v_count
  FROM (
    SELECT DISTINCT
      b.id as borrower_id,
      b.full_name,
      b.phone_e164 as phone,
      b.country_code,
      b.credit_score,
      (SELECT COUNT(*) FROM public.loans l WHERE l.borrower_id = b.id AND l.lender_id = auth.uid()) as total_loans,
      (SELECT COUNT(*) FROM public.loans l WHERE l.borrower_id = b.id AND l.lender_id = auth.uid() AND l.status = 'active') as active_loans,
      (SELECT COUNT(*) FROM public.loans l WHERE l.borrower_id = b.id AND l.lender_id = auth.uid() AND l.status = 'completed') as completed_loans,
      (SELECT COALESCE(SUM(principal_minor), 0) / 100.0 FROM public.loans l WHERE l.borrower_id = b.id AND l.lender_id = auth.uid()) as total_borrowed,
      (SELECT COALESCE(SUM(total_repaid), 0) FROM public.loans l WHERE l.borrower_id = b.id AND l.lender_id = auth.uid()) as total_repaid,
      b.created_at::DATE as registered_date
    FROM public.borrowers b
    JOIN public.loans l ON l.borrower_id = b.id
    WHERE l.lender_id = auth.uid()
    ORDER BY b.full_name
  ) d;

  IF auth.uid() IS NOT NULL THEN
    INSERT INTO public.export_logs (user_id, export_type, record_count)
    VALUES (auth.uid(), 'borrowers', v_count);
  END IF;

  RETURN json_build_object(
    'success', TRUE,
    'count', v_count,
    'data', COALESCE(v_data, '[]'::json)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update export_late_fees_data
CREATE OR REPLACE FUNCTION public.export_late_fees_data(
  p_status TEXT DEFAULT NULL,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_data JSON;
  v_count INTEGER;
BEGIN
  SELECT json_agg(row_to_json(d)), COUNT(*)
  INTO v_data, v_count
  FROM (
    SELECT
      lf.id as fee_id,
      l.id as loan_id,
      b.full_name as borrower_name,
      rs.installment_no,
      rs.due_date,
      lf.days_overdue,
      lf.tier_applied,
      lf.fee_percentage,
      lf.fee_amount_minor / 100.0 as fee_amount,
      lf.status::TEXT as status,
      lf.waiver_reason,
      lf.created_at::DATE as applied_date,
      l.currency
    FROM public.late_fees lf
    JOIN public.repayment_schedules rs ON rs.id = lf.schedule_id
    JOIN public.loans l ON l.id = lf.loan_id
    JOIN public.borrowers b ON b.id = l.borrower_id
    WHERE l.lender_id = auth.uid()
    AND (p_status IS NULL OR lf.status::TEXT = p_status)
    AND (p_from_date IS NULL OR lf.created_at::DATE >= p_from_date)
    AND (p_to_date IS NULL OR lf.created_at::DATE <= p_to_date)
    ORDER BY lf.created_at DESC
  ) d;

  IF auth.uid() IS NOT NULL THEN
    INSERT INTO public.export_logs (user_id, export_type, filters, record_count)
    VALUES (
      auth.uid(),
      'late_fees',
      json_build_object('status', p_status, 'from_date', p_from_date, 'to_date', p_to_date),
      v_count
    );
  END IF;

  RETURN json_build_object(
    'success', TRUE,
    'count', v_count,
    'data', COALESCE(v_data, '[]'::json)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  RAISE NOTICE 'Fixed export functions to handle null auth.uid()';
END $$;
