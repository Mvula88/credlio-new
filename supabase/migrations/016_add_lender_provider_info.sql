-- Add provider information fields to lenders table
-- These fields support the provider info page (/l/provider-info)

-- Add new columns to lenders table
DO $$
BEGIN
  -- Registration number
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'registration_number'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN registration_number TEXT;
  END IF;

  -- Physical address
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'physical_address'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN physical_address TEXT;
  END IF;

  -- Postal address
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'postal_address'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN postal_address TEXT;
  END IF;

  -- Contact number
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'contact_number'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN contact_number TEXT;
  END IF;

  -- Email
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'email'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN email TEXT;
  END IF;

  -- Website
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'website'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN website TEXT;
  END IF;

  -- Business type
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'business_type'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN business_type TEXT;
  END IF;

  -- Years in operation
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'years_in_operation'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN years_in_operation INTEGER;
  END IF;

  -- Business description
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'description'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN description TEXT;
  END IF;

  -- Service areas (array of towns/cities)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'service_areas'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN service_areas TEXT[];
  END IF;

  -- Profile completion status
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'profile_completed'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN profile_completed BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Create index for service areas search
CREATE INDEX IF NOT EXISTS idx_lenders_service_areas ON public.lenders USING GIN (service_areas);

-- Create index for business type filtering
CREATE INDEX IF NOT EXISTS idx_lenders_business_type ON public.lenders(business_type);

-- Update RLS policies to include new fields (lenders can update their own profile)
-- The existing UPDATE policy should already cover these fields, but let's verify

COMMENT ON COLUMN public.lenders.registration_number IS 'Business registration number';
COMMENT ON COLUMN public.lenders.physical_address IS 'Physical business address';
COMMENT ON COLUMN public.lenders.postal_address IS 'Postal address';
COMMENT ON COLUMN public.lenders.contact_number IS 'Business contact number';
COMMENT ON COLUMN public.lenders.email IS 'Business email address';
COMMENT ON COLUMN public.lenders.website IS 'Business website URL';
COMMENT ON COLUMN public.lenders.business_type IS 'Type of lending business';
COMMENT ON COLUMN public.lenders.years_in_operation IS 'Number of years in operation';
COMMENT ON COLUMN public.lenders.description IS 'Business description and services offered';
COMMENT ON COLUMN public.lenders.service_areas IS 'Array of towns/cities served';
COMMENT ON COLUMN public.lenders.profile_completed IS 'Whether provider info has been completed';
