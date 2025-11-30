-- Add country column to lenders table for proper isolation
-- This is CRITICAL for preventing cross-border lending

-- Step 1: Add the country column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'country'
  ) THEN
    ALTER TABLE public.lenders
    ADD COLUMN country TEXT REFERENCES public.countries(code);

    RAISE NOTICE 'Added country column to lenders table';
  END IF;
END $$;

-- Step 2: Populate country from profiles for existing lenders
UPDATE lenders l
SET country = p.country_code
FROM profiles p
WHERE l.user_id = p.user_id
  AND l.country IS NULL
  AND p.country_code IS NOT NULL;

-- Step 3: Make country NOT NULL after populating
ALTER TABLE public.lenders
ALTER COLUMN country SET NOT NULL;

-- Step 4: Create index for country-based queries
CREATE INDEX IF NOT EXISTS idx_lenders_country ON public.lenders(country);

-- Log result
DO $$
DECLARE
  v_lender_count INT;
BEGIN
  SELECT COUNT(*) INTO v_lender_count
  FROM lenders
  WHERE country IS NOT NULL;

  RAISE NOTICE 'Fixed % lender records with country data', v_lender_count;
END $$;
