-- Comprehensive notification triggers for all platform events
-- This migration adds automatic notifications for key platform activities

-- ============================================
-- LOAN OFFER NOTIFICATIONS
-- ============================================

-- Notify borrower when they receive a new loan offer
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

  -- Create notification
  IF v_borrower_user_id IS NOT NULL THEN
    PERFORM public.create_notification(
      v_borrower_user_id,
      'loan_offer',
      'New loan offer received',
      v_lender_name || ' has offered you $' || v_amount || ' for your request: ' || COALESCE(v_request_purpose, 'Loan Request'),
      '/b/loans',
      'high',
      'View Offer',
      '/b/loans'
    );
  END IF;

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trigger_notify_borrower_new_offer ON public.loan_offers;
CREATE TRIGGER trigger_notify_borrower_new_offer
  AFTER INSERT ON public.loan_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_borrower_new_offer();

-- ============================================
-- LOAN STATUS CHANGE NOTIFICATIONS
-- ============================================

-- Notify on loan offer status changes (accepted/rejected)
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
    PERFORM public.create_notification(
      NEW.lender_id,
      'loan_accepted',
      'Your loan offer was accepted!',
      COALESCE(v_borrower_name, 'A borrower') || ' has accepted your loan offer of $' || (NEW.amount_minor / 100)::TEXT,
      '/l/loans',
      'high',
      'View Loan',
      '/l/loans'
    );
  ELSIF NEW.status = 'rejected' THEN
    -- Notify lender that their offer was rejected
    PERFORM public.create_notification(
      NEW.lender_id,
      'loan_rejected',
      'Loan offer not accepted',
      'Your loan offer of $' || (NEW.amount_minor / 100)::TEXT || ' was not accepted by the borrower.',
      '/l/marketplace',
      'normal',
      'View Marketplace',
      '/l/marketplace'
    );
  END IF;

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trigger_notify_loan_offer_status ON public.loan_offers;
CREATE TRIGGER trigger_notify_loan_offer_status
  AFTER UPDATE ON public.loan_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_loan_offer_status_change();

-- ============================================
-- LOAN LIFECYCLE NOTIFICATIONS
-- ============================================

-- Notify on loan status changes
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
  -- Only fire when status changes
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Get borrower info
  SELECT bul.user_id, b.full_name
  INTO v_borrower_user_id, v_borrower_name
  FROM public.borrowers b
  JOIN public.borrower_user_links bul ON bul.borrower_id = b.id
  WHERE b.id = NEW.borrower_id;

  -- Get lender name
  SELECT COALESCE(l.business_name, l.full_name, 'Your lender')
  INTO v_lender_name
  FROM public.lenders l
  WHERE l.user_id = NEW.lender_id;

  IF NEW.status = 'disbursed' AND OLD.status != 'disbursed' THEN
    -- Notify borrower that funds were disbursed
    PERFORM public.create_notification(
      v_borrower_user_id,
      'loan_disbursed',
      'Loan funds disbursed!',
      'Great news! Your loan of $' || (NEW.principal_minor / 100)::TEXT || ' has been disbursed by ' || v_lender_name,
      '/b/loans',
      'high',
      'View Loan',
      '/b/loans'
    );

    -- Notify lender
    PERFORM public.create_notification(
      NEW.lender_id,
      'loan_disbursed',
      'Loan disbursed successfully',
      'You have disbursed $' || (NEW.principal_minor / 100)::TEXT || ' to ' || COALESCE(v_borrower_name, 'borrower'),
      '/l/loans/' || NEW.id::TEXT,
      'normal'
    );
  ELSIF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Notify both parties loan is completed
    PERFORM public.create_notification(
      v_borrower_user_id,
      'loan_completed',
      'Loan fully repaid!',
      'Congratulations! You have successfully repaid your loan of $' || (NEW.principal_minor / 100)::TEXT,
      '/b/loans',
      'normal'
    );

    PERFORM public.create_notification(
      NEW.lender_id,
      'loan_completed',
      'Loan fully repaid',
      'Your loan to ' || COALESCE(v_borrower_name, 'borrower') || ' has been fully repaid.',
      '/l/loans/' || NEW.id::TEXT,
      'normal'
    );
  ELSIF NEW.status = 'defaulted' AND OLD.status != 'defaulted' THEN
    -- Notify lender of default (high priority)
    PERFORM public.create_notification(
      NEW.lender_id,
      'loan_defaulted',
      'Loan marked as defaulted',
      'A loan of $' || (NEW.principal_minor / 100)::TEXT || ' to ' || COALESCE(v_borrower_name, 'borrower') || ' has been marked as defaulted.',
      '/l/loans/' || NEW.id::TEXT,
      'urgent',
      'View Details',
      '/l/loans/' || NEW.id::TEXT
    );
  END IF;

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trigger_notify_loan_status ON public.loans;
CREATE TRIGGER trigger_notify_loan_status
  AFTER UPDATE ON public.loans
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_loan_status_change();

