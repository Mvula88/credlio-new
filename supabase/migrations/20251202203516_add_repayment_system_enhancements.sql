-- Repayment System Enhancements
-- Adds: process_repayment function, payment reminders, overdue tracking

-- ============================================================================
-- 1. CREATE process_repayment FUNCTION (called by UI but doesn't exist)
-- This function updates the loan's total_repaid and checks for completion
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_repayment(
  p_loan_id UUID,
  p_amount DECIMAL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_loan RECORD;
  v_total_due DECIMAL;
  v_new_total_repaid DECIMAL;
  v_borrower_user_id UUID;
  v_currency_symbol TEXT;
BEGIN
  -- Get loan details
  SELECT
    l.id, l.lender_id, l.borrower_id, l.status, l.currency,
    COALESCE(l.total_repaid, 0) as total_repaid,
    b.full_name as borrower_name
  INTO v_loan
  FROM public.loans l
  JOIN public.borrowers b ON b.id = l.borrower_id
  WHERE l.id = p_loan_id;

  IF v_loan IS NULL THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;

  -- Check caller is the lender
  IF v_loan.lender_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the lender can process repayments for their loans';
  END IF;

  -- Check loan is active
  IF v_loan.status != 'active' THEN
    RAISE EXCEPTION 'Can only process repayments for active loans';
  END IF;

  -- Update total_repaid
  v_new_total_repaid := v_loan.total_repaid + p_amount;

  UPDATE public.loans
  SET
    total_repaid = v_new_total_repaid,
    updated_at = NOW()
  WHERE id = p_loan_id;

  -- Calculate total due from repayment schedules
  SELECT COALESCE(SUM(amount_due_minor), 0) / 100.0 INTO v_total_due
  FROM public.repayment_schedules
  WHERE loan_id = p_loan_id;

  -- Get currency symbol
  v_currency_symbol := CASE
    WHEN v_loan.currency = 'USD' THEN '$'
    WHEN v_loan.currency = 'KES' THEN 'KSh'
    WHEN v_loan.currency = 'UGX' THEN 'USh'
    WHEN v_loan.currency = 'TZS' THEN 'TSh'
    WHEN v_loan.currency = 'RWF' THEN 'FRw'
    WHEN v_loan.currency = 'NGN' THEN 'N'
    WHEN v_loan.currency = 'GHS' THEN 'GHC'
    WHEN v_loan.currency = 'ZAR' THEN 'R'
    WHEN v_loan.currency = 'EUR' THEN 'EUR'
    WHEN v_loan.currency = 'GBP' THEN 'GBP'
    ELSE v_loan.currency || ' '
  END;

  -- Notify lender about payment received
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    link,
    target_role
  ) VALUES (
    v_loan.lender_id,
    'payment_received',
    'Payment Received',
    v_currency_symbol || p_amount::TEXT || ' received from ' || v_loan.borrower_name,
    '/l/repayments',
    'lender'
  );

  -- Check if loan is fully paid
  IF v_new_total_repaid >= v_total_due THEN
    -- Mark loan as completed
    UPDATE public.loans
    SET
      status = 'completed',
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = p_loan_id;

    -- Notify lender about loan completion
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      message,
      link,
      target_role
    ) VALUES (
      v_loan.lender_id,
      'loan_completed',
      'Loan Fully Repaid',
      'Loan to ' || v_loan.borrower_name || ' has been fully repaid!',
      '/l/loans/' || p_loan_id,
      'lender'
    );

    -- Get borrower user_id from borrower_user_links
    SELECT user_id INTO v_borrower_user_id
    FROM public.borrower_user_links
    WHERE borrower_id = v_loan.borrower_id
    LIMIT 1;

    IF v_borrower_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        link,
        target_role
      ) VALUES (
        v_borrower_user_id,
        'loan_completed',
        'Loan Fully Repaid',
        'Congratulations! Your loan has been fully repaid.',
        '/b/loans',
        'borrower'
      );
    END IF;

    -- Update borrower credit score positively
    UPDATE public.borrowers
    SET
      credit_score = LEAST(COALESCE(credit_score, 500) + 25, 850),
      updated_at = NOW()
    WHERE id = v_loan.borrower_id;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.process_repayment(UUID, DECIMAL) TO authenticated;


