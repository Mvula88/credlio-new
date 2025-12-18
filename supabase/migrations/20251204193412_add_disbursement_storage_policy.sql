-- Add storage policies for disbursement proof uploads
-- Lenders need to upload proof of payment to the evidence bucket

-- Allow lenders to upload disbursement proofs
-- Path pattern: disbursement-proofs/{user_id}/loan-{loan_id}/*
CREATE POLICY "Lenders can upload disbursement proofs"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'evidence'
    AND (storage.foldername(name))[1] = 'disbursement-proofs'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Allow lenders to view their own disbursement proofs
CREATE POLICY "Lenders can view own disbursement proofs"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'evidence'
    AND (storage.foldername(name))[1] = 'disbursement-proofs'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Allow borrowers to view disbursement proofs for their loans
CREATE POLICY "Borrowers can view disbursement proofs for their loans"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'evidence'
    AND (storage.foldername(name))[1] = 'disbursement-proofs'
    AND EXISTS (
      SELECT 1 FROM public.loans l
      JOIN public.borrower_user_links bul ON bul.borrower_id = l.borrower_id
      WHERE bul.user_id = auth.uid()
      AND name LIKE '%loan-' || l.id::text || '%'
    )
  );

-- Allow admins to view all disbursement proofs
CREATE POLICY "Admins can view all disbursement proofs"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'evidence'
    AND (storage.foldername(name))[1] = 'disbursement-proofs'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
    )
  );

-- Log migration
DO $$
BEGIN
  RAISE NOTICE 'Added storage policies for disbursement proof uploads';
END $$;
