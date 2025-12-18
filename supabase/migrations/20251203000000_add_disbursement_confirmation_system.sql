-- Disbursement Confirmation System
-- Loan only becomes active after:
-- 1. Both parties sign agreement
-- 2. Lender submits proof of disbursement (money sent)
-- 3. Borrower confirms receipt of funds

-- ============================================================================
-- 1. ADD 'pending_disbursement' STATUS TO loan_status ENUM
-- ============================================================================

ALTER TYPE loan_status ADD VALUE IF NOT EXISTS 'pending_disbursement' AFTER 'pending_signatures';


-- ============================================================================
-- 2. CREATE disbursement_proofs TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.disbursement_proofs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,

  -- Lender submits proof of sending money
  lender_proof_url TEXT,
  lender_proof_method TEXT, -- 'bank_transfer', 'mobile_money', 'cash', 'cheque'
  lender_proof_reference TEXT, -- Transaction ID
  lender_proof_amount DECIMAL(15, 2),
  lender_proof_date DATE,
  lender_proof_notes TEXT,
  lender_submitted_at TIMESTAMPTZ,

  -- Borrower confirms receipt
  borrower_confirmed BOOLEAN DEFAULT FALSE,
  borrower_confirmed_at TIMESTAMPTZ,
  borrower_confirmation_notes TEXT,

  -- If borrower disputes
  borrower_disputed BOOLEAN DEFAULT FALSE,
  borrower_dispute_reason TEXT,
  borrower_disputed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_disbursement_proofs_loan_id ON public.disbursement_proofs(loan_id);

-- Enable RLS
ALTER TABLE public.disbursement_proofs ENABLE ROW LEVEL SECURITY;

-- Lenders can view/create/update their own disbursement proofs
CREATE POLICY "Lenders can manage disbursement proofs for their loans"
  ON public.disbursement_proofs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = disbursement_proofs.loan_id
      AND l.lender_id = auth.uid()
    )
  );

-- Borrowers can view disbursement proofs for their loans
CREATE POLICY "Borrowers can view disbursement proofs for their loans"
  ON public.disbursement_proofs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      JOIN public.borrower_user_links bul ON bul.borrower_id = l.borrower_id
      WHERE l.id = disbursement_proofs.loan_id
      AND bul.user_id = auth.uid()
    )
  );

-- Borrowers can update (confirm) disbursement proofs for their loans
CREATE POLICY "Borrowers can confirm disbursement for their loans"
  ON public.disbursement_proofs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      JOIN public.borrower_user_links bul ON bul.borrower_id = l.borrower_id
      WHERE l.id = disbursement_proofs.loan_id
      AND bul.user_id = auth.uid()
    )
  );