-- ============================================================================
-- 2. ADD total_repaid COLUMN TO loans IF NOT EXISTS
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'loans'
    AND column_name = 'total_repaid'
  ) THEN
    ALTER TABLE public.loans ADD COLUMN total_repaid DECIMAL(15, 2) DEFAULT 0;
  END IF;
END $$;


-- ============================================================================
-- 3. CREATE FUNCTION TO CHECK AND UPDATE OVERDUE PAYMENTS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_overdue_schedules()
RETURNS INTEGER AS $$
DECLARE
  v_updated_count INTEGER := 0;
  v_schedule RECORD;
  v_borrower_user_id UUID;
  v_currency_symbol TEXT;
  v_amount_due DECIMAL;
BEGIN
  -- Find all pending schedules that are past due date
  FOR v_schedule IN
    SELECT
      rs.id,
      rs.loan_id,
      rs.amount_due_minor,
      rs.due_date,
      l.lender_id,
      l.borrower_id,
      l.currency,
      b.full_name as borrower_name
    FROM public.repayment_schedules rs
    JOIN public.loans l ON l.id = rs.loan_id
    JOIN public.borrowers b ON b.id = l.borrower_id
    WHERE rs.status = 'pending'
    AND rs.due_date < CURRENT_DATE
    AND l.status = 'active'
  LOOP
    -- Update schedule status to overdue
    UPDATE public.repayment_schedules
    SET status = 'overdue', updated_at = NOW()
    WHERE id = v_schedule.id
    AND status = 'pending';

    IF FOUND THEN
      v_updated_count := v_updated_count + 1;

      -- Get currency symbol
      v_currency_symbol := CASE
        WHEN v_schedule.currency = 'USD' THEN '$'
        WHEN v_schedule.currency = 'KES' THEN 'KSh'
        WHEN v_schedule.currency = 'UGX' THEN 'USh'
        WHEN v_schedule.currency = 'TZS' THEN 'TSh'
        WHEN v_schedule.currency = 'RWF' THEN 'FRw'
        WHEN v_schedule.currency = 'NGN' THEN 'N'
        WHEN v_schedule.currency = 'GHS' THEN 'GHC'
        WHEN v_schedule.currency = 'ZAR' THEN 'R'
        WHEN v_schedule.currency = 'EUR' THEN 'EUR'
        WHEN v_schedule.currency = 'GBP' THEN 'GBP'
        ELSE v_schedule.currency || ' '
      END;

      v_amount_due := v_schedule.amount_due_minor / 100.0;

      -- Notify lender about overdue payment
      INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        link,
        target_role
      ) VALUES (
        v_schedule.lender_id,
        'payment_overdue',
        'Payment Overdue',
        v_schedule.borrower_name || ' has an overdue payment of ' || v_currency_symbol || v_amount_due::TEXT,
        '/l/repayments',
        'lender'
      );

      -- Get borrower user_id and notify
      SELECT user_id INTO v_borrower_user_id
      FROM public.borrower_user_links
      WHERE borrower_id = v_schedule.borrower_id
      LIMIT 1;

      IF v_borrower_user_id IS NOT NULL THEN
        INSERT INTO public.notifications (
          user_id,
          type,
          title,
          message,
          link,
          target_role
        ) VALUES (
          v_borrower_user_id,
          'payment_overdue',
          'Payment Overdue',
          'Your payment of ' || v_currency_symbol || v_amount_due::TEXT || ' is overdue. Please make payment immediately.',
          '/b/loans',
          'borrower'
        );
      END IF;

      -- Decrease borrower credit score for overdue payment
      UPDATE public.borrowers
      SET
        credit_score = GREATEST(COALESCE(credit_score, 500) - 15, 300),
        updated_at = NOW()
      WHERE id = v_schedule.borrower_id;
    END IF;
  END LOOP;

  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 4. CREATE FUNCTION TO SEND PAYMENT REMINDERS (3 days before due)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.send_payment_reminders()
