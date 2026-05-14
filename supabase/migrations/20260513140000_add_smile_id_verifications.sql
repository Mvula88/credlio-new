-- Smile ID identity-verification integration
--
-- WHY: real third-party identity verification (face match + liveness +
-- government registry lookup) replaces in-house EXIF heuristics as the
-- authoritative signal for whether a borrower is who they claim to be.
-- Stores one row per Smile ID job. When result_code indicates Approved,
-- the borrower's verification_status is flipped to 'approved' automatically.
--
-- This migration adds the storage + a helper function. The actual Smile ID
-- API call happens client-side (web SDK) and the result lands here via the
-- /api/borrower/smile-id/callback route, which verifies the signature.

BEGIN;

-- Result codes returned by Smile ID. The full list is in their docs; we keep
-- the ones we care about and lump the rest under 'other'.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'smile_id_outcome') THEN
    CREATE TYPE smile_id_outcome AS ENUM (
      'approved',         -- 0810, 1020, 1022 — verified
      'rejected',         -- 0911, 0912, 0913 — failed
      'pending',          -- still processing or awaiting human review on Smile's side
      'no_match',         -- 1013 — registry lookup found no record
      'spoof',            -- 0911 specifically when liveness fails
      'duplicate',        -- 2415 — same ID used in another job
      'other'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.smile_id_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  borrower_id UUID NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Smile ID job identifiers
  job_id TEXT NOT NULL,             -- our reference (PartnerParams.job_id)
  smile_job_id TEXT,                -- Smile's internal job id
  job_type INT,                     -- 1=biometric KYC, 4=document verification, etc.
  country_code TEXT NOT NULL,       -- ISO-2, e.g. NA, ZA, BW
  id_type TEXT,                     -- NATIONAL_ID, PASSPORT, DRIVER_LICENSE, etc.

  -- Raw result
  result_code TEXT,                 -- e.g. '0810'
  result_text TEXT,                 -- human-readable reason
  confidence_value NUMERIC,         -- face-match confidence 0-100
  is_final_result BOOLEAN DEFAULT false,

  -- Normalized outcome for our gating logic
  outcome smile_id_outcome NOT NULL DEFAULT 'pending',

  -- Smile ID's own action breakdown — what passed, what failed
  actions JSONB,                    -- {Verify_ID_Number, Liveness_Check, Selfie_To_ID_Card_Comparison, ...}

  -- Full raw response for forensics / appeals
  raw_response JSONB,

  -- Signature verification status — were the headers valid when this arrived?
  signature_verified BOOLEAN NOT NULL DEFAULT false,
  signature_error TEXT,

  -- Timestamps
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(job_id)
);

CREATE INDEX IF NOT EXISTS idx_smile_id_borrower ON public.smile_id_verifications(borrower_id);
CREATE INDEX IF NOT EXISTS idx_smile_id_outcome ON public.smile_id_verifications(outcome);
CREATE INDEX IF NOT EXISTS idx_smile_id_user ON public.smile_id_verifications(user_id);

-- RLS: borrowers see their own results; admins see all.
ALTER TABLE public.smile_id_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Borrowers can view own Smile ID results"
  ON public.smile_id_verifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all Smile ID results"
  ON public.smile_id_verifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Service role manages Smile ID results"
  ON public.smile_id_verifications FOR ALL
  USING (auth.role() = 'service_role');

-- Track Smile ID outcome at the borrower level for fast gating queries.
-- These columns let the verification gate check approval without joining.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'borrower_self_verification_status'
    AND column_name = 'smile_id_outcome'
  ) THEN
    ALTER TABLE public.borrower_self_verification_status
      ADD COLUMN smile_id_outcome smile_id_outcome,
      ADD COLUMN smile_id_completed_at TIMESTAMPTZ,
      ADD COLUMN smile_id_job_id TEXT;
  END IF;
END $$;

-- When a Smile ID result lands as 'approved', flip the borrower's
-- verification_status to 'approved' so they don't have to wait for admin
-- review. This is the whole point of paying for Smile ID — it IS the review.
-- For any other outcome we leave verification_status alone (admin still
-- decides) so a bad Smile result doesn't lock out a legitimate borrower who
-- could be cleared manually.
CREATE OR REPLACE FUNCTION public.apply_smile_id_outcome()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.borrower_self_verification_status
  SET smile_id_outcome = NEW.outcome,
      smile_id_completed_at = COALESCE(NEW.completed_at, NOW()),
      smile_id_job_id = NEW.job_id,
      verification_status = CASE
        WHEN NEW.outcome = 'approved' AND NEW.is_final_result AND NEW.signature_verified
          THEN 'approved'
        ELSE verification_status
      END,
      verified_at = CASE
        WHEN NEW.outcome = 'approved' AND NEW.is_final_result AND NEW.signature_verified
          THEN NOW()
        ELSE verified_at
      END,
      rejection_reason = CASE
        WHEN NEW.outcome IN ('rejected', 'spoof', 'no_match', 'duplicate')
          THEN 'Smile ID: ' || COALESCE(NEW.result_text, NEW.outcome::text)
        ELSE rejection_reason
      END,
      updated_at = NOW()
  WHERE borrower_id = NEW.borrower_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_smile_id_result
  AFTER INSERT OR UPDATE ON public.smile_id_verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_smile_id_outcome();

COMMENT ON TABLE public.smile_id_verifications IS
  'Per-borrower Smile ID job results. Inserted by /api/borrower/smile-id/callback after signature verification. Approved + signature_verified rows auto-flip the borrower verification_status.';

COMMENT ON FUNCTION public.apply_smile_id_outcome IS
  'Propagates a Smile ID result to borrower_self_verification_status. Only signature-verified, final, approved results auto-approve; everything else leaves admin review intact.';

COMMIT;
