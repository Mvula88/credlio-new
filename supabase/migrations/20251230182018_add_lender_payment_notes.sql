-- Add lender notes column to repayment_schedules
-- This allows lenders to add notes explaining why payments haven't been updated

-- ============================================================================
-- 1. ADD lender_notes COLUMN TO REPAYMENT SCHEDULES
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'repayment_schedules'
    AND column_name = 'lender_notes'
  ) THEN
    ALTER TABLE public.repayment_schedules ADD COLUMN lender_notes TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'repayment_schedules'
    AND column_name = 'lender_notes_updated_at'
  ) THEN
    ALTER TABLE public.repayment_schedules ADD COLUMN lender_notes_updated_at TIMESTAMPTZ;
  END IF;
END $$;

-- ============================================================================
-- 2. CREATE FUNCTION TO UPDATE LENDER NOTES ON A PAYMENT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_payment_lender_notes(
  p_schedule_id UUID,
  p_notes TEXT
)
RETURNS JSON AS $$
DECLARE
  v_schedule RECORD;
  v_loan RECORD;
BEGIN
  -- Get the schedule
  SELECT rs.*, l.lender_id
  INTO v_schedule
  FROM public.repayment_schedules rs
  JOIN public.loans l ON l.id = rs.loan_id
  WHERE rs.id = p_schedule_id;

  IF v_schedule IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Payment schedule not found');
  END IF;

  -- Verify the current user is the lender
  IF v_schedule.lender_id != auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'Only the lender can update payment notes');
  END IF;

  -- Update the notes
  UPDATE public.repayment_schedules
  SET
    lender_notes = p_notes,
    lender_notes_updated_at = NOW(),
    updated_at = NOW()
  WHERE id = p_schedule_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Notes updated successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.update_payment_lender_notes(UUID, TEXT) TO authenticated;

-- ============================================================================
-- 3. ADD REJECTION REASON TO PAYMENT PROOFS IF NOT EXISTS
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'payment_proofs'
    AND column_name = 'rejection_reason'
  ) THEN
    ALTER TABLE public.payment_proofs ADD COLUMN rejection_reason TEXT;
  END IF;
END $$;

-- Log the migration
DO $$
BEGIN
  RAISE NOTICE 'Lender payment notes migration completed';
  RAISE NOTICE 'Features: lender_notes on repayment_schedules, update_payment_lender_notes function';
END $$;