-- ============================================
-- PAYMENT NOTIFICATIONS
-- ============================================

-- Notify on new repayment events
CREATE OR REPLACE FUNCTION public.notify_repayment_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_loan_id UUID;
  v_lender_id UUID;
  v_borrower_user_id UUID;
  v_borrower_name TEXT;
BEGIN
  -- Get loan and party info
  SELECT rs.loan_id INTO v_loan_id
  FROM public.repayment_schedules rs
  WHERE rs.id = NEW.schedule_id;

  SELECT l.lender_id, bul.user_id, b.full_name
  INTO v_lender_id, v_borrower_user_id, v_borrower_name
  FROM public.loans l
  JOIN public.borrowers b ON l.borrower_id = b.id
  JOIN public.borrower_user_links bul ON bul.borrower_id = b.id
  WHERE l.id = v_loan_id;

  -- Notify lender of payment received
  PERFORM public.create_notification(
    v_lender_id,
    'payment_received',
    'Payment received',
    COALESCE(v_borrower_name, 'Borrower') || ' has made a payment of $' || (NEW.amount_paid_minor / 100)::TEXT,
    '/l/repayments',
    'normal',
    'View Payment',
    '/l/repayments'
  );

  -- Notify borrower of payment confirmation
  PERFORM public.create_notification(
    v_borrower_user_id,
    'payment_confirmed',
    'Payment confirmed',
    'Your payment of $' || (NEW.amount_paid_minor / 100)::TEXT || ' has been recorded.',
    '/b/repayments',
    'normal'
  );

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trigger_notify_repayment ON public.repayment_events;
CREATE TRIGGER trigger_notify_repayment
  AFTER INSERT ON public.repayment_events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_repayment_event();

-- ============================================
-- DISPUTE NOTIFICATIONS
-- ============================================

-- Notify on dispute status changes
CREATE OR REPLACE FUNCTION public.notify_dispute_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_borrower_user_id UUID;
  v_created_by_name TEXT;
BEGIN
  -- Get borrower user_id
  SELECT bul.user_id
  INTO v_borrower_user_id
  FROM public.borrower_user_links bul
  WHERE bul.borrower_id = NEW.borrower_id;

  IF TG_OP = 'INSERT' THEN
    -- Notify all relevant parties of new dispute
    IF NEW.lender_id IS NOT NULL THEN
      PERFORM public.create_notification(
        NEW.lender_id,
        'dispute_filed',
        'New dispute filed',
        'A dispute has been filed regarding your lending activity. Please review and respond.',
        '/l/disputes',
        'high',
        'View Dispute',
        '/l/disputes'
      );
    END IF;

    -- Notify borrower if they didn't create it
    IF v_borrower_user_id IS NOT NULL AND NEW.created_by != v_borrower_user_id THEN
      PERFORM public.create_notification(
        v_borrower_user_id,
        'dispute_filed',
        'Dispute filed on your account',
        'A dispute has been filed. Please review the details.',
        '/b/disputes',
        'high',
        'View Dispute',
        '/b/disputes'
      );
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Status changes
    IF OLD.status != NEW.status THEN
      IF NEW.status = 'resolved' THEN
        -- Notify all parties of resolution
        IF v_borrower_user_id IS NOT NULL THEN
          PERFORM public.create_notification(
            v_borrower_user_id,
            'dispute_resolved',
            'Dispute resolved',
            'Your dispute has been resolved. Outcome: ' || COALESCE(NEW.outcome, 'See details'),
            '/b/disputes',
            'normal'
          );
        END IF;

        IF NEW.lender_id IS NOT NULL THEN
          PERFORM public.create_notification(
            NEW.lender_id,
            'dispute_resolved',
            'Dispute resolved',
            'A dispute has been resolved. Outcome: ' || COALESCE(NEW.outcome, 'See details'),
            '/l/disputes',
            'normal'
          );
        END IF;
      ELSIF NEW.status = 'escalated' THEN
        -- Notify of escalation
        IF v_borrower_user_id IS NOT NULL THEN
          PERFORM public.create_notification(
            v_borrower_user_id,
            'dispute_escalated',
            'Dispute escalated',
            'Your dispute has been escalated for further review.',
            '/b/disputes',
            'high'
          );
        END IF;

        IF NEW.lender_id IS NOT NULL THEN
          PERFORM public.create_notification(
            NEW.lender_id,
            'dispute_escalated',
            'Dispute escalated',
            'A dispute has been escalated for further review.',
            '/l/disputes',
            'high'
          );
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trigger_notify_dispute ON public.disputes;
CREATE TRIGGER trigger_notify_dispute
  AFTER INSERT OR UPDATE ON public.disputes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_dispute_change();

