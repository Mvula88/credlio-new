-- Borrower Self-Verification System
-- Allows borrowers to upload documents themselves for automated verification
-- NO actual files stored - only metadata + hashes

-- Add selfie_with_id to document types if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_type') THEN
    CREATE TYPE document_type AS ENUM ('national_id', 'passport', 'selfie_with_id');
  ELSE
    -- Add selfie_with_id if it doesn't exist
    ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'selfie_with_id';
  END IF;
END $$;

-- Borrower self-uploaded documents table
CREATE TABLE IF NOT EXISTS public.borrower_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  borrower_id UUID NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Document information
  document_type document_type NOT NULL,

  -- File metadata (NO actual file stored)
  file_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash of file
  file_size_bytes BIGINT,
  file_extension TEXT, -- jpg, png, pdf

  -- Image EXIF metadata for photos
  exif_data JSONB, -- Full EXIF data
  camera_make TEXT,
  camera_model TEXT,
  software_used TEXT, -- Detects if edited with Photoshop, etc.
  gps_latitude DECIMAL,
  gps_longitude DECIMAL,
  photo_taken_at TIMESTAMPTZ,

  -- File creation metadata
  file_created_at TIMESTAMPTZ,
  file_modified_at TIMESTAMPTZ,

  -- Fraud detection flags (automatic)
  edited_with_software BOOLEAN DEFAULT false, -- Photoshop, GIMP, etc.
  created_recently BOOLEAN DEFAULT false, -- Created within last 24 hours
  modified_after_creation BOOLEAN DEFAULT false,
  is_screenshot BOOLEAN DEFAULT false,
  missing_exif_data BOOLEAN DEFAULT false,
  duplicate_hash BOOLEAN DEFAULT false, -- Same file uploaded before

  -- Risk scoring (automatic)
  risk_score INT DEFAULT 0, -- 0-100
  risk_factors TEXT[], -- Array of detected issues

  -- Verification status (automatic + admin override)
  status verification_status DEFAULT 'pending',
  auto_verified BOOLEAN DEFAULT false, -- System auto-approved
  manual_review_required BOOLEAN DEFAULT false,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Timestamps
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure borrower can only upload each document type once
  UNIQUE(borrower_id, document_type)
);

-- Duplicate detection index table
CREATE TABLE IF NOT EXISTS public.duplicate_borrower_detection (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Identity hashes
  national_id_hash TEXT NOT NULL,
  phone_e164 TEXT NOT NULL,

  -- Calculated similarity keys
  name_normalized TEXT, -- Lowercase, no spaces for matching
  dob_key TEXT, -- YYYY-MM-DD format

  -- Photo hashes for visual duplicate detection
  id_photo_hash TEXT,
  selfie_photo_hash TEXT,

  -- Device fingerprinting
  device_fingerprint TEXT,
  ip_address_hash TEXT,

  -- Original borrower
  borrower_id UUID NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Detection results
  duplicate_of UUID REFERENCES public.borrowers(id), -- If duplicate detected
  is_duplicate BOOLEAN DEFAULT false,
  duplicate_confidence INT DEFAULT 0, -- 0-100% confidence
  duplicate_reasons TEXT[], -- Why flagged as duplicate

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(borrower_id)
);

-- Overall borrower verification status
CREATE TABLE IF NOT EXISTS public.borrower_self_verification_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  borrower_id UUID NOT NULL UNIQUE REFERENCES public.borrowers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Document upload status
  national_id_uploaded BOOLEAN DEFAULT false,
  selfie_uploaded BOOLEAN DEFAULT false,

  -- Verification progress
  documents_required INT DEFAULT 2, -- national_id + selfie_with_id
  documents_uploaded INT DEFAULT 0,
  documents_verified INT DEFAULT 0,

  -- Overall risk assessment (automatic)
  overall_risk_score INT DEFAULT 0, -- Average of all documents
  overall_risk_level risk_level DEFAULT 'low',

  -- Duplicate detection result
  duplicate_detected BOOLEAN DEFAULT false,
  duplicate_of UUID REFERENCES public.borrowers(id),

  -- Final verification status (automatic decision)
  verification_status TEXT DEFAULT 'incomplete', -- incomplete, pending, approved, rejected, banned
  auto_approved BOOLEAN DEFAULT false,
  auto_rejected BOOLEAN DEFAULT false,
  rejection_reason TEXT,

  -- Manual admin override
  admin_override BOOLEAN DEFAULT false,
  admin_override_by UUID REFERENCES auth.users(id),
  admin_override_at TIMESTAMPTZ,
  admin_notes TEXT,

  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_borrower_docs_borrower ON public.borrower_documents(borrower_id);
