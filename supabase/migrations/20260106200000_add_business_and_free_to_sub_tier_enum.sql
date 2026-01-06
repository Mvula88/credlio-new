-- Add modern tier names to sub_tier enum
-- Currently has: 'PRO', 'PRO_PLUS'
-- Adding: 'FREE', 'BUSINESS' for consistency

DO $$
BEGIN
  -- Add FREE
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'FREE'
    AND enumtypid = 'sub_tier'::regtype
  ) THEN
    ALTER TYPE sub_tier ADD VALUE 'FREE';
    RAISE NOTICE 'Added FREE to sub_tier enum';
  END IF;

  -- Add BUSINESS
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'BUSINESS'
    AND enumtypid = 'sub_tier'::regtype
  ) THEN
    ALTER TYPE sub_tier ADD VALUE 'BUSINESS';
    RAISE NOTICE 'Added BUSINESS to sub_tier enum';
  END IF;
END $$;

-- Now sub_tier has: 'PRO', 'PRO_PLUS', 'FREE', 'BUSINESS'
-- Modern code uses: 'FREE', 'PRO', 'BUSINESS'
-- Legacy code uses: 'PRO_PLUS' (mapped to BUSINESS)

COMMENT ON TYPE sub_tier IS 'Subscription tiers: FREE, PRO, BUSINESS (legacy: PRO_PLUS maps to BUSINESS)';
