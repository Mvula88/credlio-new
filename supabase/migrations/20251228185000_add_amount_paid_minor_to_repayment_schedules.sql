-- Add amount_paid_minor column to repayment_schedules table
-- This column is referenced by the accept_offer function but was missing

ALTER TABLE public.repayment_schedules
ADD COLUMN IF NOT EXISTS amount_paid_minor BIGINT DEFAULT 0;

COMMENT ON COLUMN public.repayment_schedules.amount_paid_minor IS 'Amount already paid for this installment in minor currency units';
