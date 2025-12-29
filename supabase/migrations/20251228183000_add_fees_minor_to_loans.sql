-- Add fees_minor column to loans table
-- This column is referenced by the accept_offer function but was missing

ALTER TABLE public.loans
ADD COLUMN IF NOT EXISTS fees_minor BIGINT DEFAULT 0;

COMMENT ON COLUMN public.loans.fees_minor IS 'Any additional fees in minor currency units (cents)';
