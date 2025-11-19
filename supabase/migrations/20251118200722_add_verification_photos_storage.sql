-- Add storage bucket for verification photos and file_url column

-- Create storage bucket for verification photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verification-photos',
  'verification-photos',
  false, -- Private bucket - only accessible with proper auth
  5242880, -- 5MB max file size
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Add file_url column to store the storage path
ALTER TABLE public.borrower_documents
ADD COLUMN IF NOT EXISTS file_url TEXT;

-- RLS policies for the storage bucket

-- Allow authenticated users to upload their own verification photos
CREATE POLICY "Users can upload own verification photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'verification-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to view their own photos
CREATE POLICY "Users can view own verification photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'verification-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow admins to view all verification photos
CREATE POLICY "Admins can view all verification photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'verification-photos' AND
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Allow users to update/replace their own photos
CREATE POLICY "Users can update own verification photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'verification-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own photos
CREATE POLICY "Users can delete own verification photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'verification-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
