-- ============================================
-- ENFORCE PROPER LOAN WORKFLOW
-- ============================================
--
-- CORRECT LOAN FLOW:
-- 1. Lender creates loan -> status: 'pending_offer'
-- 2. Borrower accepts offer -> status: 'pending_signatures'
-- 3. Lender signs agreement
-- 4. Borrower signs agreement
-- 5. Both signed -> status: 'active' (loan tracking begins)
-- 6. Loan can then go to: 'completed', 'defaulted', 'written_off'
--
-- DECLINED FLOW:
-- 1. Lender creates loan -> status: 'pending_offer'
-- 2. Borrower declines -> status: 'declined'
--
-- ============================================

-- Step 1: Add 'pending_signatures' status to loan_status enum
-- This status means: offer accepted, waiting for both parties to sign agreement
ALTER TYPE loan_status ADD VALUE IF NOT EXISTS 'pending_signatures' AFTER 'pending_offer';

-- Step 2: Update accept_loan_offer to set pending_signatures instead of active
-- Loan should NOT become active until agreement is signed by both parties
-- NOTE: Must drop and recreate because we're keeping same return type (JSON)
DROP FUNCTION IF EXISTS public.accept_loan_offer(UUID);

CREATE OR REPLACE FUNCTION public.accept_loan_offer(p_loan_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_loan RECORD;
  v_borrower_user_id UUID;
  v_current_user_id UUID;
BEGIN
  v_current_user_id := auth.uid();

  -- Get the loan with borrower info
  SELECT l.*, b.id as borrower_id, b.full_name as borrower_name
  INTO v_loan
  FROM public.loans l
  JOIN public.borrowers b ON l.borrower_id = b.id
  WHERE l.id = p_loan_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Loan not found');
  END IF;

  -- Check if loan is in pending_offer status
  IF v_loan.status != 'pending_offer' THEN
    RETURN json_build_object('success', false, 'error', 'This loan is not awaiting acceptance');
  END IF;

  -- Verify the current user is linked to this borrower
  SELECT user_id INTO v_borrower_user_id
  FROM public.borrower_user_links
  WHERE borrower_id = v_loan.borrower_id AND user_id = v_current_user_id;

  IF v_borrower_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'You are not authorized to accept this loan');
  END IF;

  -- Update the loan status to pending_signatures (NOT active yet!)
  -- Loan becomes active only after both parties sign the agreement
  -- The trigger notify_loan_status_change will handle the notification
  UPDATE public.loans
  SET
    status = 'pending_signatures',
    borrower_accepted_at = NOW(),
    updated_at = NOW()
  WHERE id = p_loan_id;

  -- Generate the loan agreement for signing
  PERFORM public.generate_loan_agreement(p_loan_id);

  -- NOTE: Repayment schedule will be generated when loan becomes 'active'
  -- (after both parties sign the agreement)
  -- NOTE: Notification is created by trigger notify_loan_status_change

  RETURN json_build_object(
    'success', true,
    'message', 'Loan offer accepted. Please sign the agreement to activate the loan.',
    'next_step', 'sign_agreement'
  );
END;
$$;

-- Step 3: Update decline_loan_offer (no changes needed, just documenting)
-- Already sets status to 'declined' which is correct

-- Step 4: Create trigger to activate loan when agreement is fully signed
CREATE OR REPLACE FUNCTION public.activate_loan_on_agreement_signed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_loan RECORD;
  v_borrower_user_id UUID;
