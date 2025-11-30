-- Add new loan statuses for borrower confirmation flow
-- pending_offer: Awaiting borrower acceptance (for registered borrowers)
-- declined: Borrower declined the offer

-- Add new values to loan_status enum
ALTER TYPE loan_status ADD VALUE IF NOT EXISTS 'pending_offer' BEFORE 'active';
ALTER TYPE loan_status ADD VALUE IF NOT EXISTS 'declined' AFTER 'written_off';

-- Add columns to loans table for tracking offer/acceptance
ALTER TABLE public.loans
ADD COLUMN IF NOT EXISTS requires_borrower_acceptance BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS borrower_accepted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS borrower_declined_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS decline_reason TEXT;

-- Create function to check if borrower has a user account
CREATE OR REPLACE FUNCTION public.borrower_has_user_account(p_borrower_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.borrower_user_links
    WHERE borrower_id = p_borrower_id
  );
END;
$$;

-- Create function for borrower to accept a loan offer
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

  -- Get the loan
  SELECT l.*, b.id as borrower_id
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

  -- Update the loan status to active
  UPDATE public.loans
  SET
    status = 'active',
    borrower_accepted_at = NOW(),
    start_date = NOW(),
    updated_at = NOW()
  WHERE id = p_loan_id;

  -- Create notification for lender
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_loan.lender_id,
    'loan_accepted',
    'Loan Offer Accepted',
    'Your loan offer has been accepted by the borrower.',
    json_build_object('loan_id', p_loan_id)
  );

  RETURN json_build_object('success', true, 'message', 'Loan offer accepted successfully');
END;
$$;

-- Create function for borrower to decline a loan offer
CREATE OR REPLACE FUNCTION public.decline_loan_offer(p_loan_id UUID, p_reason TEXT DEFAULT NULL)
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

  -- Get the loan
  SELECT l.*, b.id as borrower_id
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
    RETURN json_build_object('success', false, 'error', 'You are not authorized to decline this loan');
  END IF;

  -- Update the loan status to declined
  UPDATE public.loans
  SET
    status = 'declined',
    borrower_declined_at = NOW(),
    decline_reason = p_reason,
    updated_at = NOW()
  WHERE id = p_loan_id;

  -- Create notification for lender
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_loan.lender_id,
    'loan_declined',
    'Loan Offer Declined',
    CASE
      WHEN p_reason IS NOT NULL THEN 'Your loan offer was declined. Reason: ' || p_reason
      ELSE 'Your loan offer was declined by the borrower.'
    END,
    json_build_object('loan_id', p_loan_id, 'reason', p_reason)
  );

  RETURN json_build_object('success', true, 'message', 'Loan offer declined');
END;
$$;

-- Create trigger to notify borrower when a loan offer is created for them
CREATE OR REPLACE FUNCTION public.notify_borrower_of_loan_offer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_borrower_user_id UUID;
  v_lender_name TEXT;
  v_currency_symbol TEXT;
  v_amount DECIMAL;
BEGIN
  -- Only notify if the loan requires borrower acceptance
  IF NEW.requires_borrower_acceptance = TRUE AND NEW.status = 'pending_offer' THEN
    -- Get the borrower's user_id if they have an account
    SELECT user_id INTO v_borrower_user_id
    FROM public.borrower_user_links
    WHERE borrower_id = NEW.borrower_id;

    IF v_borrower_user_id IS NOT NULL THEN
      -- Get lender name
      SELECT COALESCE(l.business_name, p.full_name) INTO v_lender_name
      FROM public.lenders l
      JOIN public.profiles p ON l.user_id = p.user_id
      WHERE l.user_id = NEW.lender_id;

      -- Calculate amount in major units
      v_amount := COALESCE(NEW.principal_minor, 0) / 100.0;

      -- Get currency symbol
      SELECT symbol INTO v_currency_symbol
      FROM public.countries
      WHERE code = NEW.country_code;

      -- Create notification for borrower
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        v_borrower_user_id,
        'loan_offer_received',
        'New Loan Offer',
        v_lender_name || ' has offered you a loan of ' || COALESCE(v_currency_symbol, '') || v_amount::TEXT || '. Review and accept or decline.',
        json_build_object(
          'loan_id', NEW.id,
          'lender_id', NEW.lender_id,
          'amount', v_amount,
          'currency', NEW.currency
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_notify_borrower_loan_offer ON public.loans;
CREATE TRIGGER trigger_notify_borrower_loan_offer
  AFTER INSERT ON public.loans
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_borrower_of_loan_offer();

-- Add notification types for loan offer flow
DO $$
BEGIN
  -- Check if notification_type enum exists and add new values
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    BEGIN
      ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'loan_offer_received';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'loan_accepted';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'loan_declined';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.borrower_has_user_account(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_loan_offer(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_loan_offer(UUID, TEXT) TO authenticated;

-- Add RLS policy for borrowers to view their pending loan offers
-- Note: Using status::text comparison because enum value was just added in same migration
CREATE POLICY "Borrowers can view their pending loan offers"
ON public.loans
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.borrower_user_links bul
    WHERE bul.borrower_id = loans.borrower_id
    AND bul.user_id = auth.uid()
  )
  AND status::text = 'pending_offer'
);
