-- Add file upload support for risk flag evidence
-- This allows admins to view actual proof documents instead of just hashes

-- Add proof_url column to risk_flags table
ALTER TABLE public.risk_flags
ADD COLUMN IF NOT EXISTS proof_url TEXT;

-- Update the constraint to require EITHER hash OR file URL (more flexible)
ALTER TABLE public.risk_flags
DROP CONSTRAINT IF EXISTS valid_proof;

ALTER TABLE public.risk_flags
ADD CONSTRAINT valid_proof CHECK (
  (origin = 'LENDER_REPORTED' AND (proof_sha256 IS NOT NULL OR proof_url IS NOT NULL)) OR
  origin = 'SYSTEM_AUTO'
);

-- Add comment explaining the change
COMMENT ON COLUMN public.risk_flags.proof_url IS
'URL to uploaded proof document in Supabase Storage. Preferred over hash-only for dispute resolution.';

COMMENT ON COLUMN public.risk_flags.proof_sha256 IS
'SHA-256 hash of proof document for tamper detection. Optional if proof_url is provided.';

-- Create storage bucket for risk flag evidence (if not exists)
-- This will be done via Supabase dashboard or storage API

-- Add index for proof_url lookups
CREATE INDEX IF NOT EXISTS idx_risk_flags_proof_url ON public.risk_flags(proof_url) WHERE proof_url IS NOT NULL;
