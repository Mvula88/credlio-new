-- Add BASIC tier to sub_tier enum
-- This allows free tier subscriptions for new lenders

-- Add BASIC to the enum if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum
        WHERE enumlabel = 'BASIC'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'sub_tier')
    ) THEN
        ALTER TYPE sub_tier ADD VALUE IF NOT EXISTS 'BASIC' BEFORE 'PRO';
    END IF;
END $$;

-- Make tier column nullable to allow users without subscriptions
ALTER TABLE public.subscriptions ALTER COLUMN tier DROP NOT NULL;
