-- Add credit_score column to borrowers table
-- This is used by process_repayment to update borrower's credit score on payments

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'borrowers'
    AND column_name = 'credit_score'
  ) THEN
    ALTER TABLE public.borrowers
    ADD COLUMN credit_score INTEGER DEFAULT 500
    CHECK (credit_score >= 300 AND credit_score <= 850);

    -- Initialize credit scores from borrower_scores if available
    UPDATE public.borrowers b
    SET credit_score = bs.score
    FROM public.borrower_scores bs
    WHERE bs.borrower_id = b.id
    AND bs.score IS NOT NULL;

    RAISE NOTICE 'Added credit_score column to borrowers table';
  ELSE
    RAISE NOTICE 'credit_score column already exists in borrowers table';
  END IF;
END $$;

-- Create index for credit score queries
CREATE INDEX IF NOT EXISTS idx_borrowers_credit_score
ON public.borrowers(credit_score);
