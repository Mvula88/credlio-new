-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  app_role app_role NOT NULL,
  country_code TEXT NOT NULL REFERENCES public.countries(code),
  phone_e164 TEXT,
  date_of_birth DATE,
  consent_timestamp TIMESTAMPTZ,
  consent_ip_hash TEXT,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(country_code, phone_e164)
);

-- Lenders table
CREATE TABLE IF NOT EXISTS public.lenders (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  business_name TEXT,
  license_number TEXT,
  verification_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Borrowers table (can exist without user account)
CREATE TABLE IF NOT EXISTS public.borrowers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_code TEXT NOT NULL REFERENCES public.countries(code),
  full_name TEXT NOT NULL,
  national_id_hash TEXT NOT NULL, -- SHA-256 hash of national ID
  phone_e164 TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  created_by_lender UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(country_code, national_id_hash),
  UNIQUE(country_code, phone_e164)
);

-- Link between borrower records and user accounts
CREATE TABLE IF NOT EXISTS public.borrower_user_links (
  borrower_id UUID NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (borrower_id, user_id),
  UNIQUE(user_id) -- One user can only be linked to one borrower
);

-- Borrower scores
CREATE TABLE IF NOT EXISTS public.borrower_scores (
  borrower_id UUID PRIMARY KEY REFERENCES public.borrowers(id) ON DELETE CASCADE,
  score INT NOT NULL DEFAULT 600 CHECK (score >= 300 AND score <= 850),
  score_factors JSONB DEFAULT '{}',
  last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lender scores (for reliability tracking)
CREATE TABLE IF NOT EXISTS public.lender_scores (
  lender_id UUID PRIMARY KEY REFERENCES public.lenders(user_id) ON DELETE CASCADE,
  on_time_rate DECIMAL(5,2) DEFAULT 100.00,
  evidence_rate DECIMAL(5,2) DEFAULT 100.00,
  overturned_rate DECIMAL(5,2) DEFAULT 0.00,
  total_loans INT DEFAULT 0,
  total_reports INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Risk flags
CREATE TABLE IF NOT EXISTS public.risk_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  borrower_id UUID NOT NULL REFERENCES public.borrowers(id),
  country_code TEXT NOT NULL REFERENCES public.countries(code),
  origin risk_origin NOT NULL,
  type risk_type NOT NULL,
  reason TEXT,
  amount_at_issue_minor BIGINT,
  proof_sha256 TEXT, -- Required for LENDER_REPORTED
  created_by UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(user_id),
  resolution_reason TEXT,
  expires_at TIMESTAMPTZ, -- For data retention
  CONSTRAINT valid_proof CHECK (
    (origin = 'LENDER_REPORTED' AND proof_sha256 IS NOT NULL) OR 
    origin = 'SYSTEM_AUTO'
  )
);

-- Create index for performance
CREATE INDEX idx_risk_flags_borrower ON public.risk_flags(borrower_id);
CREATE INDEX idx_risk_flags_country ON public.risk_flags(country_code);
CREATE INDEX idx_risk_flags_open ON public.risk_flags(borrower_id) WHERE resolved_at IS NULL;