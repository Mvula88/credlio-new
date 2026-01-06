-- Add manual subscription activation/deactivation to audit_action enum
-- These are needed for logging manual subscription changes in audit_ledger

-- Add new enum values if they don't exist
DO $$
BEGIN
  -- Add manual_subscription_activation
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'manual_subscription_activation'
    AND enumtypid = 'audit_action'::regtype
  ) THEN
    ALTER TYPE audit_action ADD VALUE 'manual_subscription_activation';
    RAISE NOTICE 'Added manual_subscription_activation to audit_action enum';
  END IF;

  -- Add manual_subscription_deactivation
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'manual_subscription_deactivation'
    AND enumtypid = 'audit_action'::regtype
  ) THEN
    ALTER TYPE audit_action ADD VALUE 'manual_subscription_deactivation';
    RAISE NOTICE 'Added manual_subscription_deactivation to audit_action enum';
  END IF;
END $$;

COMMENT ON TYPE audit_action IS 'Audit actions including manual subscription management';
