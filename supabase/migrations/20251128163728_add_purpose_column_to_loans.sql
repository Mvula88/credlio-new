-- Add purpose column to loans table
ALTER TABLE public.loans
ADD COLUMN IF NOT EXISTS purpose TEXT;

COMMENT ON COLUMN public.loans.purpose IS 'Description of what the loan will be used for';
