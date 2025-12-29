-- Add 'cancelled' status to loan_status and request_status enums

-- Add cancelled to loan_status
ALTER TYPE loan_status ADD VALUE IF NOT EXISTS 'cancelled' AFTER 'declined';

-- Add cancelled to request_status if not exists
DO $$
BEGIN
  -- Check if request_status enum exists and add cancelled
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'request_status') THEN
    ALTER TYPE request_status ADD VALUE IF NOT EXISTS 'cancelled';
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- Already exists, ignore
END $$;