BEGIN
  -- Only proceed if agreement just became fully signed
  IF NEW.fully_signed = TRUE AND (OLD.fully_signed IS NULL OR OLD.fully_signed = FALSE) THEN
    -- Get the loan
    SELECT * INTO v_loan
    FROM public.loans
    WHERE id = NEW.loan_id;

    -- Only activate if loan is in pending_signatures status
    IF v_loan IS NOT NULL AND v_loan.status = 'pending_signatures' THEN
      -- Update loan to active with start_date
      UPDATE public.loans
      SET
        status = 'active',
        start_date = NOW(),
        updated_at = NOW()
      WHERE id = NEW.loan_id;

      -- Generate repayment schedule now that loan is active
      PERFORM generate_simple_repayment_schedule(
        NEW.loan_id,
        v_loan.principal_minor,
        COALESCE(v_loan.total_amount_minor, v_loan.principal_minor),
        COALESCE(v_loan.interest_amount_minor, 0),
        COALESCE(v_loan.payment_type, 'once_off'),
        COALESCE(v_loan.num_installments, 1),
        CURRENT_DATE
      );

      -- Notify lender that loan is now active
      INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
      VALUES (
        v_loan.lender_id,
        'loan_activated',
        'Loan Activated',
        'The loan agreement has been signed by both parties. Loan is now active and tracking has begun.',
        '/l/loans/' || NEW.loan_id::TEXT,
        'lender'
      );

      -- Notify borrower that loan is now active
      SELECT user_id INTO v_borrower_user_id
      FROM public.borrower_user_links
      WHERE borrower_id = v_loan.borrower_id;

      IF v_borrower_user_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
        VALUES (
          v_borrower_user_id,
          'loan_activated',
          'Loan Now Active',
          'Your loan agreement has been signed by both parties. Your loan is now active.',
          '/b/loans',
          'borrower'
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$func$;

-- Create trigger on loan_agreements for activation
DROP TRIGGER IF EXISTS trigger_activate_loan_on_signed ON public.loan_agreements;
CREATE TRIGGER trigger_activate_loan_on_signed
  AFTER UPDATE ON public.loan_agreements
  FOR EACH ROW
  EXECUTE FUNCTION public.activate_loan_on_agreement_signed();

-- Step 5: Update notify_loan_status_change to handle new status
CREATE OR REPLACE FUNCTION public.notify_loan_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_borrower_user_id UUID;
  v_borrower_name TEXT;
  v_lender_name TEXT;
BEGIN
  -- Only fire when status actually changes
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Get borrower info
  SELECT bul.user_id, b.full_name
  INTO v_borrower_user_id, v_borrower_name
  FROM public.borrowers b
  LEFT JOIN public.borrower_user_links bul ON bul.borrower_id = b.id
  WHERE b.id = NEW.borrower_id;

  -- Get lender name
  SELECT COALESCE(l.business_name, p.full_name, 'Lender')
  INTO v_lender_name
  FROM public.lenders l
  LEFT JOIN public.profiles p ON p.user_id = l.user_id
  WHERE l.user_id = NEW.lender_id;

  -- Handle status transitions
  CASE
    -- Borrower accepted offer, now waiting for signatures
    WHEN NEW.status = 'pending_signatures' AND OLD.status = 'pending_offer' THEN
      -- Notify lender that borrower accepted
      INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
      VALUES (
        NEW.lender_id,
        'loan_accepted',
        'Loan Offer Accepted',
        COALESCE(v_borrower_name, 'The borrower') || ' has accepted your loan offer. Please sign the agreement.',
        '/l/loans/' || NEW.id::TEXT,
        'lender'
      );

    -- Borrower declined offer
    WHEN NEW.status = 'declined' AND OLD.status = 'pending_offer' THEN
      INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
      VALUES (
        NEW.lender_id,
        'loan_declined',
        'Loan Offer Declined',
        COALESCE(v_borrower_name, 'The borrower') || ' has declined your loan offer.' ||
          CASE WHEN NEW.decline_reason IS NOT NULL THEN ' Reason: ' || NEW.decline_reason ELSE '' END,
        '/l/loans/' || NEW.id::TEXT,
        'lender'
      );

    -- Loan completed
    WHEN NEW.status = 'completed' AND OLD.status != 'completed' THEN
      -- Notify borrower
      IF v_borrower_user_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
        VALUES (v_borrower_user_id, 'loan_completed', 'Loan Fully Repaid!', 'Congratulations! You have successfully repaid your loan.', '/b/loans', 'borrower');
      END IF;
      -- Notify lender
      INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
      VALUES (NEW.lender_id, 'loan_completed', 'Loan Fully Repaid', 'The loan to ' || COALESCE(v_borrower_name, 'borrower') || ' has been fully repaid.', '/l/loans/' || NEW.id::TEXT, 'lender');

    -- Loan defaulted
    WHEN NEW.status = 'defaulted' AND OLD.status != 'defaulted' THEN
      INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
      VALUES (NEW.lender_id, 'loan_defaulted', 'Loan Defaulted', 'A loan to ' || COALESCE(v_borrower_name, 'borrower') || ' has been marked as defaulted.', '/l/loans/' || NEW.id::TEXT, 'lender');

    ELSE
      -- No notification for other transitions
      NULL;
  END CASE;

  RETURN NEW;
END;
$func$;

-- Step 6: Block repayment events on loans that are not active
CREATE OR REPLACE FUNCTION public.check_loan_active_for_repayment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_loan_status TEXT;
  v_loan_id UUID;
BEGIN
  -- Get the loan_id from repayment_schedule
  SELECT rs.loan_id, l.status::TEXT
  INTO v_loan_id, v_loan_status
  FROM public.repayment_schedules rs
  JOIN public.loans l ON l.id = rs.loan_id
  WHERE rs.id = NEW.schedule_id;

  -- Only allow repayment events on active loans
  IF v_loan_status != 'active' THEN
    RAISE EXCEPTION 'Cannot record repayment: Loan is not active (status: %). Agreement must be signed by both parties first.', v_loan_status;
  END IF;

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trigger_check_loan_active_for_repayment ON public.repayment_events;
CREATE TRIGGER trigger_check_loan_active_for_repayment
  BEFORE INSERT ON public.repayment_events
  FOR EACH ROW
  EXECUTE FUNCTION public.check_loan_active_for_repayment();

-- Step 7: NOTE - Cannot update existing loans in same transaction as ALTER TYPE
-- This will be handled in a separate migration after enum value is committed
-- Any existing active loans with unsigned agreements should be manually reviewed

-- Step 8: Add comments for documentation
COMMENT ON FUNCTION public.accept_loan_offer IS
'Accepts a loan offer from the borrower side. Changes status from pending_offer to pending_signatures. Loan becomes active only after both parties sign the agreement.';

COMMENT ON FUNCTION public.activate_loan_on_agreement_signed IS
'Trigger function that activates a loan when the agreement is fully signed by both parties. Also generates the repayment schedule at this point.';

COMMENT ON FUNCTION public.check_loan_active_for_repayment IS
'Prevents repayment events from being recorded on loans that are not yet active. Ensures agreement is signed before tracking payments.';
