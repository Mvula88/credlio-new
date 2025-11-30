-- Migration: New Interest Rate System
-- Changes from APR-based to simple percentage-based interest calculation
--
-- How it works:
-- 1. Lender sets base_rate_percent (e.g., 30 = 30%)
-- 2. Lender sets extra_rate_per_installment (e.g., 2 = 2% extra per installment month)
-- 3. If borrower pays once (single payment): Total = Principal + (Principal * base_rate_percent / 100)
-- 4. If borrower pays in installments: Total = Principal + (Principal * (base_rate_percent + (extra_rate * (installments - 1))) / 100)
--
-- Example with 30% base rate and 2% extra per installment:
-- - 1 payment (once-off): 1000 + 30% = 1300
-- - 2 installments: 1000 + 32% = 1320 (paid as 660 x 2)
-- - 3 installments: 1000 + 34% = 1340 (paid as ~447 x 3)

-- Add payment_type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_type') THEN
    CREATE TYPE payment_type AS ENUM ('once_off', 'installments');
  END IF;
END $$;

-- Add new columns to loan_offers table
ALTER TABLE public.loan_offers
ADD COLUMN IF NOT EXISTS base_rate_percent DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS extra_rate_per_installment DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_type payment_type DEFAULT 'once_off',
ADD COLUMN IF NOT EXISTS num_installments INT DEFAULT 1 CHECK (num_installments >= 1);

-- Add new columns to loans table
ALTER TABLE public.loans
ADD COLUMN IF NOT EXISTS base_rate_percent DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS extra_rate_per_installment DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_type payment_type DEFAULT 'once_off',
ADD COLUMN IF NOT EXISTS num_installments INT DEFAULT 1 CHECK (num_installments >= 1),
ADD COLUMN IF NOT EXISTS total_interest_percent DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS interest_amount_minor BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_amount_minor BIGINT;

-- Add new columns to loan_requests table (borrower specifies preferred payment type)
ALTER TABLE public.loan_requests
ADD COLUMN IF NOT EXISTS preferred_payment_type payment_type DEFAULT 'once_off',
ADD COLUMN IF NOT EXISTS preferred_installments INT DEFAULT 1 CHECK (preferred_installments >= 1);

-- Migrate existing data: Convert apr_bps to base_rate_percent
-- apr_bps is in basis points (100 bps = 1%), so 3000 bps = 30%
UPDATE public.loan_offers
SET base_rate_percent = COALESCE(apr_bps::DECIMAL / 100, 0),
    extra_rate_per_installment = 0,
    payment_type = CASE WHEN term_months = 1 THEN 'once_off'::payment_type ELSE 'installments'::payment_type END,
    num_installments = COALESCE(term_months, 1)
WHERE base_rate_percent IS NULL;

UPDATE public.loans
SET base_rate_percent = COALESCE(apr_bps::DECIMAL / 100, 0),
    extra_rate_per_installment = 0,
    payment_type = CASE WHEN term_months = 1 THEN 'once_off'::payment_type ELSE 'installments'::payment_type END,
    num_installments = COALESCE(term_months, 1),
    total_interest_percent = COALESCE(apr_bps::DECIMAL / 100, 0),
    interest_amount_minor = COALESCE(principal_minor * apr_bps / 10000, 0),
    total_amount_minor = COALESCE(principal_minor + (principal_minor * apr_bps / 10000), principal_minor)
WHERE base_rate_percent IS NULL;

-- Function to calculate total interest rate based on payment type
CREATE OR REPLACE FUNCTION calculate_total_interest_rate(
  p_base_rate DECIMAL,
  p_extra_rate DECIMAL,
  p_payment_type payment_type,
  p_num_installments INT
) RETURNS DECIMAL AS $$
BEGIN
  IF p_payment_type = 'once_off' OR p_num_installments <= 1 THEN
    -- Single payment: just the base rate
    RETURN p_base_rate;
  ELSE
    -- Installments: base rate + extra rate for each month beyond the first
    RETURN p_base_rate + (p_extra_rate * (p_num_installments - 1));
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to calculate loan amounts
CREATE OR REPLACE FUNCTION calculate_loan_amounts(
  p_principal_minor BIGINT,
  p_base_rate DECIMAL,
  p_extra_rate DECIMAL,
  p_payment_type payment_type,
  p_num_installments INT
) RETURNS TABLE (
  total_interest_percent DECIMAL,
  interest_amount_minor BIGINT,
  total_amount_minor BIGINT,
  installment_amount_minor BIGINT
) AS $$
DECLARE
  v_total_rate DECIMAL;
  v_interest BIGINT;
  v_total BIGINT;
  v_installment BIGINT;
BEGIN
  -- Calculate total interest rate
  v_total_rate := calculate_total_interest_rate(p_base_rate, p_extra_rate, p_payment_type, p_num_installments);

  -- Calculate interest amount (in minor units)
  v_interest := ROUND(p_principal_minor * v_total_rate / 100);

  -- Calculate total amount
  v_total := p_principal_minor + v_interest;

  -- Calculate per-installment amount
  IF p_payment_type = 'once_off' OR p_num_installments <= 1 THEN
    v_installment := v_total;
  ELSE
    v_installment := CEIL(v_total::DECIMAL / p_num_installments);
  END IF;

  RETURN QUERY SELECT v_total_rate, v_interest, v_total, v_installment;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to generate repayment schedule with new system
