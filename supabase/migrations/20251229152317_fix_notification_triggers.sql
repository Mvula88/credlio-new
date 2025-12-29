-- Fix notification triggers to properly create notifications
-- Issues fixed:
-- 1. notify_loan_offer_status_change was checking for 'rejected' but enum uses 'declined'
-- 2. Add proper target_role to notifications (borrower/lender) for filtering
-- 3. Better error handling in triggers

-- ============================================
-- FIX: Notify borrower when they receive a new loan offer
-- ============================================
CREATE OR REPLACE FUNCTION public.notify_borrower_new_offer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_borrower_user_id UUID;
  v_lender_name TEXT;
  v_request_purpose TEXT;
  v_amount TEXT;
BEGIN
  -- Get borrower user_id
  SELECT lr.borrower_user_id, lr.purpose
  INTO v_borrower_user_id, v_request_purpose
  FROM public.loan_requests lr
  WHERE lr.id = NEW.request_id;

  -- Get lender name
  SELECT COALESCE(l.business_name, l.full_name, 'A lender')
  INTO v_lender_name
  FROM public.lenders l
  WHERE l.user_id = NEW.lender_id;

  -- Format amount
  v_amount := (NEW.amount_minor / 100)::TEXT;

  -- Create notification with proper target_role
  IF v_borrower_user_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notifications (
        user_id, type, title, message, link, priority,
        action_label, action_link, target_role, created_at
      ) VALUES (
        v_borrower_user_id,
        'loan_offer',
        'New loan offer received',
        v_lender_name || ' has offered you $' || v_amount || ' for your request: ' || COALESCE(v_request_purpose, 'Loan Request'),
        '/b/requests',
        'high',
        'View Offer',
        '/b/requests',
        'borrower',  -- Explicitly set target_role
        NOW()
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Failed to create notification for borrower: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$func$;

-- Recreate trigger
DROP TRIGGER IF EXISTS trigger_notify_borrower_new_offer ON public.loan_offers;
CREATE TRIGGER trigger_notify_borrower_new_offer
  AFTER INSERT ON public.loan_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_borrower_new_offer();

-- ============================================
-- FIX: Notify lender when offer status changes (accepted/declined)
-- ============================================
CREATE OR REPLACE FUNCTION public.notify_loan_offer_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_borrower_user_id UUID;
  v_borrower_name TEXT;
BEGIN
  -- Only fire when status changes
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Get borrower info
  SELECT lr.borrower_user_id, b.full_name
  INTO v_borrower_user_id, v_borrower_name
  FROM public.loan_requests lr
  JOIN public.borrowers b ON lr.borrower_id = b.id
  WHERE lr.id = NEW.request_id;

  IF NEW.status = 'accepted' THEN
    -- Notify lender that their offer was accepted
    BEGIN
      INSERT INTO public.notifications (
        user_id, type, title, message, link, priority,
        action_label, action_link, target_role, created_at
      ) VALUES (
        NEW.lender_id,
        'loan_accepted',
        'Your loan offer was accepted!',
        COALESCE(v_borrower_name, 'A borrower') || ' has accepted your loan offer of $' || (NEW.amount_minor / 100)::TEXT,
        '/l/loans',
        'high',
        'View Loan',
        '/l/loans',
        'lender',  -- Explicitly set target_role
        NOW()
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Failed to create accepted notification: %', SQLERRM;
    END;
  ELSIF NEW.status = 'declined' THEN
    -- FIX: Changed from 'rejected' to 'declined' to match enum
    -- Notify lender that their offer was declined
    BEGIN
      INSERT INTO public.notifications (
        user_id, type, title, message, link, priority,
        action_label, action_link, target_role, created_at
      ) VALUES (
        NEW.lender_id,
        'loan_rejected',
        'Loan offer not accepted',
        'Your loan offer of $' || (NEW.amount_minor / 100)::TEXT || ' was not accepted by the borrower.',
        '/l/marketplace',
        'normal',
        'View Marketplace',
        '/l/marketplace',
        'lender',  -- Explicitly set target_role
        NOW()
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Failed to create declined notification: %', SQLERRM;
    END;
  ELSIF NEW.status = 'withdrawn' THEN
    -- Handle withdrawn status (e.g., when borrower cancels loan)
    BEGIN
      INSERT INTO public.notifications (
        user_id, type, title, message, link, priority,
        target_role, created_at
      ) VALUES (
        NEW.lender_id,
        'loan_rejected',
        'Loan was cancelled',
        'The borrower has cancelled the loan. Your offer of $' || (NEW.amount_minor / 100)::TEXT || ' has been returned.',
        '/l/marketplace',
        'normal',
        'lender',
        NOW()
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Failed to create withdrawn notification: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$func$;

-- Recreate trigger
DROP TRIGGER IF EXISTS trigger_notify_loan_offer_status ON public.loan_offers;
CREATE TRIGGER trigger_notify_loan_offer_status
  AFTER UPDATE ON public.loan_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_loan_offer_status_change();

-- ============================================
-- Verify triggers are enabled
-- ============================================
ALTER TABLE public.loan_offers ENABLE TRIGGER trigger_notify_borrower_new_offer;
ALTER TABLE public.loan_offers ENABLE TRIGGER trigger_notify_loan_offer_status;

-- ============================================
-- Add comments
-- ============================================
COMMENT ON FUNCTION public.notify_borrower_new_offer IS 'Notifies borrower when they receive a new loan offer (with explicit target_role)';
COMMENT ON FUNCTION public.notify_loan_offer_status_change IS 'Notifies lender when their offer is accepted/declined/withdrawn (fixed to use correct status values)';
