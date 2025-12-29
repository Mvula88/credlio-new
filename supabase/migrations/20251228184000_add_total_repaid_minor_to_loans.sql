-- Add total_repaid_minor column to loans table
-- This column is referenced by the accept_offer function but was missing

ALTER TABLE public.loans
ADD COLUMN IF NOT EXISTS total_repaid_minor BIGINT DEFAULT 0;

COMMENT ON COLUMN public.loans.total_repaid_minor IS 'Total amount repaid so far in minor currency units';
