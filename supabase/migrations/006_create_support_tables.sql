-- Document hashes (store only hashes, never actual documents)
CREATE TABLE IF NOT EXISTS public.document_hashes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  borrower_id UUID NOT NULL REFERENCES public.borrowers(id),
  lender_id UUID REFERENCES public.lenders(user_id),
  doc_type TEXT NOT NULL,
  sha256_hex TEXT NOT NULL,
  metadata JSONB DEFAULT '{}', -- Store non-sensitive metadata
  received_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(borrower_id, doc_type, sha256_hex)
);

-- Disputes
CREATE TABLE IF NOT EXISTS public.disputes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  borrower_id UUID NOT NULL REFERENCES public.borrowers(id),
  lender_id UUID REFERENCES public.lenders(user_id),
  loan_id UUID REFERENCES public.loans(id),
  risk_flag_id UUID REFERENCES public.risk_flags(id),
  country_code TEXT NOT NULL REFERENCES public.countries(code),
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence_hashes TEXT[],
  status dispute_status NOT NULL DEFAULT 'open',
  sla_due_at TIMESTAMPTZ,
  outcome TEXT,
  resolution_notes TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(user_id),
  resolved_by UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Subscriptions (Stripe)
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

-- Audit logs (with chaining for tamper-evidence)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID REFERENCES auth.users(id),
  actor_role app_role,
  action audit_action NOT NULL,
  target TEXT NOT NULL,
  target_id UUID,
  country_code TEXT REFERENCES public.countries(code),
  payload JSONB DEFAULT '{}',
  ip_hash TEXT,
  user_agent TEXT,
  previous_hash TEXT,
  row_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Search logs (for rate limiting and compliance)
CREATE TABLE IF NOT EXISTS public.search_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lender_id UUID NOT NULL REFERENCES public.lenders(user_id),
  query_type TEXT NOT NULL,
  query_params JSONB,
  purpose TEXT NOT NULL,
  results_count INT DEFAULT 0,
  country_code TEXT NOT NULL REFERENCES public.countries(code),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Borrower identity index (for fuzzy matching)
CREATE TABLE IF NOT EXISTS public.borrower_identity_index (
  borrower_id UUID PRIMARY KEY REFERENCES public.borrowers(id) ON DELETE CASCADE,
  id_hash TEXT NOT NULL,
  phone_e164 TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  name_fingerprint TEXT, -- Phonetic/normalized name for fuzzy matching
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(id_hash, phone_e164)
);

-- Trusted devices (for 2FA)
CREATE TABLE IF NOT EXISTS public.trusted_devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_hash TEXT NOT NULL,
  device_name TEXT,
  last_ip_hash TEXT,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE(user_id, device_hash)
);

-- Job runs (for monitoring cron jobs)
CREATE TABLE IF NOT EXISTS public.job_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  error TEXT,
  records_processed INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fraud signals
CREATE TABLE IF NOT EXISTS public.fraud_signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  borrower_id UUID REFERENCES public.borrowers(id),
  lender_id UUID REFERENCES public.lenders(user_id),
  signal_type TEXT NOT NULL,
  score INT NOT NULL CHECK (score >= 0 AND score <= 100),
  details JSONB DEFAULT '{}',
  country_code TEXT NOT NULL REFERENCES public.countries(code),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_doc_hashes_borrower ON public.document_hashes(borrower_id);
CREATE INDEX idx_disputes_borrower ON public.disputes(borrower_id);
CREATE INDEX idx_disputes_status ON public.disputes(status);
CREATE INDEX idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX idx_audit_logs_target ON public.audit_logs(target, target_id);
CREATE INDEX idx_search_logs_lender ON public.search_logs(lender_id);
CREATE INDEX idx_fraud_signals_borrower ON public.fraud_signals(borrower_id);