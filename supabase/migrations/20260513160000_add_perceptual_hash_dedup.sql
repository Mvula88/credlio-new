-- Cross-borrower perceptual-hash duplicate detection
--
-- WHY: today the platform only stores SHA-256 file hashes. A fraudster who
-- re-photographs or re-encodes the same physical document (e.g. a "rented"
-- payslip) gets a different SHA-256 but the visual content is identical.
-- A perceptual hash (aHash on the 8x8 downsampled grayscale image) gives a
-- stable fingerprint that survives recompression, mild crops, and resizes.
--
-- We store the pHash as a hex string and check, on each insert, whether the
-- same pHash already exists under a *different* borrower. If yes, both rows
-- are flagged for admin attention.

BEGIN;

-- Add pHash to borrower selfies.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'borrower_documents'
    AND column_name = 'perceptual_hash'
  ) THEN
    ALTER TABLE public.borrower_documents
      ADD COLUMN perceptual_hash TEXT,
      ADD COLUMN cross_borrower_match_borrower_id UUID REFERENCES public.borrowers(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_borrower_docs_phash
  ON public.borrower_documents(perceptual_hash)
  WHERE perceptual_hash IS NOT NULL;

-- Add pHash to lender-checked documents.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'document_verifications'
    AND column_name = 'perceptual_hash'
  ) THEN
    ALTER TABLE public.document_verifications
      ADD COLUMN perceptual_hash TEXT,
      ADD COLUMN cross_borrower_match_borrower_id UUID REFERENCES public.borrowers(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_doc_verifs_phash
  ON public.document_verifications(perceptual_hash)
  WHERE perceptual_hash IS NOT NULL;

-- Trigger: on every borrower selfie insert/update, look for the same pHash
-- under a different borrower. If found, set the match field on both rows and
-- push the risk_score high enough to force admin review.
CREATE OR REPLACE FUNCTION public.detect_cross_borrower_selfie_match()
RETURNS TRIGGER AS $$
DECLARE
  v_match_borrower UUID;
BEGIN
  IF NEW.perceptual_hash IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT borrower_id INTO v_match_borrower
  FROM public.borrower_documents
  WHERE perceptual_hash = NEW.perceptual_hash
    AND borrower_id <> NEW.borrower_id
  ORDER BY uploaded_at ASC
  LIMIT 1;

  IF v_match_borrower IS NOT NULL THEN
    NEW.cross_borrower_match_borrower_id := v_match_borrower;
    NEW.risk_score := GREATEST(COALESCE(NEW.risk_score, 0), 90);
    NEW.risk_factors := COALESCE(NEW.risk_factors, ARRAY[]::TEXT[])
      || ARRAY['Same image fingerprint as another borrower'];

    -- Flag the older row as well so admins see the link from either side.
    UPDATE public.borrower_documents
    SET cross_borrower_match_borrower_id = NEW.borrower_id,
        risk_score = GREATEST(COALESCE(risk_score, 0), 90),
        risk_factors = COALESCE(risk_factors, ARRAY[]::TEXT[])
          || ARRAY['Same image fingerprint as another borrower'],
        updated_at = NOW()
    WHERE borrower_id = v_match_borrower
      AND perceptual_hash = NEW.perceptual_hash
      AND cross_borrower_match_borrower_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS before_borrower_doc_phash_check ON public.borrower_documents;
CREATE TRIGGER before_borrower_doc_phash_check
  BEFORE INSERT OR UPDATE OF perceptual_hash ON public.borrower_documents
  FOR EACH ROW
  WHEN (NEW.perceptual_hash IS NOT NULL)
  EXECUTE FUNCTION public.detect_cross_borrower_selfie_match();

-- Same trigger for lender-checked documents. A payslip whose pHash matches
-- another borrower's payslip — under a different borrower_id — is the
-- "rented document" signal.
CREATE OR REPLACE FUNCTION public.detect_cross_borrower_doc_match()
RETURNS TRIGGER AS $$
DECLARE
  v_match_borrower UUID;
BEGIN
  IF NEW.perceptual_hash IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT borrower_id INTO v_match_borrower
  FROM public.document_verifications
  WHERE perceptual_hash = NEW.perceptual_hash
    AND borrower_id <> NEW.borrower_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_match_borrower IS NOT NULL THEN
    NEW.cross_borrower_match_borrower_id := v_match_borrower;
    NEW.risk_score := GREATEST(COALESCE(NEW.risk_score, 0), 90);
    NEW.risk_level := 'high';
    NEW.risk_factors := COALESCE(NEW.risk_factors, ARRAY[]::TEXT[])
      || ARRAY['Same document fingerprint as another borrower'];
    NEW.status := 'flagged';

    UPDATE public.document_verifications
    SET cross_borrower_match_borrower_id = NEW.borrower_id,
        risk_score = GREATEST(COALESCE(risk_score, 0), 90),
        risk_level = 'high',
        risk_factors = COALESCE(risk_factors, ARRAY[]::TEXT[])
          || ARRAY['Same document fingerprint as another borrower'],
        status = 'flagged',
        updated_at = NOW()
    WHERE borrower_id = v_match_borrower
      AND perceptual_hash = NEW.perceptual_hash
      AND cross_borrower_match_borrower_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS before_doc_verif_phash_check ON public.document_verifications;
CREATE TRIGGER before_doc_verif_phash_check
  BEFORE INSERT OR UPDATE OF perceptual_hash ON public.document_verifications
  FOR EACH ROW
  WHEN (NEW.perceptual_hash IS NOT NULL)
  EXECUTE FUNCTION public.detect_cross_borrower_doc_match();

COMMENT ON COLUMN public.borrower_documents.perceptual_hash IS
  'aHash of the image (8x8 grayscale, 64-bit). Stable under recompression and small edits. Used for cross-borrower duplicate detection.';
COMMENT ON COLUMN public.document_verifications.perceptual_hash IS
  'aHash of the image (8x8 grayscale, 64-bit). Same image under a different borrower triggers a high-risk flag.';

COMMIT;
