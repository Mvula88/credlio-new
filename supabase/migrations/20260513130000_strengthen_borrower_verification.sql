-- Strengthen borrower self-verification: kill auto-approve, harden risk weights
--
-- WHY: prior policy auto-approved any borrower whose document risk_score <= 30.
-- Combined with the live client-side upload hardcoding `missing_exif_data: true`
-- and only +20 for that flag, the practical effect was: anyone whose photo did
-- not look freshly taken (created_recently=false) sailed through with a risk
-- score of 20 and an instant 'approved' status, no admin review.
--
-- This migration:
--   1. Reweights `calculate_document_risk_score` so single critical flags
--      (missing_exif_data, is_screenshot, edited_with_software) push a
--      document into "needs review" or "auto-reject" territory on their own.
--   2. Removes the auto-approve branch from `auto_verify_borrower`. Low-risk
--      submissions land in 'pending' (admin must review). Auto-reject for
--      high-risk and auto-ban for duplicates remain — they save admin time
--      on the obvious fraud cases.
--
-- Defensive: only touches functions. Existing borrower rows are not changed;
-- only future inserts/updates to borrower_documents flow through the new
-- decision logic (the trigger calls these functions).

BEGIN;

-- Rewrite risk scoring with higher weights on signals that are genuinely
-- diagnostic of fraud (edited, screenshot, no EXIF at all).
CREATE OR REPLACE FUNCTION public.calculate_document_risk_score(
  p_document_id UUID
)
RETURNS INT AS $$
DECLARE
  v_doc RECORD;
  v_risk_score INT := 0;
  v_risk_factors TEXT[] := ARRAY[]::TEXT[];
BEGIN
  SELECT * INTO v_doc
  FROM public.borrower_documents
  WHERE id = p_document_id;

  IF v_doc.risk_factors IS NULL THEN
    v_risk_factors := ARRAY[]::TEXT[];
  ELSE
    v_risk_factors := v_doc.risk_factors;
  END IF;

  -- Edited with photo software: standalone auto-reject signal
  IF v_doc.edited_with_software THEN
    v_risk_score := v_risk_score + 70;
    v_risk_factors := array_append(v_risk_factors, 'Edited with photo software');
  END IF;

  -- Screenshot: real ID photos are not screenshots
  IF v_doc.is_screenshot THEN
    v_risk_score := v_risk_score + 70;
    v_risk_factors := array_append(v_risk_factors, 'Appears to be a screenshot');
  END IF;

  -- Missing EXIF: phone-camera photos always carry EXIF; absence is suspicious
  IF v_doc.missing_exif_data THEN
    v_risk_score := v_risk_score + 60;
    v_risk_factors := array_append(v_risk_factors, 'Missing photo metadata');
  END IF;

  -- Modified after creation: file was touched after the camera wrote it
  IF v_doc.modified_after_creation THEN
    v_risk_score := v_risk_score + 40;
    v_risk_factors := array_append(v_risk_factors, 'File modified after creation');
  END IF;

  -- Created in last 24h: a normal signal for fresh signups, weak by itself
  IF v_doc.created_recently THEN
    v_risk_score := v_risk_score + 10;
    v_risk_factors := array_append(v_risk_factors, 'Document created recently');
  END IF;

  -- Duplicate file uploaded before: instant fail
  IF v_doc.duplicate_hash THEN
    v_risk_score := 100;
    v_risk_factors := ARRAY['Same document uploaded before'];
  END IF;

  -- Cap at 100
  IF v_risk_score > 100 THEN
    v_risk_score := 100;
  END IF;

  UPDATE public.borrower_documents
  SET risk_score = v_risk_score,
      risk_factors = v_risk_factors,
      updated_at = NOW()
  WHERE id = p_document_id;

  RETURN v_risk_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Kill auto-approve. Low-risk submissions go to 'pending' for admin review.
-- High-risk auto-reject and duplicate auto-ban are retained because they cut
-- admin workload on cases that are obviously fraud.
CREATE OR REPLACE FUNCTION public.auto_verify_borrower(p_borrower_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_docs RECORD;
  v_duplicate RECORD;
  v_current_status TEXT;
  v_overall_risk INT := 0;
  v_status TEXT;
  v_rejection_reason TEXT;
  v_has_selfie BOOLEAN := false;
BEGIN
  SELECT verification_status INTO v_current_status
  FROM public.borrower_self_verification_status
  WHERE borrower_id = p_borrower_id;

  SELECT
    COUNT(*) as total_docs,
    COUNT(*) FILTER (WHERE status = 'verified') as verified_docs,
    AVG(risk_score)::INT as avg_risk,
    BOOL_OR(document_type = 'selfie_with_id') as has_selfie
  INTO v_docs
  FROM public.borrower_documents
  WHERE borrower_id = p_borrower_id;

  v_has_selfie := COALESCE(v_docs.has_selfie, false);

  SELECT is_duplicate, duplicate_confidence, duplicate_reasons
  INTO v_duplicate
  FROM public.duplicate_borrower_detection
  WHERE borrower_id = p_borrower_id;

  IF v_duplicate.is_duplicate AND v_duplicate.duplicate_confidence >= 80 THEN
    -- Duplicate of an existing account: instant ban
    v_status := 'banned';
    v_rejection_reason := 'Duplicate account detected: ' || array_to_string(v_duplicate.duplicate_reasons, ', ');
    v_overall_risk := 100;

  ELSIF v_docs.total_docs < 1 THEN
    v_status := 'incomplete';
    v_rejection_reason := NULL;

  ELSIF v_current_status = 'rejected' THEN
    -- Re-submission after rejection always goes through admin review again
    v_status := 'pending';
    v_rejection_reason := 'Re-submitted for manual review';
    v_overall_risk := COALESCE(v_docs.avg_risk, 0);

  ELSIF v_docs.avg_risk >= 61 THEN
    -- Clearly suspicious: auto-reject so admins do not waste time on it
    v_status := 'rejected';
    v_rejection_reason := 'Documents failed automated verification checks';
    v_overall_risk := v_docs.avg_risk;

  ELSE
    -- Everything else (including former auto-approve range) goes to admin review
    v_status := 'pending';
    v_rejection_reason := 'Awaiting admin review';
    v_overall_risk := COALESCE(v_docs.avg_risk, 0);
  END IF;

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
    auto_approved = false,
    auto_rejected = (v_status = 'rejected' OR v_status = 'banned'),
    rejection_reason = v_rejection_reason,
    duplicate_detected = v_duplicate.is_duplicate,
    duplicate_of = CASE WHEN v_duplicate.is_duplicate THEN
      (SELECT duplicate_of FROM public.duplicate_borrower_detection WHERE borrower_id = p_borrower_id)
      ELSE NULL
    END,
    selfie_uploaded = v_has_selfie,
    completed_at = CASE WHEN v_docs.total_docs >= 1 THEN NOW() ELSE NULL END,
    verified_at = NULL,
    updated_at = NOW()
  WHERE borrower_id = p_borrower_id;

  RETURN v_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.auto_verify_borrower IS
  'Decides incomplete/pending/rejected/banned for a borrower after document upload. Auto-approve is intentionally disabled: every legitimate borrower goes through admin review.';

COMMIT;
