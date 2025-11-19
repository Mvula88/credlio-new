-- Loans table
CREATE TABLE IF NOT EXISTS public.loans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  borrower_id UUID NOT NULL REFERENCES public.borrowers(id),
  lender_id UUID NOT NULL REFERENCES public.lenders(user_id),
  request_id UUID, -- Links to marketplace request if applicable
  country_code TEXT NOT NULL REFERENCES public.countries(code),
  currency TEXT NOT NULL,
  principal_minor BIGINT NOT NULL CHECK (principal_minor > 0),
  apr_bps INT NOT NULL CHECK (apr_bps >= 0), -- Annual Percentage Rate in basis points
  term_months INT NOT NULL CHECK (term_months > 0),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status loan_status NOT NULL DEFAULT 'active',
  disbursed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  defaulted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (country_code, currency) REFERENCES public.country_currency_allowed(country_code, currency_code)
);

-- Prevent multiple active loans per borrower
CREATE UNIQUE INDEX uniq_active_loan_per_borrower ON public.loans(borrower_id) WHERE status = 'active';

-- Repayment schedules
CREATE TABLE IF NOT EXISTS public.repayment_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  installment_no INT NOT NULL CHECK (installment_no > 0),
  due_date DATE NOT NULL,
  amount_due_minor BIGINT NOT NULL CHECK (amount_due_minor > 0),
  principal_minor BIGINT NOT NULL CHECK (principal_minor >= 0),
  interest_minor BIGINT NOT NULL CHECK (interest_minor >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(loan_id, installment_no)
);

-- Repayment events (actual payments)
CREATE TABLE IF NOT EXISTS public.repayment_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID NOT NULL REFERENCES public.repayment_schedules(id),
  paid_at TIMESTAMPTZ NOT NULL,
  amount_paid_minor BIGINT NOT NULL CHECK (amount_paid_minor > 0),
  method payment_method NOT NULL,
  reference_number TEXT,
  evidence_url TEXT,
  evidence_hash TEXT,
  reported_by UUID NOT NULL REFERENCES public.profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lender reporting logs (for tracking reporting compliance)
CREATE TABLE IF NOT EXISTS public.lender_reporting_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID NOT NULL REFERENCES public.repayment_schedules(id),
  lender_id UUID NOT NULL REFERENCES public.lenders(user_id),
  expected_report_by TIMESTAMPTZ NOT NULL,
  reported_at TIMESTAMPTZ,
  status reporting_status NOT NULL DEFAULT 'on_time',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_loans_borrower ON public.loans(borrower_id);
CREATE INDEX idx_loans_lender ON public.loans(lender_id);
CREATE INDEX idx_loans_status ON public.loans(status);
CREATE INDEX idx_schedules_loan ON public.repayment_schedules(loan_id);
CREATE INDEX idx_schedules_due ON public.repayment_schedules(due_date);
CREATE INDEX idx_events_schedule ON public.repayment_events(schedule_id);