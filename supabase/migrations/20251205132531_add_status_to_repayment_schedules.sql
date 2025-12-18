-- Add status column to repayment_schedules
-- This column is required by the process_repayment function

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'repayment_schedules'
    AND column_name = 'status'
  ) THEN
    ALTER TABLE public.repayment_schedules
    ADD COLUMN status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'overdue', 'partial', 'waived'));

    -- Update existing schedules based on their payment status
    -- Mark as paid if paid_amount >= amount_due
    UPDATE public.repayment_schedules
    SET status = 'paid'
    WHERE COALESCE(paid_amount_minor, 0) >= amount_due_minor;

    -- Mark as partial if some payment made
    UPDATE public.repayment_schedules
    SET status = 'partial'
    WHERE COALESCE(paid_amount_minor, 0) > 0
    AND COALESCE(paid_amount_minor, 0) < amount_due_minor;

    -- Mark as overdue if past due date and not fully paid
    UPDATE public.repayment_schedules
    SET status = 'overdue'
    WHERE due_date < CURRENT_DATE
    AND COALESCE(paid_amount_minor, 0) < amount_due_minor
    AND status = 'pending';

    RAISE NOTICE 'Added status column to repayment_schedules';
  ELSE
    RAISE NOTICE 'status column already exists in repayment_schedules';
  END IF;
END $$;

-- Create index for status queries
CREATE INDEX IF NOT EXISTS idx_repayment_schedules_status
ON public.repayment_schedules(status);
