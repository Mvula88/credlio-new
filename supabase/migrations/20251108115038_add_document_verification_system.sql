-- Document Verification System
-- Stores verification records for borrower documents to prevent fraud
-- Uses metadata hashes and verification flags (NOT actual documents)

-- Document types enum
CREATE TYPE document_type AS ENUM (
  'national_id',
  'passport',
  'proof_of_address',
  'bank_statement',
  'payslip',
  'employment_letter',
  'business_registration',
  'tax_clearance',
  'reference_letter'
);

-- Verification status enum
CREATE TYPE verification_status AS ENUM (
  'pending',
  'verified',
  'flagged',
  'rejected'
);

-- Risk level enum
CREATE TYPE risk_level AS ENUM (
  'low',      -- 0-30 risk score (green)
  'medium',   -- 31-60 risk score (yellow)
  'high'      -- 61-100 risk score (red)
);

-- Main document verification records table
CREATE TABLE IF NOT EXISTS public.document_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  borrower_id UUID NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,
  lender_id UUID NOT NULL, -- Lender who verified

  -- Document information
  document_type document_type NOT NULL,
  document_name TEXT NOT NULL, -- e.g., "Bank Statement - January 2024"

  -- Metadata from document (NO actual document stored)
  metadata JSONB, -- Full metadata extracted from document
  metadata_hash TEXT, -- SHA-256 hash of metadata for verification
  file_hash TEXT, -- SHA-256 hash of file (proves document existed)

  -- Metadata analysis results
  creator_software TEXT, -- PDF Creator software (e.g., "Adobe Acrobat", "Microsoft Word")
  creation_date TIMESTAMPTZ, -- When document was created
  modification_date TIMESTAMPTZ, -- When document was last modified
  was_modified BOOLEAN DEFAULT false, -- If modification_date != creation_date

  -- Fraud detection flags
  suspicious_creator BOOLEAN DEFAULT false, -- Created with photo editing software
  date_mismatch BOOLEAN DEFAULT false, -- Creation date doesn't match claimed date
  recent_creation BOOLEAN DEFAULT false, -- Created recently but claims to be old
  low_quality BOOLEAN DEFAULT false, -- Scanned or screenshot quality

  -- Risk scoring
  risk_score INT DEFAULT 0, -- 0-100 calculated risk score
  risk_level risk_level DEFAULT 'low',
  risk_factors TEXT[], -- Array of identified risk factors

  -- Verification decision
  status verification_status DEFAULT 'pending',
  verified_at TIMESTAMPTZ,
  verified_by UUID, -- User who made final decision
  verification_notes TEXT,

  -- AI analysis (optional, for future use)
  ai_analysis JSONB, -- Store GPT-4 Vision results if used
  ai_risk_score INT, -- AI-generated risk score

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Video liveness verification table
CREATE TABLE IF NOT EXISTS public.video_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  borrower_id UUID NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,
  lender_id UUID NOT NULL,

  -- Video metadata (NOT the actual video)
  video_hash TEXT NOT NULL, -- SHA-256 hash of video file
  video_duration_seconds INT, -- Duration in seconds
  video_size_bytes BIGINT, -- File size for verification

  -- Verification details
  recorded_at TIMESTAMPTZ NOT NULL,
  verification_type TEXT DEFAULT 'liveness_check', -- Type of video verification

  -- Liveness checks passed
  face_detected BOOLEAN DEFAULT false,
  id_shown BOOLEAN DEFAULT false,
  voice_recorded BOOLEAN DEFAULT false,
  document_shown BOOLEAN DEFAULT false,

  -- Risk assessment
  passed_verification BOOLEAN DEFAULT false,
  risk_flags TEXT[], -- Any concerns identified

  -- Notes
  verification_notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Overall borrower verification summary
CREATE TABLE IF NOT EXISTS public.borrower_verification_summary (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  borrower_id UUID NOT NULL UNIQUE REFERENCES public.borrowers(id) ON DELETE CASCADE,

  -- Document counts
  total_documents_required INT DEFAULT 5,
  total_documents_verified INT DEFAULT 0,

  -- Video verification
  video_verified BOOLEAN DEFAULT false,
  video_verification_id UUID REFERENCES public.video_verifications(id),

  -- Overall risk assessment
  overall_risk_score INT DEFAULT 0, -- Average of all document risk scores
  overall_risk_level risk_level DEFAULT 'low',

  -- Verification status
  verification_complete BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  verified_by UUID,

  -- Flags
  high_risk_flags INT DEFAULT 0, -- Count of high-risk documents
  requires_manual_review BOOLEAN DEFAULT false,

  -- Last update
  last_updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_doc_verifications_borrower ON public.document_verifications(borrower_id);
CREATE INDEX idx_doc_verifications_lender ON public.document_verifications(lender_id);
CREATE INDEX idx_doc_verifications_status ON public.document_verifications(status);
CREATE INDEX idx_doc_verifications_risk ON public.document_verifications(risk_level);
CREATE INDEX idx_video_verifications_borrower ON public.video_verifications(borrower_id);
CREATE INDEX idx_borrower_verification_summary_borrower ON public.borrower_verification_summary(borrower_id);

-- RLS Policies
ALTER TABLE public.document_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrower_verification_summary ENABLE ROW LEVEL SECURITY;

-- Lenders can view verifications for borrowers they're working with
CREATE POLICY "Lenders can view their verification records"
  ON public.document_verifications FOR SELECT
  USING (
    lender_id = jwt_uid()
    OR jwt_has_role('admin')
  );

-- Lenders can insert verification records
CREATE POLICY "Lenders can create verification records"
  ON public.document_verifications FOR INSERT
  WITH CHECK (
    lender_id = jwt_uid()
    AND jwt_has_role('lender')
  );

-- Lenders can update their own verification records
CREATE POLICY "Lenders can update their verification records"
  ON public.document_verifications FOR UPDATE
  USING (lender_id = jwt_uid() OR jwt_has_role('admin'));

-- Video verification policies
CREATE POLICY "Lenders can view video verifications"
  ON public.video_verifications FOR SELECT
  USING (lender_id = jwt_uid() OR jwt_has_role('admin'));

CREATE POLICY "Lenders can create video verifications"
  ON public.video_verifications FOR INSERT
  WITH CHECK (lender_id = jwt_uid() AND jwt_has_role('lender'));

-- Summary policies
CREATE POLICY "Lenders can view verification summaries"
  ON public.borrower_verification_summary FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.document_verifications dv
      WHERE dv.borrower_id = borrower_verification_summary.borrower_id
        AND dv.lender_id = jwt_uid()
    )
    OR jwt_has_role('admin')
  );

