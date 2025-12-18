-- Create affordability_assessments table to store borrower affordability checks
-- This allows lenders to save and view previous assessments for borrowers

CREATE TABLE IF NOT EXISTS public.affordability_assessments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  borrower_id UUID NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,
  lender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Input data (what the lender entered)
  monthly_income DECIMAL(15, 2) NOT NULL,
  monthly_expenses DECIMAL(15, 2) NOT NULL DEFAULT 0,
  existing_debt DECIMAL(15, 2) NOT NULL DEFAULT 0,
  loan_amount DECIMAL(15, 2) NOT NULL,
  loan_term INTEGER NOT NULL DEFAULT 12, -- months
  interest_rate DECIMAL(5, 2) NOT NULL DEFAULT 15, -- percentage

  -- Calculated results
  monthly_payment DECIMAL(15, 2) NOT NULL,
  debt_to_income DECIMAL(5, 2) NOT NULL, -- percentage
  disposable_income DECIMAL(15, 2) NOT NULL,
  affordability_score TEXT NOT NULL CHECK (affordability_score IN ('excellent', 'good', 'fair', 'poor')),
  can_afford BOOLEAN NOT NULL DEFAULT false,
  max_recommended_loan DECIMAL(15, 2) NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_affordability_borrower_id ON public.affordability_assessments(borrower_id);
CREATE INDEX IF NOT EXISTS idx_affordability_lender_id ON public.affordability_assessments(lender_id);
CREATE INDEX IF NOT EXISTS idx_affordability_created_at ON public.affordability_assessments(created_at DESC);

-- Enable RLS
ALTER TABLE public.affordability_assessments ENABLE ROW LEVEL SECURITY;

-- Lenders can view their own assessments
CREATE POLICY "Lenders can view their own assessments"
  ON public.affordability_assessments
  FOR SELECT
  USING (auth.uid() = lender_id);

-- Lenders can create assessments
CREATE POLICY "Lenders can create assessments"
  ON public.affordability_assessments
  FOR INSERT
  WITH CHECK (auth.uid() = lender_id);

-- Lenders can delete their own assessments
CREATE POLICY "Lenders can delete their own assessments"
  ON public.affordability_assessments
  FOR DELETE
  USING (auth.uid() = lender_id);

-- Admins can view all assessments
CREATE POLICY "Admins can view all assessments"
  ON public.affordability_assessments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid()
      AND app_role = 'admin'
    )
  );

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER update_affordability_assessments_updated_at
  BEFORE UPDATE ON public.affordability_assessments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.affordability_assessments IS 'Stores affordability assessments performed by lenders for borrowers';
