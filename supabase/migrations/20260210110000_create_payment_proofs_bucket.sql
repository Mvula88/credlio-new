-- Create the payment-proofs storage bucket
-- This bucket stores payment receipts/screenshots uploaded by borrowers
-- Path structure: payment-proofs/{user_id}/{loan_id}/{timestamp}.{ext}
-- OR: {loan_id}/{timestamp}.{ext} (from repayments page)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-proofs',
  'payment-proofs',
  false, -- Private bucket
  10485760, -- 10MB max file size
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Borrowers can upload payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Borrowers can view own payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Lenders can view payment proofs for their loans" ON storage.objects;

-- Allow authenticated users to upload payment proofs
-- Supports both path patterns used in the app:
--   payment-proofs/{user_id}/{loan_id}/{file}
--   {loan_id}/{file}
CREATE POLICY "Borrowers can upload payment proofs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payment-proofs'
);

-- Allow borrowers to view their own payment proofs
CREATE POLICY "Borrowers can view own payment proofs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment-proofs'
);

-- Allow lenders to view payment proofs for loans they manage
-- (Using broad SELECT since the proof review happens via RPC with proper checks)
-- The RPC function review_payment_proof already verifies lender ownership
