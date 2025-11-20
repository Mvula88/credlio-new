-- Add enhanced verification fields to borrowers table
-- These fields make it harder for scammers while legitimate borrowers can easily provide this info

-- Physical Address
ALTER TABLE public.borrowers
ADD COLUMN IF NOT EXISTS street_address TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS postal_code TEXT;

-- Employment/Income Information
ALTER TABLE public.borrowers
ADD COLUMN IF NOT EXISTS employment_status TEXT CHECK (employment_status IN ('employed', 'self_employed', 'unemployed', 'student', 'retired')),
ADD COLUMN IF NOT EXISTS employer_name TEXT,
ADD COLUMN IF NOT EXISTS monthly_income_range TEXT CHECK (monthly_income_range IN ('0-1000', '1001-5000', '5001-10000', '10001-25000', '25001-50000', '50001+')),
ADD COLUMN IF NOT EXISTS income_source TEXT;

-- Emergency Contact
ALTER TABLE public.borrowers
ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT;

-- Next of Kin (different from emergency contact)
ALTER TABLE public.borrowers
ADD COLUMN IF NOT EXISTS next_of_kin_name TEXT,
ADD COLUMN IF NOT EXISTS next_of_kin_phone TEXT,
ADD COLUMN IF NOT EXISTS next_of_kin_relationship TEXT;

-- Bank Account Information
ALTER TABLE public.borrowers
ADD COLUMN IF NOT EXISTS bank_name TEXT,
ADD COLUMN IF NOT EXISTS bank_account_number TEXT, -- Will store encrypted or hashed
ADD COLUMN IF NOT EXISTS bank_account_name TEXT; -- Must match borrower name

-- Social Media / Digital Footprint (optional but builds trust)
ALTER TABLE public.borrowers
ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
ADD COLUMN IF NOT EXISTS facebook_url TEXT,
ADD COLUMN IF NOT EXISTS has_social_media BOOLEAN DEFAULT false;

-- Reference from existing user (optional)
ALTER TABLE public.borrowers
ADD COLUMN IF NOT EXISTS referrer_user_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS referrer_phone TEXT;

-- Add indexes for commonly queried fields
CREATE INDEX IF NOT EXISTS idx_borrowers_employment_status ON public.borrowers(employment_status);
CREATE INDEX IF NOT EXISTS idx_borrowers_city ON public.borrowers(city);
CREATE INDEX IF NOT EXISTS idx_borrowers_has_social_media ON public.borrowers(has_social_media);

-- Comment on columns for documentation
COMMENT ON COLUMN public.borrowers.street_address IS 'Full street address for identity verification';
COMMENT ON COLUMN public.borrowers.employment_status IS 'Current employment status';
COMMENT ON COLUMN public.borrowers.emergency_contact_name IS 'Name of emergency contact who can vouch for borrower';
COMMENT ON COLUMN public.borrowers.next_of_kin_name IS 'Next of kin - must be different from emergency contact';
COMMENT ON COLUMN public.borrowers.bank_account_name IS 'Bank account holder name - should match borrower full_name';
COMMENT ON COLUMN public.borrowers.has_social_media IS 'Whether borrower provided social media links - indicates digital presence';
