-- Reset any offers that were marked as 'accepted' but have no corresponding loan
-- This fixes offers that got stuck due to the accept_offer function failing partway through

UPDATE public.loan_offers
SET status = 'pending', updated_at = NOW()
WHERE status = 'accepted'
AND NOT EXISTS (
  SELECT 1 FROM public.loans l
  WHERE l.request_id = loan_offers.request_id
);

-- Also ensure the loan_requests are still 'open' if they have no accepted loan
UPDATE public.loan_requests
SET status = 'open', updated_at = NOW()
WHERE status = 'accepted'
AND NOT EXISTS (
  SELECT 1 FROM public.loans l
  WHERE l.request_id = loan_requests.id
);