CREATE INDEX idx_borrower_docs_status ON public.borrower_documents(status);
CREATE INDEX idx_borrower_docs_hash ON public.borrower_documents(file_hash);
CREATE INDEX idx_duplicate_detection_id_hash ON public.duplicate_borrower_detection(national_id_hash);
CREATE INDEX idx_duplicate_detection_phone ON public.duplicate_borrower_detection(phone_e164);
CREATE INDEX idx_duplicate_detection_name_dob ON public.duplicate_borrower_detection(name_normalized, dob_key);
CREATE INDEX idx_verification_status_borrower ON public.borrower_self_verification_status(borrower_id);
CREATE INDEX idx_verification_status_status ON public.borrower_self_verification_status(verification_status);

-- RLS Policies

ALTER TABLE public.borrower_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duplicate_borrower_detection ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrower_self_verification_status ENABLE ROW LEVEL SECURITY;

-- Borrowers can only view/upload their own documents
CREATE POLICY "Borrowers can view own documents"
  ON public.borrower_documents FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Borrowers can upload own documents"
  ON public.borrower_documents FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Borrowers can update own pending documents"
  ON public.borrower_documents FOR UPDATE
  USING (user_id = auth.uid() AND status = 'pending');

-- Admins can view all documents
CREATE POLICY "Admins can view all documents"
  ON public.borrower_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update all documents"
  ON public.borrower_documents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Duplicate detection: only system and admins
CREATE POLICY "System manages duplicate detection"
  ON public.duplicate_borrower_detection FOR ALL
  USING (auth.role() = 'service_role' OR EXISTS (
    SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
  ));

-- Verification status: borrowers can view own, admins can view all
CREATE POLICY "Borrowers can view own verification status"
  ON public.borrower_self_verification_status FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all verification statuses"
  ON public.borrower_self_verification_status FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "System manages verification status"
  ON public.borrower_self_verification_status FOR ALL
  USING (auth.role() = 'service_role' OR EXISTS (
    SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
  ));

