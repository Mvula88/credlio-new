-- Add verification fields to borrowers table
ALTER TABLE borrowers
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS id_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS account_activated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS verification_pending_until TIMESTAMPTZ;

-- Add verification fields to lenders table
ALTER TABLE lenders
ADD COLUMN IF NOT EXISTS national_id_hash TEXT,
ADD COLUMN IF NOT EXISTS physical_address TEXT,
ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS id_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS trial_mode BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days';

-- Create document upload table for verification
CREATE TABLE IF NOT EXISTS verification_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_type TEXT NOT NULL CHECK (user_type IN ('borrower', 'lender')),
  document_type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(file_hash)
);

-- Create signup attempts tracking for rate limiting
CREATE TABLE IF NOT EXISTS signup_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'blocked')),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create lender reputation tracking
CREATE TABLE IF NOT EXISTS lender_reputation (
  lender_id UUID PRIMARY KEY REFERENCES lenders(user_id) ON DELETE CASCADE,
  total_borrowers_registered INTEGER DEFAULT 0,
  total_loans_logged INTEGER DEFAULT 0,
  total_successful_loans INTEGER DEFAULT 0,
  total_defaults_reported INTEGER DEFAULT 0,
  total_disputes_against INTEGER DEFAULT 0,
  disputes_won INTEGER DEFAULT 0,
  disputes_lost INTEGER DEFAULT 0,
  false_reports_count INTEGER DEFAULT 0,
  reputation_score INTEGER DEFAULT 50 CHECK (reputation_score >= 0 AND reputation_score <= 100),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'probation', 'suspended', 'banned')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_verification_documents_user ON verification_documents(user_id, user_type);
CREATE INDEX IF NOT EXISTS idx_verification_documents_status ON verification_documents(status);
CREATE INDEX IF NOT EXISTS idx_signup_attempts_ip ON signup_attempts(ip_address, created_at);
CREATE INDEX IF NOT EXISTS idx_signup_attempts_email ON signup_attempts(email, created_at);
CREATE INDEX IF NOT EXISTS idx_borrowers_verification ON borrowers(email_verified, profile_completed, account_activated_at);
CREATE INDEX IF NOT EXISTS idx_lenders_trial ON lenders(trial_mode, trial_ends_at);

-- RLS policies for verification_documents
ALTER TABLE verification_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own documents" ON verification_documents
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can upload own documents" ON verification_documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all documents" ON verification_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update documents" ON verification_documents
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- RLS for signup_attempts
ALTER TABLE signup_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages signup attempts" ON signup_attempts
  FOR ALL USING (auth.role() = 'service_role');

-- RLS for lender_reputation
ALTER TABLE lender_reputation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lenders view own reputation" ON lender_reputation
  FOR SELECT USING (auth.uid() = lender_id);

CREATE POLICY "Lenders view all reputations" ON lender_reputation
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM lenders
      WHERE lenders.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role manages reputation" ON lender_reputation
  FOR ALL USING (auth.role() = 'service_role');

-- Function to check if borrower account is activated
CREATE OR REPLACE FUNCTION is_borrower_account_activated(borrower_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  borrower_record RECORD;
BEGIN
  SELECT
    email_verified,
    profile_completed,
    account_activated_at,
    verification_pending_until
  INTO borrower_record
  FROM borrowers b
  INNER JOIN borrower_user_links bul ON b.id = bul.borrower_id
  WHERE bul.user_id = borrower_user_id;

  RETURN (
    borrower_record.email_verified = TRUE AND
    borrower_record.profile_completed = TRUE AND
    borrower_record.account_activated_at IS NOT NULL AND
    borrower_record.account_activated_at <= NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if lender can access full features
CREATE OR REPLACE FUNCTION can_lender_access_full_features(lender_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  lender_record RECORD;
BEGIN
  SELECT
    profile_completed,
    id_verified,
    trial_mode
  INTO lender_record
  FROM lenders
  WHERE user_id = lender_user_id;

  RETURN (
    lender_record.profile_completed = TRUE AND
    (lender_record.id_verified = TRUE OR lender_record.trial_mode = TRUE)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update borrower 24-hour waiting period
CREATE OR REPLACE FUNCTION set_borrower_verification_pending()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.profile_completed = TRUE AND OLD.profile_completed = FALSE THEN
    NEW.verification_pending_until := NOW() + INTERVAL '24 hours';
    NEW.account_activated_at := NOW() + INTERVAL '24 hours';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER borrower_verification_pending_trigger
  BEFORE UPDATE ON borrowers
  FOR EACH ROW
  EXECUTE FUNCTION set_borrower_verification_pending();
