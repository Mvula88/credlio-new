-- Allow borrower-initiated video attestations.
--
-- The original video_verifications schema assumed the lender uploads the
-- video and required lender_id NOT NULL. Under the new model the borrower
-- records the attestation themselves for their loan request, and no
-- specific lender is bound yet (loan_requests is open to the marketplace).
-- Make lender_id nullable so the row can exist before a lender accepts.

BEGIN;

ALTER TABLE public.video_verifications
  ALTER COLUMN lender_id DROP NOT NULL;

COMMIT;
