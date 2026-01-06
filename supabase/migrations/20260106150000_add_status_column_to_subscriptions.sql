-- Add missing status column to subscriptions table
-- The manual subscription activation migration references this column but never created it

DO $$
BEGIN
  -- Add status column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.subscriptions
    ADD COLUMN status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'paused', 'none'));

    RAISE NOTICE 'Added status column to subscriptions table';
  ELSE
    RAISE NOTICE 'Status column already exists in subscriptions table';
  END IF;
END $$;

-- Update existing subscriptions to have active status if they have a current_period_end in the future
UPDATE public.subscriptions
SET status = CASE
  WHEN current_period_end IS NOT NULL AND current_period_end > NOW() THEN 'active'
  WHEN current_period_end IS NOT NULL AND current_period_end <= NOW() THEN 'cancelled'
  ELSE 'none'
END
WHERE status IS NULL;

COMMENT ON COLUMN public.subscriptions.status IS 'Subscription status: active, cancelled, paused, or none';
