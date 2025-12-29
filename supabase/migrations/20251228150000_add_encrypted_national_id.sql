-- Add encrypted national_id for admin verification
-- The hash is still used for searches, but encrypted version allows admin to verify

-- Add encrypted national_id column to borrowers
ALTER TABLE public.borrowers
ADD COLUMN IF NOT EXISTS national_id_encrypted TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN public.borrowers.national_id_encrypted IS 'Base64 encoded national ID for admin verification. Hash is used for searches.';

-- Note: The encryption/decryption happens in application code
-- This stores the national ID in a reversible format for admin verification
-- while national_id_hash is used for secure searching