CREATE POLICY "Lenders can create verification summaries"
  ON public.borrower_verification_summary FOR INSERT
  WITH CHECK (jwt_has_role('lender') OR jwt_has_role('admin'));

CREATE POLICY "Lenders can update verification summaries"
  ON public.borrower_verification_summary FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.document_verifications dv
      WHERE dv.borrower_id = borrower_verification_summary.borrower_id
        AND dv.lender_id = jwt_uid()
    )
    OR jwt_has_role('admin')
  );

-- Function to calculate overall risk score
CREATE OR REPLACE FUNCTION public.calculate_verification_risk_score(p_borrower_id UUID)
RETURNS INT AS $$
DECLARE
  v_avg_score INT;
  v_high_risk_count INT;
  v_total_docs INT;
BEGIN
  -- Get average risk score from all verified documents
  SELECT
    COALESCE(AVG(risk_score)::INT, 0),
    COUNT(*) FILTER (WHERE risk_level = 'high'),
    COUNT(*)
  INTO v_avg_score, v_high_risk_count, v_total_docs
  FROM public.document_verifications
  WHERE borrower_id = p_borrower_id;

  -- If any document is high risk, boost overall score
  IF v_high_risk_count > 0 THEN
    v_avg_score := LEAST(v_avg_score + (v_high_risk_count * 10), 100);
  END IF;

  RETURN v_avg_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update verification summary
CREATE OR REPLACE FUNCTION public.update_verification_summary(p_borrower_id UUID)
RETURNS VOID AS $$
DECLARE
  v_overall_score INT;
  v_overall_level risk_level;
  v_doc_count INT;
  v_high_risk_count INT;
BEGIN
  -- Calculate overall risk score
  v_overall_score := calculate_verification_risk_score(p_borrower_id);

  -- Determine risk level
  IF v_overall_score <= 30 THEN
    v_overall_level := 'low';
  ELSIF v_overall_score <= 60 THEN
    v_overall_level := 'medium';
  ELSE
    v_overall_level := 'high';
  END IF;

  -- Count verified documents
  SELECT COUNT(*), COUNT(*) FILTER (WHERE risk_level = 'high')
  INTO v_doc_count, v_high_risk_count
  FROM public.document_verifications
  WHERE borrower_id = p_borrower_id
    AND status = 'verified';

  -- Upsert summary
  INSERT INTO public.borrower_verification_summary (
    borrower_id,
    total_documents_verified,
    overall_risk_score,
    overall_risk_level,
    high_risk_flags,
    requires_manual_review,
    last_updated_at
  ) VALUES (
    p_borrower_id,
    v_doc_count,
    v_overall_score,
    v_overall_level,
    v_high_risk_count,
    v_overall_score > 60 OR v_high_risk_count > 0,
    NOW()
  )
  ON CONFLICT (borrower_id) DO UPDATE SET
    total_documents_verified = EXCLUDED.total_documents_verified,
    overall_risk_score = EXCLUDED.overall_risk_score,
    overall_risk_level = EXCLUDED.overall_risk_level,
    high_risk_flags = EXCLUDED.high_risk_flags,
    requires_manual_review = EXCLUDED.requires_manual_review,
    last_updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update summary when document verification changes
CREATE OR REPLACE FUNCTION public.trigger_update_verification_summary()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM update_verification_summary(NEW.borrower_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_document_verification_change
  AFTER INSERT OR UPDATE ON public.document_verifications
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_verification_summary();

-- Comments
COMMENT ON TABLE public.document_verifications IS 'Stores document verification records using metadata hashes only (NO actual documents stored)';
COMMENT ON TABLE public.video_verifications IS 'Stores video liveness verification hashes (NOT actual videos)';
COMMENT ON TABLE public.borrower_verification_summary IS 'Overall verification status and risk assessment for each borrower';
COMMENT ON FUNCTION public.calculate_verification_risk_score IS 'Calculates overall risk score from all document verifications';
COMMENT ON FUNCTION public.update_verification_summary IS 'Updates borrower verification summary after document verification changes';
