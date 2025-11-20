-- ADD LENDER SUSPENSION FIELDS
-- Allows admin to suspend lenders doing suspicious activities

-- Add suspension fields to lenders table
ALTER TABLE public.lenders
ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES auth.users(id);

-- Create index for quick filtering of suspended lenders
CREATE INDEX IF NOT EXISTS idx_lenders_is_suspended ON public.lenders(is_suspended);

-- Function to log suspension/unsuspension in audit
CREATE OR REPLACE FUNCTION public.log_lender_suspension()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN
    INSERT INTO public.audit_logs (
      user_id,
      action,
      table_name,
      record_id,
      old_value,
      new_value,
      ip_address
    ) VALUES (
      auth.uid(),
      CASE WHEN NEW.is_suspended THEN 'LENDER_SUSPENDED' ELSE 'LENDER_UNSUSPENDED' END,
      'lenders',
      NEW.id,
      jsonb_build_object('is_suspended', OLD.is_suspended, 'reason', OLD.suspension_reason),
      jsonb_build_object('is_suspended', NEW.is_suspended, 'reason', NEW.suspension_reason),
      '0.0.0.0'
    );

    -- Update suspended_at and suspended_by
    IF NEW.is_suspended THEN
      NEW.suspended_at := NOW();
      NEW.suspended_by := auth.uid();
    ELSE
      NEW.suspended_at := NULL;
      NEW.suspended_by := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for suspension logging
DROP TRIGGER IF EXISTS log_lender_suspension_trigger ON public.lenders;

CREATE TRIGGER log_lender_suspension_trigger
  BEFORE UPDATE OF is_suspended
  ON public.lenders
  FOR EACH ROW
  EXECUTE FUNCTION public.log_lender_suspension();

-- ============================================================================
-- RLS POLICY TO BLOCK SUSPENDED LENDERS
-- Suspended lenders cannot view their own data or perform actions
-- ============================================================================

-- Note: For a complete block, you would need to add this check in middleware
-- Here we add a helper function that can be used in RLS policies

CREATE OR REPLACE FUNCTION public.is_lender_active(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_is_suspended BOOLEAN;
BEGIN
  SELECT is_suspended INTO v_is_suspended
  FROM public.lenders
  WHERE user_id = p_user_id;

  -- If not found or not suspended, return true (active)
  RETURN COALESCE(NOT v_is_suspended, true);
END;
$$;

-- ============================================================================
-- SUMMARY:
-- - is_suspended: Boolean flag to suspend/unsuspend lender
-- - suspension_reason: Reason for suspension (visible to admin)
-- - suspended_at: When the lender was suspended
-- - suspended_by: Admin who suspended the lender
-- - Audit log created for all suspension changes
-- ============================================================================
