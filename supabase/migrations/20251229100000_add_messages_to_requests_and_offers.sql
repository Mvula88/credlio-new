-- Add message fields to loan_requests and loan_offers
-- This allows borrowers and lenders to include personal messages with their requests/offers

-- Add borrower_message to loan_requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'loan_requests' AND column_name = 'borrower_message'
  ) THEN
    ALTER TABLE public.loan_requests ADD COLUMN borrower_message TEXT;
    COMMENT ON COLUMN public.loan_requests.borrower_message IS 'Personal message from borrower to potential lenders';
  END IF;
END $$;

-- Add lender_message to loan_offers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'loan_offers' AND column_name = 'lender_message'
  ) THEN
    ALTER TABLE public.loan_offers ADD COLUMN lender_message TEXT;
    COMMENT ON COLUMN public.loan_offers.lender_message IS 'Personal message from lender to borrower with their offer';
  END IF;
END $$;

COMMENT ON TABLE public.loan_requests IS 'Loan requests posted by borrowers. Includes borrower_message for personal context.';
COMMENT ON TABLE public.loan_offers IS 'Loan offers made by lenders. Includes lender_message for personal communication.';
