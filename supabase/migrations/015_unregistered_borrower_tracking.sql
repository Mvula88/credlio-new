-- Unregistered Borrower Tracking System
-- Allows lenders to track borrowers BEFORE they join the platform

-- Add user_id column to borrowers table (for registered borrowers)
ALTER TABLE public.borrowers ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL UNIQUE;

-- Add invitation system columns to borrowers table
ALTER TABLE public.borrowers ADD COLUMN IF NOT EXISTS invited_by_lender UUID REFERENCES public.lenders(user_id);
ALTER TABLE public.borrowers ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMPTZ;
ALTER TABLE public.borrowers ADD COLUMN IF NOT EXISTS invitation_accepted_at TIMESTAMPTZ;

-- Create index for user_id lookups
CREATE INDEX IF NOT EXISTS idx_borrowers_user_id ON public.borrowers(user_id);

-- Create borrower_reports table for tracking (both registered and unregistered)
CREATE TABLE IF NOT EXISTS public.borrower_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  borrower_id UUID REFERENCES public.borrowers(id) ON DELETE CASCADE,
  lender_id UUID NOT NULL REFERENCES public.lenders(user_id),
  country_code TEXT NOT NULL REFERENCES public.countries(code),
  currency TEXT NOT NULL,

  -- Report details
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  loan_date DATE NOT NULL,
  due_date DATE,
  status TEXT NOT NULL CHECK (status IN ('unpaid', 'paid', 'disputed', 'overdue')),
  payment_date DATE,

  -- Evidence
  description TEXT,
  evidence_urls TEXT[], -- Array of file paths in storage

  -- Confirmation
  borrower_confirmed BOOLEAN DEFAULT FALSE,
  borrower_response TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  FOREIGN KEY (country_code, currency) REFERENCES public.country_currency_allowed(country_code, currency_code)
);

-- Index for performance
CREATE INDEX idx_reports_borrower ON public.borrower_reports(borrower_id);
CREATE INDEX idx_reports_lender ON public.borrower_reports(lender_id);
CREATE INDEX idx_reports_status ON public.borrower_reports(status);
CREATE INDEX idx_reports_country ON public.borrower_reports(country_code);

-- Enable RLS
ALTER TABLE public.borrower_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for borrower_reports
CREATE POLICY "Lenders can view own reports" ON public.borrower_reports
  FOR SELECT USING (lender_id = auth.uid());

CREATE POLICY "Premium lenders can view all reports in their country" ON public.borrower_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.tier IN ('PRO', 'PRO_PLUS')
        AND (s.current_period_end IS NULL OR s.current_period_end > NOW())
    )
    AND country_code = jwt_country()
  );

