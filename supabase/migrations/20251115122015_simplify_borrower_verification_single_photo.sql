-- Simplify borrower verification to single selfie with ID photo
-- Remove national_id_uploaded field (no longer needed)
-- Keep selfie_uploaded field (this is the only photo required now)
-- Update documents_required to 1 instead of 2

BEGIN;

-- Drop the national_id_uploaded column if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'borrower_self_verification_status'
    AND column_name = 'national_id_uploaded'
  ) THEN
    ALTER TABLE public.borrower_self_verification_status
    DROP COLUMN national_id_uploaded;
  END IF;
END $$;

-- Drop the national_id_hash column if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'borrower_self_verification_status'
    AND column_name = 'national_id_hash'
  ) THEN
    ALTER TABLE public.borrower_self_verification_status
    DROP COLUMN national_id_hash;
  END IF;
END $$;

-- Update documents_required default to 1 (only selfie with ID needed)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'borrower_self_verification_status'
    AND column_name = 'documents_required'
  ) THEN
    ALTER TABLE public.borrower_self_verification_status
    ALTER COLUMN documents_required SET DEFAULT 1;

    -- Update existing rows to have documents_required = 1
    UPDATE public.borrower_self_verification_status
    SET documents_required = 1
    WHERE documents_required != 1;
  END IF;
END $$;

-- Update documents_uploaded count for existing records
-- If they have selfie_uploaded = true, set documents_uploaded = 1
UPDATE public.borrower_self_verification_status
SET documents_uploaded = CASE
  WHEN selfie_uploaded = true THEN 1
  ELSE 0
END;

COMMIT;

-- Document what this migration does:
-- 1. Removes national_id_uploaded column (no longer needed)
-- 2. Removes national_id_hash column (no longer needed)
-- 3. Changes documents_required to 1 (only selfie with ID needed)
-- 4. Updates documents_uploaded count based on selfie_uploaded status