-- ============================================================================
-- 3. UPDATE activate_loan_on_agreement_signed TO SET pending_disbursement
-- Instead of activating the loan, move to pending_disbursement status
-- ============================================================================

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

    -- Only proceed if loan is in pending_signatures status
    IF v_loan IS NOT NULL AND v_loan.status = 'pending_signatures' THEN
      -- Update loan to pending_disbursement (NOT active yet!)
      -- Loan becomes active only after lender sends money AND borrower confirms receipt
      UPDATE public.loans
      SET
        status = 'pending_disbursement',
        updated_at = NOW()
      WHERE id = NEW.loan_id;

      -- Create disbursement_proofs record for this loan
      INSERT INTO public.disbursement_proofs (loan_id)
      VALUES (NEW.loan_id)
      ON CONFLICT DO NOTHING;

      -- Notify lender to disburse the funds
      INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
      VALUES (
        v_loan.lender_id,
        'disbursement_required',
        'Agreement Signed - Disburse Funds',
        'The loan agreement has been signed by both parties. Please disburse the funds and submit proof.',
        '/l/loans/' || NEW.loan_id::TEXT,
        'lender'
      );

      -- Notify borrower that agreement is signed, waiting for disbursement
      SELECT user_id INTO v_borrower_user_id
      FROM public.borrower_user_links
      WHERE borrower_id = v_loan.borrower_id
      LIMIT 1;

      IF v_borrower_user_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
        VALUES (
          v_borrower_user_id,
          'agreement_signed',
          'Agreement Signed',
          'Your loan agreement has been signed by both parties. Waiting for lender to disburse the funds.',
          '/b/loans',
          'borrower'
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$func$;


-- ============================================================================
-- 4. CREATE FUNCTION FOR LENDER TO SUBMIT DISBURSEMENT PROOF
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_disbursement_proof(
  p_loan_id UUID,
  p_amount DECIMAL,
  p_method TEXT,
  p_reference TEXT DEFAULT NULL,
  p_proof_url TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_loan RECORD;
  v_borrower_user_id UUID;
  v_currency_symbol TEXT;
BEGIN
  -- Check authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get loan details
  SELECT l.*, b.full_name as borrower_name
  INTO v_loan
  FROM public.loans l
  JOIN public.borrowers b ON b.id = l.borrower_id
  WHERE l.id = p_loan_id;

  IF v_loan IS NULL THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;

  -- Check caller is the lender
  IF v_loan.lender_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the lender can submit disbursement proof';
  END IF;

  -- Check loan is in pending_disbursement status
  IF v_loan.status != 'pending_disbursement' THEN
    RAISE EXCEPTION 'Loan is not awaiting disbursement (status: %)', v_loan.status;
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
    ELSE v_loan.currency || ' '
  END;

  -- Update disbursement proof record
  UPDATE public.disbursement_proofs
  SET
    lender_proof_url = p_proof_url,
    lender_proof_method = p_method,
    lender_proof_reference = p_reference,
    lender_proof_amount = p_amount,
    lender_proof_date = CURRENT_DATE,
    lender_proof_notes = p_notes,
    lender_submitted_at = NOW(),
    updated_at = NOW()
  WHERE loan_id = p_loan_id;

  -- If no record exists, create one
  IF NOT FOUND THEN
    INSERT INTO public.disbursement_proofs (
      loan_id,
      lender_proof_url,
      lender_proof_method,
      lender_proof_reference,
      lender_proof_amount,
      lender_proof_date,
      lender_proof_notes,
      lender_submitted_at
    ) VALUES (
      p_loan_id,
      p_proof_url,
      p_method,
      p_reference,
      p_amount,
      CURRENT_DATE,
      p_notes,
      NOW()
    );
  END IF;

  -- Notify borrower to confirm receipt
  SELECT user_id INTO v_borrower_user_id
  FROM public.borrower_user_links
  WHERE borrower_id = v_loan.borrower_id
  LIMIT 1;

  IF v_borrower_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
    VALUES (
      v_borrower_user_id,
      'disbursement_sent',
      'Funds Sent - Please Confirm',
      'Your lender has sent ' || v_currency_symbol || p_amount::TEXT || '. Please confirm once you receive the funds.',
      '/b/loans',
      'borrower'
    );
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.submit_disbursement_proof(UUID, DECIMAL, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ============================================================================
-- 5. CREATE FUNCTION FOR BORROWER TO CONFIRM RECEIPT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.confirm_disbursement_receipt(
  p_loan_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_loan RECORD;
  v_disbursement RECORD;
  v_borrower_id UUID;
  v_currency_symbol TEXT;
BEGIN
  -- Check authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get loan details
  SELECT l.*, b.full_name as borrower_name, b.id as b_id
  INTO v_loan
  FROM public.loans l
  JOIN public.borrowers b ON b.id = l.borrower_id
  WHERE l.id = p_loan_id;

  IF v_loan IS NULL THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;

  -- Verify caller is the borrower
  IF NOT EXISTS (
    SELECT 1 FROM public.borrower_user_links bul
    WHERE bul.borrower_id = v_loan.b_id
    AND bul.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the borrower can confirm receipt';
  END IF;

  -- Check loan is in pending_disbursement status
  IF v_loan.status != 'pending_disbursement' THEN
    RAISE EXCEPTION 'Loan is not awaiting disbursement confirmation (status: %)', v_loan.status;
  END IF;

  -- Get disbursement proof
  SELECT * INTO v_disbursement
  FROM public.disbursement_proofs
  WHERE loan_id = p_loan_id;

  -- Check lender has submitted proof
  IF v_disbursement IS NULL OR v_disbursement.lender_submitted_at IS NULL THEN
    RAISE EXCEPTION 'Lender has not yet submitted disbursement proof';
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
    ELSE v_loan.currency || ' '
  END;

  -- Update disbursement proof with confirmation
  UPDATE public.disbursement_proofs
  SET
    borrower_confirmed = TRUE,
    borrower_confirmed_at = NOW(),
    borrower_confirmation_notes = p_notes,
    updated_at = NOW()
  WHERE loan_id = p_loan_id;

  -- Activate the loan
  UPDATE public.loans
  SET
    status = 'active',
    start_date = NOW(),
    disbursed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_loan_id;

  -- Generate repayment schedule now that loan is active
  PERFORM generate_simple_repayment_schedule(
    p_loan_id,
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
    'Loan Now Active - Tracking Started',
    v_loan.borrower_name || ' has confirmed receipt of funds. Loan is now active and repayment tracking has begun.',
    '/l/loans/' || p_loan_id::TEXT,
    'lender'
  );

  -- Notify borrower that loan is active
  INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
  VALUES (
    auth.uid(),
    'loan_activated',
    'Loan Now Active',
    'You have confirmed receipt of ' || v_currency_symbol || v_disbursement.lender_proof_amount::TEXT || '. Your loan is now active and repayment schedule has been generated.',
    '/b/loans',
    'borrower'
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.confirm_disbursement_receipt(UUID, TEXT) TO authenticated;


-- ============================================================================
-- 6. CREATE FUNCTION FOR BORROWER TO DISPUTE DISBURSEMENT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.dispute_disbursement(
  p_loan_id UUID,
  p_reason TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_loan RECORD;
BEGIN
  -- Check authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get loan details
  SELECT l.*, b.full_name as borrower_name, b.id as b_id
  INTO v_loan
  FROM public.loans l
  JOIN public.borrowers b ON b.id = l.borrower_id
  WHERE l.id = p_loan_id;

  IF v_loan IS NULL THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;

  -- Verify caller is the borrower
  IF NOT EXISTS (
    SELECT 1 FROM public.borrower_user_links bul
    WHERE bul.borrower_id = v_loan.b_id
    AND bul.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the borrower can dispute disbursement';
  END IF;

  -- Update disbursement proof with dispute
  UPDATE public.disbursement_proofs
  SET
    borrower_disputed = TRUE,
    borrower_dispute_reason = p_reason,
    borrower_disputed_at = NOW(),
    updated_at = NOW()
  WHERE loan_id = p_loan_id;

  -- Notify lender about dispute
  INSERT INTO public.notifications (user_id, type, title, message, link, target_role)
  VALUES (
    v_loan.lender_id,
    'disbursement_disputed',
    'Disbursement Disputed',
    v_loan.borrower_name || ' has disputed receipt of funds. Reason: ' || p_reason,
    '/l/loans/' || p_loan_id::TEXT,
    'lender'
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.dispute_disbursement(UUID, TEXT) TO authenticated;


-- ============================================================================
-- 7. ADD disbursed_at COLUMN TO loans IF NOT EXISTS
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'loans'
    AND column_name = 'disbursed_at'
  ) THEN
    ALTER TABLE public.loans ADD COLUMN disbursed_at TIMESTAMPTZ;
  END IF;
END $$;


-- ============================================================================
-- 8. UPDATE notify_loan_status_change TO HANDLE pending_disbursement
-- ============================================================================

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
      -- No notification for other transitions (pending_disbursement handled by trigger)
      NULL;
  END CASE;

  RETURN NEW;
END;
$func$;


-- ============================================================================
-- 9. CREATE updated_at TRIGGER FOR disbursement_proofs
-- ============================================================================

CREATE TRIGGER update_disbursement_proofs_updated_at
  BEFORE UPDATE ON public.disbursement_proofs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();


-- Log the migration
DO $$
BEGIN
  RAISE NOTICE 'Disbursement confirmation system migration completed';
  RAISE NOTICE 'New loan flow: pending_offer -> pending_signatures -> pending_disbursement -> active';
  RAISE NOTICE 'Created: disbursement_proofs table, submit_disbursement_proof, confirm_disbursement_receipt, dispute_disbursement functions';
END $$;
