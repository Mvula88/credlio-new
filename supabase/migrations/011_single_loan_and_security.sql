-- Single Active Loan Enforcement and Additional Security Features

-- Prevent a borrower from having MORE THAN ONE ACTIVE LOAN at a time
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_loan_per_borrower
  ON public.loans (borrower_id)
  WHERE status = 'active';

-- Ensure only ONE accepted offer per request (guards race conditions)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_accepted_offer_per_request
  ON public.loan_offers (request_id)
  WHERE status = 'accepted';

-- Add foreign key constraint for country-currency on loan_requests
ALTER TABLE public.loan_requests
  ADD CONSTRAINT fk_lr_country_currency
  FOREIGN KEY (country_code, currency)
  REFERENCES public.country_currency_allowed(country_code, currency_code)
  ON DELETE RESTRICT;

-- Add foreign key constraint for country-currency on loans
ALTER TABLE public.loans
  ADD CONSTRAINT fk_loans_country_currency
  FOREIGN KEY (country_code, currency)
  REFERENCES public.country_currency_allowed(country_code, currency_code)
  ON DELETE RESTRICT;

-- Search logs for rate limiting and audit
CREATE TABLE IF NOT EXISTS public.search_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lender_id UUID NOT NULL REFERENCES public.profiles(user_id),
  country_code TEXT NOT NULL REFERENCES public.countries(code),
  query_type TEXT NOT NULL CHECK (query_type IN ('id_hash', 'phone', 'name')),
  query_hash TEXT, -- Hash of the search query for privacy
  purpose TEXT NOT NULL,
  results_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for search logs
CREATE INDEX IF NOT EXISTS idx_search_logs_lender ON public.search_logs(lender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_logs_country ON public.search_logs(country_code);

-- Borrower identity index for better matching
CREATE TABLE IF NOT EXISTS public.borrower_identity_index (
  borrower_id UUID PRIMARY KEY REFERENCES public.borrowers(id) ON DELETE CASCADE,
  id_hash TEXT NOT NULL,
  phone_e164 TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  name_fingerprint TEXT, -- Phonetic/soundex of name
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for identity matching
CREATE INDEX IF NOT EXISTS idx_identity_hash ON public.borrower_identity_index(id_hash);
CREATE INDEX IF NOT EXISTS idx_identity_phone ON public.borrower_identity_index(phone_e164);
CREATE INDEX IF NOT EXISTS idx_identity_dob ON public.borrower_identity_index(date_of_birth);

-- Document hashes table
CREATE TABLE IF NOT EXISTS public.document_hashes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  borrower_id UUID NOT NULL REFERENCES public.borrowers(id),
  lender_id UUID REFERENCES public.profiles(user_id),
  doc_type TEXT NOT NULL,
  sha256_hex TEXT NOT NULL,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(borrower_id, doc_type, sha256_hex)
);

-- Index for document hashes
CREATE INDEX IF NOT EXISTS idx_doc_hashes_borrower ON public.document_hashes(borrower_id);
CREATE INDEX IF NOT EXISTS idx_doc_hashes_lender ON public.document_hashes(lender_id);

-- Audit ledger with chain hashing for tamper evidence
CREATE TABLE IF NOT EXISTS public.audit_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID REFERENCES auth.users(id),
  action audit_action NOT NULL,
  target_type TEXT,
  target_id UUID,
  payload JSONB,
  ip_hash TEXT,
  prev_hash TEXT,
  row_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for audit ledger
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_ledger(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.audit_ledger(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_ledger(created_at DESC);

-- Subscriptions table for Stripe
CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier sub_tier NOT NULL DEFAULT 'PRO',
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_tier ON public.subscriptions(tier);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period ON public.subscriptions(current_period_end);

-- Fraud signals for pattern detection
CREATE TABLE IF NOT EXISTS public.fraud_signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  borrower_id UUID REFERENCES public.borrowers(id),
  signal_type TEXT NOT NULL,
  confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  details JSONB,
  detected_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fraud signals
CREATE INDEX IF NOT EXISTS idx_fraud_borrower ON public.fraud_signals(borrower_id);
CREATE INDEX IF NOT EXISTS idx_fraud_type ON public.fraud_signals(signal_type);

-- Job runs for monitoring
CREATE TABLE IF NOT EXISTS public.job_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('running', 'success', 'failed')),
  error_message TEXT,
  rows_processed INT DEFAULT 0
);

-- Index for job runs
CREATE INDEX IF NOT EXISTS idx_job_runs_name ON public.job_runs(job_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_runs_status ON public.job_runs(status);

-- Function to hash IDs (SHA-256)
CREATE OR REPLACE FUNCTION hash_id(raw_id TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN encode(digest(raw_id, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- These functions might already exist from previous migrations
-- Creating them only if they don't exist
DO $$
BEGIN
  -- Check and create jwt_uid if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'jwt_uid') THEN
    CREATE FUNCTION jwt_uid()
    RETURNS UUID AS $func$
    BEGIN
      RETURN auth.uid();
    END;
    $func$ LANGUAGE plpgsql STABLE;
  END IF;

  -- Check and create jwt_role if it doesn't exist  
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'jwt_role') THEN
    CREATE FUNCTION jwt_role()
    RETURNS TEXT AS $func$
    BEGIN
      RETURN COALESCE(
        current_setting('request.jwt.claims', true)::json->>'app_role',
        'borrower'
      );
    END;
    $func$ LANGUAGE plpgsql STABLE;
  END IF;

  -- Check and create jwt_country if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'jwt_country') THEN
    CREATE FUNCTION jwt_country()
    RETURNS TEXT AS $func$
    BEGIN
      RETURN COALESCE(
        current_setting('request.jwt.claims', true)::json->>'country_code',
        'NA' -- Default to Namibia
      );
    END;
    $func$ LANGUAGE plpgsql STABLE;
  END IF;

  -- Check and create jwt_tier if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'jwt_tier') THEN
    CREATE FUNCTION jwt_tier()
    RETURNS TEXT AS $func$
    BEGIN
      RETURN COALESCE(
        current_setting('request.jwt.claims', true)::json->>'tier',
        'PRO'
      );
    END;
    $func$ LANGUAGE plpgsql STABLE;
  END IF;
END $$;