-- Fix auto_verify_borrower function to use correct column names
-- The column is duplicate_confidence, not confidence
-- The column is duplicate_reasons, not reasons

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

  -- Check for duplicates (use correct column names)
  SELECT is_duplicate, duplicate_confidence, duplicate_reasons
  INTO v_duplicate
  FROM public.duplicate_borrower_detection
  WHERE borrower_id = p_borrower_id;

  -- Decision logic
  IF v_duplicate.is_duplicate AND v_duplicate.duplicate_confidence >= 80 THEN
    -- INSTANT BAN: Duplicate detected
    v_status := 'banned';
    v_rejection_reason := 'Duplicate account detected: ' || array_to_string(v_duplicate.duplicate_reasons, ', ');
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