-- ============================================
-- RISK FLAG NOTIFICATIONS
-- ============================================

-- Notify on new risk flags
CREATE OR REPLACE FUNCTION public.notify_risk_flag_added()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_borrower_user_id UUID;
BEGIN
  -- Get borrower user_id
  IF NEW.borrower_id IS NOT NULL THEN
    SELECT bul.user_id
    INTO v_borrower_user_id
    FROM public.borrower_user_links bul
    WHERE bul.borrower_id = NEW.borrower_id;
  END IF;

  -- Notify lender if they were involved
  IF NEW.lender_id IS NOT NULL THEN
    PERFORM public.create_notification(
      NEW.lender_id,
      'risk_flag_added',
      'Risk flag notification',
      'A risk flag has been added to a borrower profile. Review your active loans.',
      '/l/borrowers',
      'high'
    );
  END IF;

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trigger_notify_risk_flag ON public.risk_flags;
CREATE TRIGGER trigger_notify_risk_flag
  AFTER INSERT ON public.risk_flags
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_risk_flag_added();

-- ============================================
-- AGREEMENT NOTIFICATIONS
-- ============================================

-- Notify on agreement signature events
CREATE OR REPLACE FUNCTION public.notify_agreement_signature()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_borrower_user_id UUID;
  v_borrower_name TEXT;
  v_lender_name TEXT;
BEGIN
  -- Get party info
  SELECT bul.user_id, b.full_name
  INTO v_borrower_user_id, v_borrower_name
  FROM public.borrowers b
  JOIN public.borrower_user_links bul ON bul.borrower_id = b.id
  WHERE b.id = NEW.borrower_id;

  SELECT COALESCE(l.business_name, l.full_name, 'Lender')
  INTO v_lender_name
  FROM public.lenders l
  WHERE l.user_id = NEW.lender_id;

  -- Lender signed
  IF NEW.lender_signed_at IS NOT NULL AND (OLD.lender_signed_at IS NULL OR TG_OP = 'INSERT') THEN
    IF v_borrower_user_id IS NOT NULL THEN
      PERFORM public.create_notification(
        v_borrower_user_id,
        'agreement_signed_lender',
        'Lender signed agreement',
        v_lender_name || ' has signed the loan agreement. Please review and sign.',
        '/b/loans',
        'high',
        'Sign Agreement',
        '/b/loans'
      );
    END IF;
  END IF;

  -- Borrower signed
  IF NEW.borrower_signed_at IS NOT NULL AND (OLD.borrower_signed_at IS NULL OR TG_OP = 'INSERT') THEN
    PERFORM public.create_notification(
      NEW.lender_id,
      'agreement_signed_borrower',
      'Borrower signed agreement',
      COALESCE(v_borrower_name, 'Borrower') || ' has signed the loan agreement.',
      '/l/loans/' || NEW.loan_id::TEXT,
      'normal'
    );
  END IF;

  -- Both signed (fully executed)
  IF NEW.lender_signed_at IS NOT NULL AND NEW.borrower_signed_at IS NOT NULL
     AND (OLD.lender_signed_at IS NULL OR OLD.borrower_signed_at IS NULL OR TG_OP = 'INSERT') THEN
    -- Notify both parties
    IF v_borrower_user_id IS NOT NULL THEN
      PERFORM public.create_notification(
        v_borrower_user_id,
        'agreement_fully_signed',
        'Agreement fully executed',
        'Your loan agreement has been signed by all parties and is now active.',
        '/b/loans',
        'normal'
      );
    END IF;

    PERFORM public.create_notification(
      NEW.lender_id,
      'agreement_fully_signed',
      'Agreement fully executed',
      'The loan agreement with ' || COALESCE(v_borrower_name, 'borrower') || ' is now fully signed.',
      '/l/loans/' || NEW.loan_id::TEXT,
      'normal'
    );
  END IF;

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trigger_notify_agreement_signature ON public.loan_agreements;
CREATE TRIGGER trigger_notify_agreement_signature
  AFTER INSERT OR UPDATE ON public.loan_agreements
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_agreement_signature();