-- Function: Check for duplicate borrower
CREATE OR REPLACE FUNCTION public.check_duplicate_borrower(
  p_borrower_id UUID,
  p_national_id_hash TEXT,
  p_phone_e164 TEXT,
  p_full_name TEXT,
  p_date_of_birth DATE
)
RETURNS TABLE (
  is_duplicate BOOLEAN,
  duplicate_borrower_id UUID,
  confidence INT,
  reasons TEXT[]
) AS $$
DECLARE
  v_name_normalized TEXT;
  v_dob_key TEXT;
  v_duplicate_id UUID;
  v_confidence INT := 0;
  v_reasons TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Normalize name for comparison
  v_name_normalized := LOWER(REGEXP_REPLACE(p_full_name, '\s+', '', 'g'));
  v_dob_key := p_date_of_birth::TEXT;

  -- Check 1: Exact national ID hash match (100% duplicate)
  SELECT borrower_id INTO v_duplicate_id
  FROM public.duplicate_borrower_detection
  WHERE national_id_hash = p_national_id_hash
    AND borrower_id != p_borrower_id
  LIMIT 1;

  IF v_duplicate_id IS NOT NULL THEN
    RETURN QUERY SELECT true, v_duplicate_id, 100, ARRAY['Same National ID']::TEXT[];
    RETURN;
  END IF;

  -- Check 2: Exact phone number match (80% confidence)
  SELECT borrower_id INTO v_duplicate_id
  FROM public.duplicate_borrower_detection
  WHERE phone_e164 = p_phone_e164
    AND borrower_id != p_borrower_id
  LIMIT 1;

  IF v_duplicate_id IS NOT NULL THEN
    v_confidence := 80;
    v_reasons := v_reasons || 'Same phone number';
  END IF;

  -- Check 3: Same name + date of birth (60% confidence)
  IF v_duplicate_id IS NULL THEN
    SELECT borrower_id INTO v_duplicate_id
    FROM public.duplicate_borrower_detection
    WHERE name_normalized = v_name_normalized
      AND dob_key = v_dob_key
      AND borrower_id != p_borrower_id
    LIMIT 1;

    IF v_duplicate_id IS NOT NULL THEN
      v_confidence := 60;
      v_reasons := v_reasons || 'Same name and date of birth';
    END IF;
  END IF;

  -- Return result
  IF v_confidence >= 60 THEN
    RETURN QUERY SELECT true, v_duplicate_id, v_confidence, v_reasons;
  ELSE
    RETURN QUERY SELECT false, NULL::UUID, 0, ARRAY[]::TEXT[];
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Calculate document risk score
CREATE OR REPLACE FUNCTION public.calculate_document_risk_score(
  p_document_id UUID
)
RETURNS INT AS $$
DECLARE
  v_doc RECORD;
  v_risk_score INT := 0;
  v_risk_factors TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Get document details
  SELECT * INTO v_doc
  FROM public.borrower_documents
  WHERE id = p_document_id;

  -- Check 1: Edited with photo editing software (+30 points)
  IF v_doc.edited_with_software THEN
    v_risk_score := v_risk_score + 30;
    v_risk_factors := v_risk_factors || 'Edited with photo software';
  END IF;

  -- Check 2: Created recently (+20 points)
  IF v_doc.created_recently THEN
    v_risk_score := v_risk_score + 20;
    v_risk_factors := v_risk_factors || 'Document created recently';
  END IF;

  -- Check 3: Modified after creation (+15 points)
  IF v_doc.modified_after_creation THEN
    v_risk_score := v_risk_score + 15;
    v_risk_factors := v_risk_factors || 'File modified after creation';
  END IF;

  -- Check 4: Is a screenshot (+10 points)
  IF v_doc.is_screenshot THEN
    v_risk_score := v_risk_score + 10;
    v_risk_factors := v_risk_factors || 'Appears to be a screenshot';
  END IF;

  -- Check 5: Missing EXIF data (+20 points)
  IF v_doc.missing_exif_data THEN
    v_risk_score := v_risk_score + 20;
    v_risk_factors := v_risk_factors || 'Missing photo metadata';
  END IF;

  -- Check 6: Duplicate file hash (+100 points - INSTANT FAIL)
  IF v_doc.duplicate_hash THEN
    v_risk_score := 100;
    v_risk_factors := ARRAY['Same document uploaded before'];
  END IF;

  -- Update document with calculated score
  UPDATE public.borrower_documents
  SET risk_score = v_risk_score,
      risk_factors = v_risk_factors,
      updated_at = NOW()
  WHERE id = p_document_id;

  RETURN v_risk_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Auto-verify borrower after document upload
