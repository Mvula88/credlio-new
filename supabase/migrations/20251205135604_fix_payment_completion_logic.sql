-- Fix process_repayment function with proper completion logic
-- Issues fixed:
-- 1. Don't mark as completed if no schedules exist (v_total_due = 0)
-- 2. Calculate total_due from loan principal + interest, not just schedules
-- 3. Better handling of early payments

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
  v_schedule_total DECIMAL;
  v_new_total_repaid DECIMAL;
  v_borrower_user_id UUID;
  v_currency_symbol TEXT;
  v_schedules_paid INTEGER := 0;
  v_is_early BOOLEAN;
  v_amount_minor BIGINT;
  v_has_schedules BOOLEAN;
  v_unpaid_schedules INTEGER;
BEGIN
  -- Get loan details including total amounts
  SELECT
    l.id, l.lender_id, l.borrower_id, l.status, l.currency,
    COALESCE(l.total_repaid, 0) as total_repaid,
    COALESCE(l.principal_minor, 0) as principal_minor,
    COALESCE(l.total_interest_minor, 0) as total_interest_minor,
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

  -- Check if schedules exist
  SELECT COUNT(*) > 0 INTO v_has_schedules
  FROM public.repayment_schedules
  WHERE loan_id = p_loan_id;

  -- Apply payment to schedules (oldest unpaid first) if they exist
  IF v_has_schedules THEN
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
  END IF;

  -- Update loan's total_repaid
  v_new_total_repaid := v_loan.total_repaid + p_amount;

  UPDATE public.loans
  SET
    total_repaid = v_new_total_repaid,
    updated_at = NOW()
  WHERE id = p_loan_id;

  -- Calculate total due - prefer schedules, fallback to loan principal + interest
  IF v_has_schedules THEN
    SELECT COALESCE(SUM(amount_due_minor), 0) / 100.0 INTO v_schedule_total
    FROM public.repayment_schedules
    WHERE loan_id = p_loan_id;

    v_total_due := v_schedule_total;
  ELSE
    -- No schedules, use loan principal + interest
    v_total_due := (v_loan.principal_minor + v_loan.total_interest_minor) / 100.0;
  END IF;

  -- Ensure total_due is not zero (sanity check)
  IF v_total_due <= 0 THEN
    v_total_due := v_loan.principal_minor / 100.0;
  END IF;

  -- Notify lender about payment received
  INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
  VALUES (
    v_loan.lender_id,
    'payment_received',
    'Payment Received',
    v_currency_symbol || p_amount::TEXT || ' received from ' || v_loan.borrower_name ||
      CASE WHEN v_schedules_paid > 0 THEN ' (' || v_schedules_paid || ' installment(s) paid)' ELSE '' END,
    '/l/repayments',
    'lender'
  );

  -- Get borrower user_id for notifications
  SELECT user_id INTO v_borrower_user_id
  FROM public.borrower_user_links
  WHERE borrower_id = v_loan.borrower_id
  LIMIT 1;

  -- Count unpaid schedules
  SELECT COUNT(*) INTO v_unpaid_schedules
  FROM public.repayment_schedules
  WHERE loan_id = p_loan_id
  AND status IN ('pending', 'overdue', 'partial');

  -- Check if loan is fully paid
  -- Must have: total_repaid >= total_due AND (no schedules OR all schedules paid)
  IF v_new_total_repaid >= v_total_due AND v_total_due > 0 AND (NOT v_has_schedules OR v_unpaid_schedules = 0) THEN
    -- Mark loan as completed
    UPDATE public.loans
    SET
      status = 'completed',
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = p_loan_id;

    -- Notify lender about loan completion
    INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
    VALUES (
      v_loan.lender_id,
      'loan_completed',
      'Loan Fully Repaid!',
      'Loan to ' || v_loan.borrower_name || ' has been fully repaid!' ||
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
        'loan_completed',
        'Loan Fully Repaid!',
        'Congratulations! Your loan has been fully repaid.',
        '/b/loans',
        'borrower'
      );
    END IF;

    -- Update borrower credit score positively (bonus for completing loan)
    UPDATE public.borrowers
    SET
      credit_score = LEAST(COALESCE(credit_score, 500) + 30, 850),
      updated_at = NOW()
    WHERE id = v_loan.borrower_id;
  ELSE
    -- Notify borrower about payment recorded
    IF v_borrower_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
      VALUES (
        v_borrower_user_id,
        'payment_confirmed',
        'Payment Recorded',
        'Your payment of ' || v_currency_symbol || p_amount::TEXT || ' has been recorded. ' ||
          'Remaining balance: ' || v_currency_symbol || ROUND(GREATEST(v_total_due - v_new_total_repaid, 0), 2)::TEXT,
        '/b/loans',
        'borrower'
      );
    END IF;
  END IF;

  -- Return summary
  RETURN json_build_object(
    'success', TRUE,
    'amount_paid', p_amount,
    'schedules_paid', v_schedules_paid,
    'total_repaid', v_new_total_repaid,
    'total_due', v_total_due,
    'remaining', ROUND(GREATEST(v_total_due - v_new_total_repaid, 0), 2),
    'loan_completed', v_new_total_repaid >= v_total_due AND (NOT v_has_schedules OR v_unpaid_schedules = 0),
    'overpayment', ROUND(GREATEST(v_new_total_repaid - v_total_due, 0), 2),
    'unpaid_schedules', v_unpaid_schedules
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.process_repayment(UUID, DECIMAL) TO authenticated;

-- Add a notice about what was fixed
DO $$
BEGIN
  RAISE NOTICE 'Fixed process_repayment function:';
  RAISE NOTICE '- Now checks if schedules exist before marking completed';
  RAISE NOTICE '- Falls back to loan principal+interest if no schedules';
  RAISE NOTICE '- Returns unpaid_schedules count for debugging';
END $$;
