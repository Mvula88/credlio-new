-- Add Early Payment Notifications
-- Enhances the process_repayment function to notify about early payments

-- First, add 'early_payment' notification type if not exists
DO $$
BEGIN
  -- Update check constraint to include 'early_payment' type
  ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

  ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      'loan_request', 'loan_approved', 'loan_rejected', 'loan_offer',
      'payment_due', 'payment_overdue', 'payment_received', 'payment_confirmed',
      'loan_completed', 'document_required', 'verification_approved', 'verification_rejected',
      'system', 'message', 'admin_broadcast',
      'disbursement_sent', 'disbursement_confirmed', 'disbursement_disputed',
      'early_payment', 'early_payoff'
    ));
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;


-- Drop and recreate process_repayment with enhanced early payment tracking
DROP FUNCTION IF EXISTS public.process_repayment(UUID, DECIMAL);

CREATE OR REPLACE FUNCTION public.process_repayment(
  p_loan_id UUID,
  p_amount DECIMAL
)
RETURNS JSON AS $$
DECLARE
  v_loan RECORD;
  v_schedule RECORD;
  v_remaining_amount DECIMAL;
  v_amount_to_apply DECIMAL;
  v_schedule_remaining DECIMAL;
  v_total_due DECIMAL;
  v_new_total_repaid DECIMAL;
  v_borrower_user_id UUID;
  v_currency_symbol TEXT;
  v_schedules_paid INTEGER := 0;
  v_early_schedules_paid INTEGER := 0;
  v_is_early BOOLEAN;
  v_amount_minor BIGINT;
  v_any_early_payment BOOLEAN := FALSE;
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
    WHEN v_loan.currency = 'NAD' THEN 'N$'
    ELSE v_loan.currency || ' '
  END;

  -- Convert amount to minor units (cents)
  v_amount_minor := (p_amount * 100)::BIGINT;
  v_remaining_amount := v_amount_minor;

  -- Apply payment to schedules (oldest unpaid first)
  FOR v_schedule IN
    SELECT id, amount_due_minor, COALESCE(paid_amount_minor, 0) as paid_amount_minor, due_date, status
    FROM public.repayment_schedules
    WHERE loan_id = p_loan_id
    AND status IN ('pending', 'overdue', 'partial')
    ORDER BY due_date ASC, installment_no ASC
  LOOP
    EXIT WHEN v_remaining_amount <= 0;

    -- Calculate how much is still owed on this schedule
    v_schedule_remaining := v_schedule.amount_due_minor - v_schedule.paid_amount_minor;

    IF v_schedule_remaining <= 0 THEN
      CONTINUE;
    END IF;

    -- Determine how much to apply to this schedule
    v_amount_to_apply := LEAST(v_remaining_amount, v_schedule_remaining);

    -- Check if this is an early payment (paying before due date)
    v_is_early := v_schedule.due_date > CURRENT_DATE;

    IF v_is_early THEN
      v_any_early_payment := TRUE;
    END IF;

    -- Update the schedule
    IF v_schedule.paid_amount_minor + v_amount_to_apply >= v_schedule.amount_due_minor THEN
      -- Fully paid
      UPDATE public.repayment_schedules
      SET
        paid_amount_minor = v_schedule.paid_amount_minor + v_amount_to_apply,
        status = 'paid',
        paid_at = NOW(),
        is_early_payment = v_is_early,
        updated_at = NOW()
      WHERE id = v_schedule.id;

      v_schedules_paid := v_schedules_paid + 1;
      IF v_is_early THEN
        v_early_schedules_paid := v_early_schedules_paid + 1;
      END IF;
    ELSE
      -- Partial payment
      UPDATE public.repayment_schedules
      SET
        paid_amount_minor = v_schedule.paid_amount_minor + v_amount_to_apply,
        status = 'partial',
        updated_at = NOW()
      WHERE id = v_schedule.id;
    END IF;

    v_remaining_amount := v_remaining_amount - v_amount_to_apply;
  END LOOP;

  -- Update loan's total_repaid
  v_new_total_repaid := v_loan.total_repaid + p_amount;

  UPDATE public.loans
  SET
    total_repaid = v_new_total_repaid,
    updated_at = NOW()
  WHERE id = p_loan_id;

  -- Calculate total due
  SELECT COALESCE(SUM(amount_due_minor), 0) / 100.0 INTO v_total_due
  FROM public.repayment_schedules
  WHERE loan_id = p_loan_id;

  -- Get borrower user_id for notifications
  SELECT user_id INTO v_borrower_user_id
  FROM public.borrower_user_links
  WHERE borrower_id = v_loan.borrower_id
  LIMIT 1;

  -- Check if loan is fully paid
  IF v_new_total_repaid >= v_total_due AND v_total_due > 0 THEN
    -- Mark loan as completed
    UPDATE public.loans
    SET
      status = 'completed',
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = p_loan_id;

    -- Notify lender about early loan payoff
    INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
    VALUES (
      v_loan.lender_id,
      CASE WHEN v_any_early_payment THEN 'early_payoff' ELSE 'loan_completed' END,
      CASE WHEN v_any_early_payment THEN 'Early Loan Payoff!' ELSE 'Loan Fully Repaid!' END,
      'Loan to ' || v_loan.borrower_name || ' has been fully repaid' ||
        CASE WHEN v_any_early_payment THEN ' ahead of schedule!' ELSE '!' END ||
        CASE WHEN v_new_total_repaid > v_total_due
          THEN ' (Overpayment of ' || v_currency_symbol || ROUND(v_new_total_repaid - v_total_due, 2)::TEXT || ')'
          ELSE ''
        END,
      '/l/loans/' || p_loan_id,
      'lender'
    );

    IF v_borrower_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
      VALUES (
        v_borrower_user_id,
        CASE WHEN v_any_early_payment THEN 'early_payoff' ELSE 'loan_completed' END,
        CASE WHEN v_any_early_payment THEN 'Loan Paid Off Early!' ELSE 'Loan Fully Repaid!' END,
        'Congratulations! Your loan has been fully repaid' ||
          CASE WHEN v_any_early_payment THEN ' ahead of schedule! Your credit score has been boosted.' ELSE '.' END,
        '/b/loans',
        'borrower'
      );
    END IF;

    -- Update borrower credit score positively (extra bonus for early payoff)
    UPDATE public.borrowers
    SET
      credit_score = LEAST(COALESCE(credit_score, 500) + CASE WHEN v_any_early_payment THEN 50 ELSE 30 END, 850),
      updated_at = NOW()
    WHERE id = v_loan.borrower_id;
  ELSE
    -- Notify lender about payment received
    INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
    VALUES (
      v_loan.lender_id,
      CASE WHEN v_any_early_payment THEN 'early_payment' ELSE 'payment_received' END,
      CASE WHEN v_any_early_payment THEN 'Early Payment Received!' ELSE 'Payment Received' END,
      v_currency_symbol || ROUND(p_amount, 2)::TEXT || ' received from ' || v_loan.borrower_name ||
        CASE WHEN v_schedules_paid > 0 THEN ' (' || v_schedules_paid || ' installment(s) paid' ||
          CASE WHEN v_early_schedules_paid > 0 THEN ', ' || v_early_schedules_paid || ' early' ELSE '' END || ')'
        ELSE '' END,
      '/l/repayments',
      'lender'
    );

    -- Notify borrower about payment recorded
    IF v_borrower_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
      VALUES (
        v_borrower_user_id,
        CASE WHEN v_any_early_payment THEN 'early_payment' ELSE 'payment_confirmed' END,
        CASE WHEN v_any_early_payment THEN 'Early Payment Recorded!' ELSE 'Payment Recorded' END,
        'Your payment of ' || v_currency_symbol || ROUND(p_amount, 2)::TEXT || ' has been recorded.' ||
          CASE WHEN v_any_early_payment THEN ' Great job paying early!' ELSE '' END ||
          ' Remaining balance: ' || v_currency_symbol || ROUND(v_total_due - v_new_total_repaid, 2)::TEXT,
        '/b/loans',
        'borrower'
      );
    END IF;

    -- Update borrower credit score for early payment (small bonus)
    IF v_any_early_payment THEN
      UPDATE public.borrowers
      SET
        credit_score = LEAST(COALESCE(credit_score, 500) + 5, 850),
        updated_at = NOW()
      WHERE id = v_loan.borrower_id;
    END IF;
  END IF;

  -- Return summary
  RETURN json_build_object(
    'success', TRUE,
    'amount_paid', p_amount,
    'schedules_paid', v_schedules_paid,
    'early_schedules_paid', v_early_schedules_paid,
    'is_early_payment', v_any_early_payment,
    'total_repaid', v_new_total_repaid,
    'total_due', v_total_due,
    'remaining', GREATEST(v_total_due - v_new_total_repaid, 0),
    'loan_completed', v_new_total_repaid >= v_total_due,
    'overpayment', GREATEST(v_new_total_repaid - v_total_due, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Log the migration
DO $$
BEGIN
  RAISE NOTICE 'Enhanced early payment notifications completed';
  RAISE NOTICE 'Features: Early payment notifications, extra credit score bonus for early payoff';
END $$;