CREATE OR REPLACE FUNCTION public.auto_verify_borrower(p_borrower_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_docs RECORD;
  v_duplicate RECORD;
  v_overall_risk INT := 0;
  v_status TEXT;
  v_rejection_reason TEXT;
BEGIN
  -- Get all documents
  SELECT
    COUNT(*) as total_docs,
    COUNT(*) FILTER (WHERE status = 'verified') as verified_docs,
    AVG(risk_score)::INT as avg_risk
  INTO v_docs
  FROM public.borrower_documents
  WHERE borrower_id = p_borrower_id;

  -- Check for duplicates
  SELECT is_duplicate, confidence, reasons
  INTO v_duplicate
  FROM public.duplicate_borrower_detection
  WHERE borrower_id = p_borrower_id;

  -- Decision logic
  IF v_duplicate.is_duplicate AND v_duplicate.confidence >= 80 THEN
    -- INSTANT BAN: Duplicate detected
    v_status := 'banned';
    v_rejection_reason := 'Duplicate account detected: ' || array_to_string(v_duplicate.reasons, ', ');
    v_overall_risk := 100;

  ELSIF v_docs.total_docs < 2 THEN
    -- Incomplete: Need both documents
    v_status := 'incomplete';
    v_rejection_reason := NULL;

  ELSIF v_docs.avg_risk >= 61 THEN
    -- AUTO-REJECT: High risk
    v_status := 'rejected';
    v_rejection_reason := 'Documents failed automated verification checks';
    v_overall_risk := v_docs.avg_risk;

  ELSIF v_docs.avg_risk >= 31 THEN
    -- FLAG FOR REVIEW: Medium risk
    v_status := 'pending';
    v_rejection_reason := 'Requires manual review';
    v_overall_risk := v_docs.avg_risk;

  ELSE
    -- AUTO-APPROVE: Low risk
    v_status := 'approved';
    v_rejection_reason := NULL;
    v_overall_risk := v_docs.avg_risk;
  END IF;

  -- Update verification status
  UPDATE public.borrower_self_verification_status
  SET
    documents_uploaded = v_docs.total_docs,
    documents_verified = v_docs.verified_docs,
    overall_risk_score = v_overall_risk,
    overall_risk_level = CASE
      WHEN v_overall_risk <= 30 THEN 'low'::risk_level
      WHEN v_overall_risk <= 60 THEN 'medium'::risk_level
      ELSE 'high'::risk_level
    END,
    verification_status = v_status,
    auto_approved = (v_status = 'approved'),
    auto_rejected = (v_status = 'rejected' OR v_status = 'banned'),
    rejection_reason = v_rejection_reason,
    duplicate_detected = v_duplicate.is_duplicate,
    duplicate_of = CASE WHEN v_duplicate.is_duplicate THEN
      (SELECT duplicate_of FROM public.duplicate_borrower_detection WHERE borrower_id = p_borrower_id)
      ELSE NULL
    END,
    completed_at = CASE WHEN v_docs.total_docs >= 2 THEN NOW() ELSE NULL END,
    verified_at = CASE WHEN v_status = 'approved' THEN NOW() ELSE NULL END,
    updated_at = NOW()
  WHERE borrower_id = p_borrower_id;

  RETURN v_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Auto-verify after document upload
CREATE OR REPLACE FUNCTION public.trigger_auto_verify_on_document_upload()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate risk score for this document
  PERFORM calculate_document_risk_score(NEW.id);

  -- Run auto-verification
  PERFORM auto_verify_borrower(NEW.borrower_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_borrower_document_upload
  AFTER INSERT OR UPDATE ON public.borrower_documents
  FOR EACH ROW
  EXECUTE FUNCTION trigger_auto_verify_on_document_upload();

-- Comments
COMMENT ON TABLE public.borrower_documents IS 'Borrower self-uploaded documents (metadata + hashes only, NO actual files)';
COMMENT ON TABLE public.duplicate_borrower_detection IS 'Detects duplicate borrowers trying to create multiple accounts';
COMMENT ON TABLE public.borrower_self_verification_status IS 'Overall borrower verification status with automated approval/rejection';
COMMENT ON FUNCTION public.check_duplicate_borrower IS 'Checks if borrower is a duplicate of an existing account';
COMMENT ON FUNCTION public.calculate_document_risk_score IS 'Calculates risk score for uploaded document based on metadata';
COMMENT ON FUNCTION public.auto_verify_borrower IS 'Automatically approves/rejects borrower based on all uploaded documents';
