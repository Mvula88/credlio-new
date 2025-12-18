-- Export Functions for CSV/Excel
-- Database functions to prepare data for export

-- ============================================================================
-- 1. CREATE EXPORT LOGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.export_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  export_type TEXT NOT NULL CHECK (export_type IN (
    'loans', 'repayments', 'borrowers', 'transactions', 'late_fees', 'collateral', 'reports'
  )),
  filters JSONB,               -- What filters were applied
  record_count INTEGER,        -- How many records exported
  file_format TEXT NOT NULL DEFAULT 'csv' CHECK (file_format IN ('csv', 'xlsx', 'json')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own exports" ON public.export_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create export logs" ON public.export_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all exports" ON public.export_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );


-- ============================================================================
-- 2. FUNCTION TO EXPORT LOANS DATA (FOR LENDER)
-- ============================================================================

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
      l.interest_rate,
      l.term_months,
      l.monthly_payment_minor / 100.0 as monthly_payment,
      l.total_repaid / 100.0 as total_repaid,
      l.status,
      l.currency,
      l.created_at::DATE as created_date,
      l.disbursed_at::DATE as disbursed_date,
      l.completed_at::DATE as completed_date,
      (SELECT COALESCE(SUM(amount_due_minor), 0) / 100.0
       FROM public.repayment_schedules rs WHERE rs.loan_id = l.id) as total_due,
      (SELECT COUNT(*) FROM public.repayment_schedules rs
       WHERE rs.loan_id = l.id AND rs.status = 'paid') as installments_paid,
      (SELECT COUNT(*) FROM public.repayment_schedules rs
       WHERE rs.loan_id = l.id AND rs.status IN ('overdue', 'pending')) as installments_remaining
    FROM public.loans l
    JOIN public.borrowers b ON b.id = l.borrower_id
    WHERE l.lender_id = auth.uid()
    AND (p_status IS NULL OR l.status = p_status)
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


-- ============================================================================
-- 3. FUNCTION TO EXPORT REPAYMENTS DATA
-- ============================================================================

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
      rs.status,
      rs.paid_at::DATE as paid_date,
      rs.is_early_payment,
      l.currency
    FROM public.repayment_schedules rs
    JOIN public.loans l ON l.id = rs.loan_id
    JOIN public.borrowers b ON b.id = l.borrower_id
    WHERE l.lender_id = auth.uid()
    AND (p_loan_id IS NULL OR l.id = p_loan_id)
    AND (p_status IS NULL OR rs.status = p_status)
    AND (p_from_date IS NULL OR rs.due_date >= p_from_date)
    AND (p_to_date IS NULL OR rs.due_date <= p_to_date)
    ORDER BY rs.due_date DESC
  ) d;

  -- Log the export
  INSERT INTO public.export_logs (user_id, export_type, filters, record_count)
  VALUES (
    auth.uid(),
    'repayments',
    json_build_object('loan_id', p_loan_id, 'status', p_status, 'from_date', p_from_date, 'to_date', p_to_date),
    v_count
  );

  RETURN json_build_object(
    'success', TRUE,
    'count', v_count,
    'data', COALESCE(v_data, '[]'::json)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 4. FUNCTION TO EXPORT BORROWERS DATA
-- ============================================================================

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
      (SELECT COALESCE(SUM(total_repaid), 0) / 100.0 FROM public.loans l WHERE l.borrower_id = b.id AND l.lender_id = auth.uid()) as total_repaid,
      b.created_at::DATE as registered_date
    FROM public.borrowers b
    JOIN public.loans l ON l.borrower_id = b.id
    WHERE l.lender_id = auth.uid()
    ORDER BY b.full_name
  ) d;

  -- Log the export
  INSERT INTO public.export_logs (user_id, export_type, record_count)
  VALUES (auth.uid(), 'borrowers', v_count);

  RETURN json_build_object(
    'success', TRUE,
    'count', v_count,
    'data', COALESCE(v_data, '[]'::json)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 5. FUNCTION TO EXPORT LATE FEES DATA
-- ============================================================================

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
      lf.status,
      lf.waiver_reason,
      lf.created_at::DATE as applied_date,
      l.currency
    FROM public.late_fees lf
    JOIN public.repayment_schedules rs ON rs.id = lf.schedule_id
    JOIN public.loans l ON l.id = lf.loan_id
    JOIN public.borrowers b ON b.id = l.borrower_id
    WHERE l.lender_id = auth.uid()
    AND (p_status IS NULL OR lf.status = p_status)
    AND (p_from_date IS NULL OR lf.created_at::DATE >= p_from_date)
    AND (p_to_date IS NULL OR lf.created_at::DATE <= p_to_date)
    ORDER BY lf.created_at DESC
  ) d;

  -- Log the export
  INSERT INTO public.export_logs (user_id, export_type, filters, record_count)
  VALUES (
    auth.uid(),
    'late_fees',
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


-- ============================================================================
-- 6. FUNCTION TO EXPORT COLLATERAL DATA
-- ============================================================================

CREATE OR REPLACE FUNCTION public.export_collateral_data(
  p_status TEXT DEFAULT NULL
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
      c.id as collateral_id,
      l.id as loan_id,
      b.full_name as borrower_name,
      c.collateral_type,
      c.description,
      c.serial_number,
      c.registration_number,
      c.estimated_value_minor / 100.0 as estimated_value,
      c.valuation_date,
      c.valuation_method,
      c.is_insured,
      c.insurance_expiry_date,
      c.location_description,
      c.status,
      c.created_at::DATE as added_date,
      l.currency
    FROM public.collaterals c
    JOIN public.borrowers b ON b.id = c.borrower_id
    LEFT JOIN public.loans l ON l.id = c.loan_id
    WHERE l.lender_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.loans l2 WHERE l2.borrower_id = c.borrower_id AND l2.lender_id = auth.uid()
    )
    AND (p_status IS NULL OR c.status = p_status)
    ORDER BY c.created_at DESC
  ) d;

  -- Log the export
  INSERT INTO public.export_logs (user_id, export_type, filters, record_count)
  VALUES (
    auth.uid(),
    'collateral',
    json_build_object('status', p_status),
    v_count
  );

  RETURN json_build_object(
    'success', TRUE,
    'count', v_count,
    'data', COALESCE(v_data, '[]'::json)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 7. FUNCTION FOR ADMIN TO EXPORT PLATFORM SUMMARY
-- ============================================================================

CREATE OR REPLACE FUNCTION public.export_platform_summary(
  p_country_code TEXT DEFAULT NULL,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_summary JSON;
BEGIN
  -- Only admins can call this
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RETURN json_build_object('error', 'Admin access required');
  END IF;

  SELECT json_build_object(
    'period', json_build_object('from', p_from_date, 'to', p_to_date, 'country', p_country_code),
    'loans', json_build_object(
      'total_count', (SELECT COUNT(*) FROM public.loans l
        WHERE (p_country_code IS NULL OR l.country_code = p_country_code)
        AND (p_from_date IS NULL OR l.created_at::DATE >= p_from_date)
        AND (p_to_date IS NULL OR l.created_at::DATE <= p_to_date)),
      'active_count', (SELECT COUNT(*) FROM public.loans l
        WHERE l.status = 'active'
        AND (p_country_code IS NULL OR l.country_code = p_country_code)),
      'completed_count', (SELECT COUNT(*) FROM public.loans l
        WHERE l.status = 'completed'
        AND (p_country_code IS NULL OR l.country_code = p_country_code)),
      'total_disbursed', (SELECT COALESCE(SUM(principal_minor), 0) / 100.0 FROM public.loans l
        WHERE l.status IN ('active', 'completed')
        AND (p_country_code IS NULL OR l.country_code = p_country_code)),
      'total_repaid', (SELECT COALESCE(SUM(total_repaid), 0) / 100.0 FROM public.loans l
        WHERE (p_country_code IS NULL OR l.country_code = p_country_code))
    ),
    'borrowers', json_build_object(
      'total_count', (SELECT COUNT(DISTINCT borrower_id) FROM public.loans l
        WHERE (p_country_code IS NULL OR l.country_code = p_country_code)),
      'avg_credit_score', (SELECT ROUND(AVG(credit_score)) FROM public.borrowers b
        WHERE (p_country_code IS NULL OR b.country_code = p_country_code))
    ),
    'lenders', json_build_object(
      'total_count', (SELECT COUNT(*) FROM public.lenders le
        JOIN public.profiles p ON p.user_id = le.user_id
        WHERE (p_country_code IS NULL OR p.country_code = p_country_code))
    ),
    'late_fees', json_build_object(
      'total_fees', (SELECT COALESCE(SUM(fee_amount_minor), 0) / 100.0 FROM public.late_fees),
      'pending_fees', (SELECT COALESCE(SUM(fee_amount_minor), 0) / 100.0 FROM public.late_fees WHERE status = 'pending'),
      'waived_fees', (SELECT COALESCE(SUM(fee_amount_minor), 0) / 100.0 FROM public.late_fees WHERE status = 'waived')
    ),
    'generated_at', NOW()
  ) INTO v_summary;

  -- Log the export
  INSERT INTO public.export_logs (user_id, export_type, filters, record_count)
  VALUES (
    auth.uid(),
    'reports',
    json_build_object('country_code', p_country_code, 'from_date', p_from_date, 'to_date', p_to_date),
    1
  );

  RETURN v_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Grant permissions
GRANT EXECUTE ON FUNCTION public.export_loans_data(TEXT, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_repayments_data(UUID, TEXT, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_borrowers_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_late_fees_data(TEXT, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_collateral_data(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_platform_summary(TEXT, DATE, DATE) TO authenticated;


-- Log migration
DO $$
BEGIN
  RAISE NOTICE 'Export functions created';
  RAISE NOTICE 'Features: Loans, repayments, borrowers, late fees, collateral exports with filters';
END $$;
