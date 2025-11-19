-- Fix risk_factors array handling
-- Ensure the column has proper DEFAULT and the function handles NULLs correctly

-- Set proper default for risk_factors column (empty array instead of NULL)
ALTER TABLE public.borrower_documents
  ALTER COLUMN risk_factors SET DEFAULT ARRAY[]::TEXT[];

-- Recreate the risk calculation function with better NULL handling
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

  -- Initialize risk_factors as empty array if NULL
  IF v_doc.risk_factors IS NULL THEN
    v_risk_factors := ARRAY[]::TEXT[];
  ELSE
    v_risk_factors := v_doc.risk_factors;
  END IF;

  -- Check 1: Edited with photo editing software (+30 points)
  IF v_doc.edited_with_software THEN
    v_risk_score := v_risk_score + 30;
    v_risk_factors := array_append(v_risk_factors, 'Edited with photo software');
  END IF;

  -- Check 2: Created recently (+20 points)
  IF v_doc.created_recently THEN
    v_risk_score := v_risk_score + 20;
    v_risk_factors := array_append(v_risk_factors, 'Document created recently');
  END IF;

  -- Check 3: Modified after creation (+15 points)
  IF v_doc.modified_after_creation THEN
    v_risk_score := v_risk_score + 15;
    v_risk_factors := array_append(v_risk_factors, 'File modified after creation');
  END IF;

  -- Check 4: Is a screenshot (+10 points)
  IF v_doc.is_screenshot THEN
    v_risk_score := v_risk_score + 10;
    v_risk_factors := array_append(v_risk_factors, 'Appears to be a screenshot');
  END IF;

  -- Check 5: Missing EXIF data (+20 points)
  IF v_doc.missing_exif_data THEN
    v_risk_score := v_risk_score + 20;
    v_risk_factors := array_append(v_risk_factors, 'Missing photo metadata');
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
