-- Marketplace: Loan requests (borrowers post these)
CREATE TABLE IF NOT EXISTS public.loan_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  borrower_id UUID NOT NULL REFERENCES public.borrowers(id),
  borrower_user_id UUID NOT NULL REFERENCES auth.users(id),
  country_code TEXT NOT NULL REFERENCES public.countries(code),
  currency TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  purpose TEXT NOT NULL,
  description TEXT,
  term_months INT NOT NULL CHECK (term_months > 0),
  max_apr_bps INT, -- Maximum APR borrower is willing to accept
  status request_status NOT NULL DEFAULT 'open',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (country_code, currency) REFERENCES public.country_currency_allowed(country_code, currency_code)
);

-- Marketplace: Loan offers (lenders make these)
CREATE TABLE IF NOT EXISTS public.loan_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES public.loan_requests(id) ON DELETE CASCADE,
  lender_id UUID NOT NULL REFERENCES public.lenders(user_id),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  apr_bps INT NOT NULL CHECK (apr_bps >= 0),
  term_months INT NOT NULL CHECK (term_months > 0),
  fees_minor BIGINT DEFAULT 0,
  conditions TEXT,
  status offer_status NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(request_id, lender_id) -- One offer per lender per request
);

-- Ensure only one accepted offer per request
CREATE UNIQUE INDEX uniq_accepted_offer_per_request ON public.loan_offers(request_id) WHERE status = 'accepted';

-- Create indexes for performance
CREATE INDEX idx_requests_borrower ON public.loan_requests(borrower_id);
CREATE INDEX idx_requests_status ON public.loan_requests(status);
CREATE INDEX idx_requests_country ON public.loan_requests(country_code);
CREATE INDEX idx_offers_request ON public.loan_offers(request_id);
CREATE INDEX idx_offers_lender ON public.loan_offers(lender_id);
CREATE INDEX idx_offers_status ON public.loan_offers(status);