RETURNS INTEGER AS $$
DECLARE
  v_reminder_count INTEGER := 0;
  v_schedule RECORD;
  v_borrower_user_id UUID;
  v_currency_symbol TEXT;
  v_amount_due DECIMAL;
  v_days_until_due INTEGER;
BEGIN
  -- Find schedules due in 3 days that haven't been reminded yet
  FOR v_schedule IN
    SELECT
      rs.id,
      rs.loan_id,
      rs.amount_due_minor,
      rs.due_date,
      rs.reminder_sent,
      l.lender_id,
      l.borrower_id,
      l.currency,
      b.full_name as borrower_name
    FROM public.repayment_schedules rs
    JOIN public.loans l ON l.id = rs.loan_id
    JOIN public.borrowers b ON b.id = l.borrower_id
    WHERE rs.status = 'pending'
    AND rs.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'
    AND l.status = 'active'
    AND (rs.reminder_sent IS NULL OR rs.reminder_sent = false)
  LOOP
    v_days_until_due := (v_schedule.due_date - CURRENT_DATE);

    -- Get currency symbol
    v_currency_symbol := CASE
      WHEN v_schedule.currency = 'USD' THEN '$'
      WHEN v_schedule.currency = 'KES' THEN 'KSh'
      WHEN v_schedule.currency = 'UGX' THEN 'USh'
      WHEN v_schedule.currency = 'TZS' THEN 'TSh'
      WHEN v_schedule.currency = 'RWF' THEN 'FRw'
      WHEN v_schedule.currency = 'NGN' THEN 'N'
      WHEN v_schedule.currency = 'GHS' THEN 'GHC'
      WHEN v_schedule.currency = 'ZAR' THEN 'R'
      WHEN v_schedule.currency = 'EUR' THEN 'EUR'
      WHEN v_schedule.currency = 'GBP' THEN 'GBP'
      ELSE v_schedule.currency || ' '
    END;

    v_amount_due := v_schedule.amount_due_minor / 100.0;

    -- Get borrower user_id
    SELECT user_id INTO v_borrower_user_id
    FROM public.borrower_user_links
    WHERE borrower_id = v_schedule.borrower_id
    LIMIT 1;

    IF v_borrower_user_id IS NOT NULL THEN
      -- Notify borrower about upcoming payment
      INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        link,
        target_role
      ) VALUES (
        v_borrower_user_id,
        'payment_due',
        'Payment Reminder',
        'Your payment of ' || v_currency_symbol || v_amount_due::TEXT || ' is due in ' || v_days_until_due || ' day(s).',
        '/b/loans',
        'borrower'
      );

      -- Mark as reminded
      UPDATE public.repayment_schedules
      SET reminder_sent = true, updated_at = NOW()
      WHERE id = v_schedule.id;

      v_reminder_count := v_reminder_count + 1;
    END IF;
  END LOOP;

  RETURN v_reminder_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 5. ADD reminder_sent COLUMN TO repayment_schedules IF NOT EXISTS
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'repayment_schedules'
    AND column_name = 'reminder_sent'
  ) THEN
    ALTER TABLE public.repayment_schedules ADD COLUMN reminder_sent BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'repayment_schedules'
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.repayment_schedules ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;


-- ============================================================================
-- 6. CREATE FUNCTION TO UPDATE LOAN STATUS TO DEFAULTED (90+ days overdue)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_loan_defaults()
RETURNS INTEGER AS $$
DECLARE
  v_default_count INTEGER := 0;
  v_loan RECORD;
  v_borrower_user_id UUID;
