-- Fix storage policies for the evidence bucket
-- This bucket stores signed loan agreements and dispute evidence

-- Create the evidence storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evidence',
  'evidence',
  false, -- Private bucket - only accessible with proper auth
  26214400, -- 25MB max file size (for large scanned documents)
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 26214400,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

-- Drop existing policies if they exist (to recreate them cleanly)
DROP POLICY IF EXISTS "Users can upload own evidence" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own evidence" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view all evidence" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own evidence" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own evidence" ON storage.objects;
DROP POLICY IF EXISTS "Lenders can view borrower evidence for their loans" ON storage.objects;
DROP POLICY IF EXISTS "Borrowers can view lender evidence for their loans" ON storage.objects;

-- Allow authenticated users to upload their own evidence
-- Path structure: signed-agreements/{user_id}/loan-{loan_id}/...
-- OR: disputes/{user_id}/...
CREATE POLICY "Users can upload own evidence"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'evidence' AND
  (
    -- signed-agreements/{user_id}/... pattern
    (storage.foldername(name))[1] = 'signed-agreements' AND
    (storage.foldername(name))[2] = auth.uid()::text
  ) OR (
    -- disputes/{user_id}/... pattern
    (storage.foldername(name))[1] = 'disputes' AND
    (storage.foldername(name))[2] = auth.uid()::text
  ) OR (
    -- risk-flags/{user_id}/... pattern
    (storage.foldername(name))[1] = 'risk-flags' AND
    (storage.foldername(name))[2] = auth.uid()::text
  )
);

-- Allow users to view their own evidence
CREATE POLICY "Users can view own evidence"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'evidence' AND
  (
    -- signed-agreements/{user_id}/... pattern
    (storage.foldername(name))[1] = 'signed-agreements' AND
    (storage.foldername(name))[2] = auth.uid()::text
  ) OR (
    -- disputes/{user_id}/... pattern
    (storage.foldername(name))[1] = 'disputes' AND
    (storage.foldername(name))[2] = auth.uid()::text
  ) OR (
    -- risk-flags/{user_id}/... pattern
    (storage.foldername(name))[1] = 'risk-flags' AND
    (storage.foldername(name))[2] = auth.uid()::text
  )
);

-- Allow lenders to view borrower's signed agreements for loans they manage
CREATE POLICY "Lenders can view borrower evidence for their loans"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'evidence' AND
  (storage.foldername(name))[1] = 'signed-agreements' AND
  EXISTS (
    SELECT 1 FROM public.loans l
    WHERE l.lender_id = auth.uid()
    AND name LIKE '%loan-' || l.id::text || '%'
  )
);

-- Allow borrowers to view lender's signed agreements for their loans
CREATE POLICY "Borrowers can view lender evidence for their loans"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'evidence' AND
  (storage.foldername(name))[1] = 'signed-agreements' AND
  EXISTS (
    SELECT 1 FROM public.loans l
    JOIN public.borrowers b ON b.id = l.borrower_id
    WHERE b.user_id = auth.uid()
    AND name LIKE '%loan-' || l.id::text || '%'
  )
);

-- Allow admins to view all evidence
CREATE POLICY "Admins can view all evidence"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'evidence' AND
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Allow users to update/replace their own evidence
CREATE POLICY "Users can update own evidence"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'evidence' AND
  (
    (storage.foldername(name))[1] = 'signed-agreements' AND
    (storage.foldername(name))[2] = auth.uid()::text
  ) OR (
    (storage.foldername(name))[1] = 'disputes' AND
    (storage.foldername(name))[2] = auth.uid()::text
  ) OR (
    (storage.foldername(name))[1] = 'risk-flags' AND
    (storage.foldername(name))[2] = auth.uid()::text
  )
);

-- Allow users to delete their own evidence
CREATE POLICY "Users can delete own evidence"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'evidence' AND
  (
    (storage.foldername(name))[1] = 'signed-agreements' AND
    (storage.foldername(name))[2] = auth.uid()::text
  ) OR (
    (storage.foldername(name))[1] = 'disputes' AND
    (storage.foldername(name))[2] = auth.uid()::text
  ) OR (
    (storage.foldername(name))[1] = 'risk-flags' AND
    (storage.foldername(name))[2] = auth.uid()::text
  )
);