-- ============================================
-- KYC/VERIFICATION NOTIFICATIONS
-- ============================================

-- Notify on verification status changes
CREATE OR REPLACE FUNCTION public.notify_verification_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_borrower_user_id UUID;
BEGIN
  -- Only fire when status changes
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Get borrower user_id
  SELECT bul.user_id
  INTO v_borrower_user_id
  FROM public.borrower_user_links bul
  WHERE bul.borrower_id = NEW.borrower_id;

  IF v_borrower_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'verified' THEN
    PERFORM public.create_notification(
      v_borrower_user_id,
      'identity_verified',
      'Identity verified!',
      'Your identity has been successfully verified. You can now request loans.',
      '/b/overview',
      'normal',
      'Request Loan',
      '/b/requests'
    );
  ELSIF NEW.status = 'rejected' THEN
    PERFORM public.create_notification(
      v_borrower_user_id,
      'kyc_rejected',
      'Verification unsuccessful',
      'Your identity verification was not successful. Please try again with clearer documents.',
      '/b/verify',
      'high',
      'Try Again',
      '/b/verify'
    );
  ELSIF NEW.status = 'pending_review' THEN
    PERFORM public.create_notification(
      v_borrower_user_id,
      'kyc_pending_review',
      'Verification under review',
      'Your documents are being reviewed. This usually takes 1-2 business days.',
      '/b/overview',
      'normal'
    );
  END IF;

  RETURN NEW;
END;
$func$;

-- Check if borrower_verifications table exists before creating trigger
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'borrower_verifications') THEN
    DROP TRIGGER IF EXISTS trigger_notify_verification_status ON public.borrower_verifications;
    CREATE TRIGGER trigger_notify_verification_status
      AFTER UPDATE ON public.borrower_verifications
      FOR EACH ROW
      EXECUTE FUNCTION public.notify_verification_status();
  END IF;
END
$do$;

-- ============================================
-- ACCOUNT STATUS NOTIFICATIONS
-- ============================================

-- Notify on lender account status changes (suspension/restoration)
CREATE OR REPLACE FUNCTION public.notify_lender_account_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
BEGIN
  -- Account suspended
  IF NEW.is_suspended = TRUE AND (OLD.is_suspended = FALSE OR OLD.is_suspended IS NULL) THEN
    PERFORM public.create_notification(
      NEW.user_id,
      'account_suspended',
      'Account suspended',
      'Your lender account has been suspended. Reason: ' || COALESCE(NEW.suspension_reason, 'Contact support for details'),
      '/l/settings',
      'urgent'
    );
  END IF;

  -- Account restored
  IF NEW.is_suspended = FALSE AND OLD.is_suspended = TRUE THEN
    PERFORM public.create_notification(
      NEW.user_id,
      'account_restored',
      'Account restored',
      'Your lender account has been restored. You can now continue lending.',
      '/l/overview',
      'normal'
    );
  END IF;

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trigger_notify_lender_account_status ON public.lenders;
CREATE TRIGGER trigger_notify_lender_account_status
  AFTER UPDATE ON public.lenders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_lender_account_status();

-- Comments
COMMENT ON FUNCTION public.notify_borrower_new_offer IS 'Notifies borrower when they receive a new loan offer';
COMMENT ON FUNCTION public.notify_loan_offer_status_change IS 'Notifies lender when their offer is accepted/rejected';
COMMENT ON FUNCTION public.notify_loan_status_change IS 'Notifies parties when loan status changes';
COMMENT ON FUNCTION public.notify_repayment_event IS 'Notifies parties when a payment is recorded';
COMMENT ON FUNCTION public.notify_dispute_change IS 'Notifies parties of dispute lifecycle events';
COMMENT ON FUNCTION public.notify_risk_flag_added IS 'Notifies lenders when risk flags are added';
COMMENT ON FUNCTION public.notify_agreement_signature IS 'Notifies parties when agreements are signed';
COMMENT ON FUNCTION public.notify_verification_status IS 'Notifies borrowers of verification status changes';
COMMENT ON FUNCTION public.notify_lender_account_status IS 'Notifies lenders of account suspension/restoration';