BEGIN
  -- Find loans with any payment more than 90 days overdue
  FOR v_loan IN
    SELECT DISTINCT
      l.id as loan_id,
      l.lender_id,
      l.borrower_id,
      b.full_name as borrower_name,
      b.country_code
    FROM public.loans l
    JOIN public.borrowers b ON b.id = l.borrower_id
    JOIN public.repayment_schedules rs ON rs.loan_id = l.id
    WHERE l.status = 'active'
    AND rs.status IN ('pending', 'overdue')
    AND rs.due_date < CURRENT_DATE - INTERVAL '90 days'
  LOOP
    -- Mark loan as defaulted
    UPDATE public.loans
    SET
      status = 'defaulted',
      defaulted_at = NOW(),
      updated_at = NOW()
    WHERE id = v_loan.loan_id
    AND status = 'active';

    IF FOUND THEN
      v_default_count := v_default_count + 1;

      -- Notify lender
      INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        link,
        target_role
      ) VALUES (
        v_loan.lender_id,
        'loan_defaulted',
        'Loan Defaulted',
        'Loan to ' || v_loan.borrower_name || ' has been marked as defaulted (90+ days overdue)',
        '/l/loans/' || v_loan.loan_id,
        'lender'
      );

      -- Get borrower user_id
      SELECT user_id INTO v_borrower_user_id
      FROM public.borrower_user_links
      WHERE borrower_id = v_loan.borrower_id
      LIMIT 1;

      IF v_borrower_user_id IS NOT NULL THEN
        INSERT INTO public.notifications (
          user_id,
          type,
          title,
          message,
          link,
          target_role
        ) VALUES (
          v_borrower_user_id,
          'loan_defaulted',
          'Loan Defaulted',
          'Your loan has been marked as defaulted due to non-payment. Please contact your lender immediately.',
          '/b/loans',
          'borrower'
        );
      END IF;

      -- Severely decrease borrower credit score
      UPDATE public.borrowers
      SET
        credit_score = GREATEST(COALESCE(credit_score, 500) - 100, 300),
        updated_at = NOW()
      WHERE id = v_loan.borrower_id;

      -- Automatically create a risk flag (only if risk_flags table exists with right columns)
      BEGIN
        INSERT INTO public.risk_flags (
          borrower_id,
          country_code,
          origin,
          type,
          reason,
          created_by
        ) VALUES (
          v_loan.borrower_id,
          v_loan.country_code,
          'SYSTEM',
          'default',
          'Automatic flag: Loan defaulted after 90+ days overdue',
          v_loan.lender_id
        );
      EXCEPTION WHEN OTHERS THEN
        -- Ignore errors if risk_flags structure is different
        NULL;
      END;
    END IF;
  END LOOP;

  RETURN v_default_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 7. ADD defaulted_at AND completed_at TO loans IF NOT EXISTS
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'loans'
    AND column_name = 'defaulted_at'
  ) THEN
    ALTER TABLE public.loans ADD COLUMN defaulted_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'loans'
    AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE public.loans ADD COLUMN completed_at TIMESTAMPTZ;
  END IF;
END $$;


-- ============================================================================
-- 8. CREATE COMBINED DAILY MAINTENANCE FUNCTION
-- This can be called manually or via cron job
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_daily_loan_maintenance()
RETURNS JSON AS $$
DECLARE
  v_reminders_sent INTEGER;
  v_overdue_updated INTEGER;
  v_defaults_marked INTEGER;
BEGIN
  -- Send payment reminders (3 days before due)
  SELECT public.send_payment_reminders() INTO v_reminders_sent;

  -- Update overdue schedules
  SELECT public.update_overdue_schedules() INTO v_overdue_updated;

  -- Check for defaults (90+ days overdue)
  SELECT public.check_loan_defaults() INTO v_defaults_marked;

  RETURN json_build_object(
    'reminders_sent', v_reminders_sent,
    'overdue_updated', v_overdue_updated,
    'defaults_marked', v_defaults_marked,
    'run_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service role (for cron jobs) and authenticated users
GRANT EXECUTE ON FUNCTION public.run_daily_loan_maintenance() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_daily_loan_maintenance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_overdue_schedules() TO service_role;
GRANT EXECUTE ON FUNCTION public.send_payment_reminders() TO service_role;
GRANT EXECUTE ON FUNCTION public.check_loan_defaults() TO service_role;


-- Log the migration
DO $$
BEGIN
  RAISE NOTICE 'Repayment system enhancements migration completed successfully';
  RAISE NOTICE 'Created functions: process_repayment, update_overdue_schedules, send_payment_reminders, check_loan_defaults, run_daily_loan_maintenance';
  RAISE NOTICE 'Added columns: loans.total_repaid, loans.defaulted_at, loans.completed_at, repayment_schedules.reminder_sent, repayment_schedules.updated_at';
END $$;