CREATE POLICY "Borrowers can view reports about them" ON public.borrower_reports
  FOR SELECT USING (
    borrower_id IN (
      SELECT id FROM public.borrowers WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Lenders can create reports" ON public.borrower_reports
  FOR INSERT WITH CHECK (
    lender_id = auth.uid()
    AND jwt_role() = 'lender'
  );

CREATE POLICY "Lenders can update own reports" ON public.borrower_reports
  FOR UPDATE USING (lender_id = auth.uid());

CREATE POLICY "Borrowers can update their response" ON public.borrower_reports
  FOR UPDATE USING (
    borrower_id IN (
      SELECT id FROM public.borrowers WHERE user_id = auth.uid()
    )
  );

-- Admin policies for borrower_reports
CREATE POLICY "Admins can view all reports" ON public.borrower_reports
  FOR SELECT USING (jwt_role() = 'admin');

CREATE POLICY "Admins can update all reports" ON public.borrower_reports
  FOR UPDATE USING (jwt_role() = 'admin');

CREATE POLICY "Admins can delete reports" ON public.borrower_reports
  FOR DELETE USING (jwt_role() = 'admin');

-- Function to file a report on borrower (registered or unregistered)
CREATE OR REPLACE FUNCTION public.file_borrower_report(
  p_borrower_id UUID,
  p_amount_minor BIGINT,
  p_loan_date DATE,
  p_due_date DATE,
  p_status TEXT,
  p_description TEXT DEFAULT NULL,
  p_evidence_urls TEXT[] DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_report_id UUID;
  v_lender_id UUID;
  v_country TEXT;
  v_currency TEXT;
BEGIN
  -- Verify caller is a lender
  IF jwt_role() != 'lender' THEN
    RAISE EXCEPTION 'Only lenders can file reports';
  END IF;

  v_lender_id := auth.uid();
  v_country := jwt_country();

  -- Get currency for country
  SELECT currency_code INTO v_currency
  FROM public.country_currency_allowed
  WHERE country_code = v_country
  LIMIT 1;

  -- Verify borrower exists
  IF NOT EXISTS (SELECT 1 FROM public.borrowers WHERE id = p_borrower_id) THEN
    RAISE EXCEPTION 'Borrower not found';
  END IF;

  -- Create report
  INSERT INTO public.borrower_reports (
    borrower_id,
    lender_id,
    country_code,
    currency,
    amount_minor,
    loan_date,
    due_date,
    status,
    description,
    evidence_urls,
    created_at,
    updated_at
  ) VALUES (
    p_borrower_id,
    v_lender_id,
    v_country,
    v_currency,
    p_amount_minor,
    p_loan_date,
    p_due_date,
    p_status,
    p_description,
    p_evidence_urls,
    NOW(),
    NOW()
  ) RETURNING id INTO v_report_id;

  -- Update borrower score based on report
  IF p_status = 'unpaid' OR p_status = 'overdue' THEN
    PERFORM public.refresh_borrower_score(p_borrower_id);
  END IF;

  -- Log the action
  INSERT INTO public.audit_ledger (
    actor_id,
    action,
    target_type,
    target_id,
    payload,
    created_at
  ) VALUES (
    v_lender_id,
    'file_report',
    'borrower_report',
    v_report_id,
    jsonb_build_object(
      'borrower_id', p_borrower_id,
      'amount', p_amount_minor,
      'status', p_status
    ),
    NOW()
  );

  RETURN v_report_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.file_borrower_report(UUID, BIGINT, DATE, DATE, TEXT, TEXT, TEXT[]) TO authenticated;

-- Function to invite borrower to join platform
CREATE OR REPLACE FUNCTION public.invite_borrower_to_platform(
  p_borrower_id UUID,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lender_id UUID;
BEGIN
  -- Verify caller is a lender
  IF jwt_role() != 'lender' THEN
    RAISE EXCEPTION 'Only lenders can invite borrowers';
  END IF;

  v_lender_id := auth.uid();

  -- Update borrower with invitation info
  UPDATE public.borrowers
  SET
    invited_by_lender = v_lender_id,
    invitation_sent_at = NOW(),
    updated_at = NOW()
  WHERE id = p_borrower_id
    AND user_id IS NULL; -- Only invite unregistered borrowers

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Borrower not found or already registered';
  END IF;

  -- TODO: Send invitation email/SMS using p_email or p_phone
  -- This would integrate with your email/SMS service

  -- Log the action
  INSERT INTO public.audit_ledger (
    actor_id,
    action,
    target_type,
    target_id,
    payload,
    created_at
  ) VALUES (
    v_lender_id,
    'invite_borrower',
    'borrower',
    p_borrower_id,
    jsonb_build_object(
      'email', p_email,
      'phone', p_phone
    ),
    NOW()
  );

  RETURN TRUE;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.invite_borrower_to_platform(UUID, TEXT, TEXT) TO authenticated;

-- Function to confirm report payment (by borrower)
CREATE OR REPLACE FUNCTION public.confirm_report_payment(
  p_report_id UUID,
  p_payment_date DATE,
  p_response TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_borrower_id UUID;
  v_report_borrower_id UUID;
BEGIN
  -- Get current user's borrower ID
  SELECT id INTO v_borrower_id
  FROM public.borrowers
  WHERE user_id = auth.uid();

  IF v_borrower_id IS NULL THEN
    RAISE EXCEPTION 'You must be a registered borrower';
  END IF;

  -- Get report's borrower ID
  SELECT borrower_id INTO v_report_borrower_id
  FROM public.borrower_reports
  WHERE id = p_report_id;

  -- Verify this report is about the current user
  IF v_report_borrower_id != v_borrower_id THEN
    RAISE EXCEPTION 'You can only confirm reports about yourself';
  END IF;

  -- Update report
  UPDATE public.borrower_reports
  SET
    status = 'paid',
    payment_date = p_payment_date,
    borrower_confirmed = TRUE,
    borrower_response = p_response,
    updated_at = NOW()
  WHERE id = p_report_id;

  -- Refresh borrower score
  PERFORM public.refresh_borrower_score(v_borrower_id);

  RETURN TRUE;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.confirm_report_payment(UUID, DATE, TEXT) TO authenticated;

-- Function to dispute a report
CREATE OR REPLACE FUNCTION public.dispute_report(
  p_report_id UUID,
  p_response TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_borrower_id UUID;
  v_report_borrower_id UUID;
BEGIN
  -- Get current user's borrower ID
  SELECT id INTO v_borrower_id
  FROM public.borrowers
  WHERE user_id = auth.uid();

  IF v_borrower_id IS NULL THEN
    RAISE EXCEPTION 'You must be a registered borrower';
  END IF;

  -- Get report's borrower ID
  SELECT borrower_id INTO v_report_borrower_id
  FROM public.borrower_reports
  WHERE id = p_report_id;

  -- Verify this report is about the current user
  IF v_report_borrower_id != v_borrower_id THEN
    RAISE EXCEPTION 'You can only dispute reports about yourself';
  END IF;

  -- Update report status
  UPDATE public.borrower_reports
  SET
    status = 'disputed',
    borrower_response = p_response,
    updated_at = NOW()
  WHERE id = p_report_id;

  RETURN TRUE;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.dispute_report(UUID, TEXT) TO authenticated;