CREATE OR REPLACE FUNCTION generate_simple_repayment_schedule(
  p_loan_id UUID,
  p_principal_minor BIGINT,
  p_total_amount_minor BIGINT,
  p_interest_amount_minor BIGINT,
  p_payment_type payment_type,
  p_num_installments INT,
  p_start_date DATE
) RETURNS VOID AS $$
DECLARE
  v_installment_amount BIGINT;
  v_remaining_total BIGINT;
  v_remaining_interest BIGINT;
  v_remaining_principal BIGINT;
  v_this_principal BIGINT;
  v_this_interest BIGINT;
  v_due_date DATE;
  i INT;
BEGIN
  -- Delete any existing schedule for this loan
  DELETE FROM public.repayment_schedules WHERE loan_id = p_loan_id;

  IF p_payment_type = 'once_off' OR p_num_installments <= 1 THEN
    -- Single payment at end of term
    INSERT INTO public.repayment_schedules (
      loan_id, installment_no, due_date, amount_due_minor, principal_minor, interest_minor
    ) VALUES (
      p_loan_id, 1, p_start_date + INTERVAL '1 month',
      p_total_amount_minor, p_principal_minor, p_interest_amount_minor
    );
  ELSE
    -- Multiple installments
    v_installment_amount := CEIL(p_total_amount_minor::DECIMAL / p_num_installments);
    v_remaining_total := p_total_amount_minor;
    v_remaining_interest := p_interest_amount_minor;
    v_remaining_principal := p_principal_minor;

    FOR i IN 1..p_num_installments LOOP
      v_due_date := p_start_date + (i || ' months')::INTERVAL;

      -- Last installment gets the remainder
      IF i = p_num_installments THEN
        v_this_principal := v_remaining_principal;
        v_this_interest := v_remaining_interest;
        v_installment_amount := v_remaining_total;
      ELSE
        -- Distribute interest and principal proportionally
        v_this_interest := ROUND(p_interest_amount_minor::DECIMAL / p_num_installments);
        v_this_principal := v_installment_amount - v_this_interest;

        -- Ensure we don't go negative
        IF v_this_principal > v_remaining_principal THEN
          v_this_principal := v_remaining_principal;
          v_this_interest := v_installment_amount - v_this_principal;
        END IF;
      END IF;

      INSERT INTO public.repayment_schedules (
        loan_id, installment_no, due_date, amount_due_minor, principal_minor, interest_minor
      ) VALUES (
        p_loan_id, i, v_due_date, v_installment_amount, v_this_principal, v_this_interest
      );

      v_remaining_total := v_remaining_total - v_installment_amount;
      v_remaining_interest := v_remaining_interest - v_this_interest;
      v_remaining_principal := v_remaining_principal - v_this_principal;
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create a view for easy loan summary with new interest system
CREATE OR REPLACE VIEW public.loan_summary_view AS
SELECT
  l.id,
  l.borrower_id,
  l.lender_id,
  l.currency,
  l.principal_minor,
  l.base_rate_percent,
  l.extra_rate_per_installment,
  l.payment_type,
  l.num_installments,
  l.total_interest_percent,
  l.interest_amount_minor,
  l.total_amount_minor,
  l.status,
  l.start_date,
  l.end_date,
  l.created_at,
  -- Calculated fields
  CASE
    WHEN l.payment_type = 'once_off' OR l.num_installments <= 1
    THEN l.total_amount_minor
    ELSE CEIL(l.total_amount_minor::DECIMAL / l.num_installments)
  END AS installment_amount_minor,
  -- Progress tracking
  COALESCE(
    (SELECT SUM(re.amount_paid_minor)
     FROM public.repayment_events re
     JOIN public.repayment_schedules rs ON re.schedule_id = rs.id
     WHERE rs.loan_id = l.id), 0
  ) AS total_paid_minor,
  l.total_amount_minor - COALESCE(
    (SELECT SUM(re.amount_paid_minor)
     FROM public.repayment_events re
     JOIN public.repayment_schedules rs ON re.schedule_id = rs.id
     WHERE rs.loan_id = l.id), 0
  ) AS remaining_minor,
  -- Repayment progress percentage
  CASE
    WHEN l.total_amount_minor > 0
    THEN ROUND(
      COALESCE(
        (SELECT SUM(re.amount_paid_minor)
         FROM public.repayment_events re
         JOIN public.repayment_schedules rs ON re.schedule_id = rs.id
         WHERE rs.loan_id = l.id), 0
      )::DECIMAL / l.total_amount_minor * 100, 2
    )
    ELSE 0
  END AS repayment_progress_percent
FROM public.loans l;

-- Add comment explaining the new system
COMMENT ON COLUMN public.loan_offers.base_rate_percent IS 'Base interest rate percentage (e.g., 30 means 30%)';
COMMENT ON COLUMN public.loan_offers.extra_rate_per_installment IS 'Extra percentage added per installment month beyond the first (e.g., 2 means +2% per extra month)';
COMMENT ON COLUMN public.loan_offers.payment_type IS 'once_off = single payment, installments = multiple payments';
COMMENT ON COLUMN public.loan_offers.num_installments IS 'Number of installments (1 for once_off, 2+ for installments)';

COMMENT ON COLUMN public.loans.base_rate_percent IS 'Base interest rate percentage';
COMMENT ON COLUMN public.loans.extra_rate_per_installment IS 'Extra percentage per installment month';
COMMENT ON COLUMN public.loans.total_interest_percent IS 'Final calculated interest rate (base + extras)';
COMMENT ON COLUMN public.loans.interest_amount_minor IS 'Total interest amount in minor currency units';
COMMENT ON COLUMN public.loans.total_amount_minor IS 'Total amount to repay (principal + interest) in minor units';
