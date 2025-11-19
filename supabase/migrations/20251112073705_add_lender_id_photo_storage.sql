-- Add ID photo verification fields to lenders table
-- Photos are stored in Supabase Storage with encrypted references
-- Only admins can access actual photos for fraud investigation

DO $$
BEGIN
  -- Storage path for the ID photo in Supabase Storage
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'id_photo_path'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN id_photo_path TEXT;
  END IF;

  -- SHA-256 hash of the photo for integrity verification
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'id_photo_hash'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN id_photo_hash TEXT;
  END IF;

  -- Timestamp when photo was uploaded
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'id_photo_uploaded_at'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN id_photo_uploaded_at TIMESTAMPTZ;
  END IF;

  -- Admin verification status for the photo
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'id_photo_verified'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN id_photo_verified BOOLEAN DEFAULT FALSE;
  END IF;

  -- Admin who verified the photo (for audit trail)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'id_photo_verified_by'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN id_photo_verified_by UUID REFERENCES auth.users(id);
  END IF;

  -- Timestamp when photo was verified
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'id_photo_verified_at'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN id_photo_verified_at TIMESTAMPTZ;
  END IF;

  -- Optional rejection reason if photo is not acceptable
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lenders' AND column_name = 'id_photo_rejection_reason'
  ) THEN
    ALTER TABLE public.lenders ADD COLUMN id_photo_rejection_reason TEXT;
  END IF;

END $$;

-- Create index for quick lookup by photo hash
CREATE INDEX IF NOT EXISTS idx_lenders_id_photo_hash ON public.lenders(id_photo_hash) WHERE id_photo_hash IS NOT NULL;

-- Add comments
COMMENT ON COLUMN public.lenders.id_photo_path IS 'Path to ID photo in Supabase Storage (lender holding their ID document)';
COMMENT ON COLUMN public.lenders.id_photo_hash IS 'SHA-256 hash of the ID photo for integrity verification';
COMMENT ON COLUMN public.lenders.id_photo_uploaded_at IS 'When the ID photo was uploaded';
COMMENT ON COLUMN public.lenders.id_photo_verified IS 'Whether admin has verified the ID photo matches the lender';
COMMENT ON COLUMN public.lenders.id_photo_verified_by IS 'Admin user who verified the ID photo';
COMMENT ON COLUMN public.lenders.id_photo_verified_at IS 'When the ID photo was verified by admin';
COMMENT ON COLUMN public.lenders.id_photo_rejection_reason IS 'Reason for rejecting ID photo (if verification failed)';

-- Create Supabase Storage bucket for ID photos (admin-only access)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lender-id-photos',
  'lender-id-photos',
  false, -- Private bucket, not public
  5242880, -- 5MB max file size
  ARRAY['image/jpeg', 'image/jpg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: Lenders can upload their own ID photo
CREATE POLICY "Lenders can upload own ID photo"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'lender-id-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Storage policy: Lenders can update their own ID photo
CREATE POLICY "Lenders can update own ID photo"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'lender-id-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Storage policy: Lenders can view their own ID photo
CREATE POLICY "Lenders can view own ID photo"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'lender-id-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Storage policy: Admins can view all ID photos
CREATE POLICY "Admins can view all ID photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'lender-id-photos'
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);

-- Storage policy: Admins can delete ID photos (for cleanup)
CREATE POLICY "Admins can delete ID photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'lender-id-photos'
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);

-- Function to validate ID photo upload
CREATE OR REPLACE FUNCTION public.validate_id_photo_upload(
  p_lender_id UUID,
  p_photo_path TEXT,
  p_photo_hash TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_existing_hash TEXT;
BEGIN
  -- Check if this exact photo hash already exists for another lender
  SELECT id_photo_hash INTO v_existing_hash
  FROM public.lenders
  WHERE id_photo_hash = p_photo_hash
    AND user_id != p_lender_id
  LIMIT 1;

  -- If duplicate photo found, reject
  IF v_existing_hash IS NOT NULL THEN
    RAISE EXCEPTION 'This ID photo is already registered to another account';
  END IF;

  -- Update lender record with photo info
  UPDATE public.lenders
  SET
    id_photo_path = p_photo_path,
    id_photo_hash = p_photo_hash,
    id_photo_uploaded_at = NOW(),
    id_photo_verified = FALSE
  WHERE user_id = p_lender_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.validate_id_photo_upload(UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.validate_id_photo_upload(UUID, TEXT, TEXT) IS 'Validates and records ID photo upload, checking for duplicates';
