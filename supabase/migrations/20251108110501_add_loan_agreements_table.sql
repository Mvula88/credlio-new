-- Create loan_agreements table to store generated loan agreements
-- These are automatically generated when a loan is created

CREATE TABLE IF NOT EXISTS public.loan_agreements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id UUID NOT NULL UNIQUE REFERENCES public.loans(id) ON DELETE CASCADE,

  -- Agreement content
  agreement_html TEXT NOT NULL, -- HTML version for display
  agreement_text TEXT NOT NULL, -- Plain text version

  -- Agreement metadata
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INT NOT NULL DEFAULT 1, -- For tracking agreement template versions

  -- Parties
  lender_name TEXT NOT NULL,
  lender_address TEXT,
  borrower_name TEXT NOT NULL,
  borrower_address TEXT,

  -- Loan terms (snapshot at agreement time)
  principal_minor BIGINT NOT NULL,
  apr_bps INT NOT NULL,
  term_months INT NOT NULL,
  currency TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  -- Signatures (for future e-signature integration)
  lender_signed_at TIMESTAMPTZ,
  lender_signature_hash TEXT,
  borrower_signed_at TIMESTAMPTZ,
  borrower_signature_hash TEXT,

  -- Download tracking
  lender_downloaded_at TIMESTAMPTZ,
  borrower_downloaded_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_loan_agreements_loan ON public.loan_agreements(loan_id);
CREATE INDEX idx_loan_agreements_generated ON public.loan_agreements(generated_at DESC);

-- RLS Policies
ALTER TABLE public.loan_agreements ENABLE ROW LEVEL SECURITY;

-- Lenders can view agreements for their loans
CREATE POLICY "Lenders can view their loan agreements"
  ON public.loan_agreements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = loan_agreements.loan_id
        AND l.lender_id = jwt_uid()
    )
    OR jwt_has_role('admin')
  );

-- Borrowers can view agreements for their loans
CREATE POLICY "Borrowers can view their loan agreements"
  ON public.loan_agreements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = loan_agreements.loan_id
        AND l.borrower_id IN (
          SELECT borrower_id FROM public.borrower_user_links
          WHERE user_id = jwt_uid()
        )
    )
    OR jwt_has_role('admin')
  );

-- Only system can insert/update (through triggers or functions)
CREATE POLICY "Only admins can manage agreements"
  ON public.loan_agreements FOR ALL
  USING (jwt_has_role('admin'));

-- Function to generate loan agreement HTML
CREATE OR REPLACE FUNCTION public.generate_loan_agreement(p_loan_id UUID)
RETURNS UUID AS $$
DECLARE
  v_agreement_id UUID;
  v_loan RECORD;
  v_lender RECORD;
  v_borrower RECORD;
  v_html TEXT;
  v_text TEXT;
  v_country RECORD;
BEGIN
  -- Get loan details
  SELECT * INTO v_loan
  FROM public.loans
  WHERE id = p_loan_id;

  IF v_loan IS NULL THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;

  -- Get lender details
  SELECT l.*, p.full_name, pi.address
  INTO v_lender
  FROM public.lenders l
  JOIN public.profiles p ON p.user_id = l.user_id
  LEFT JOIN public.provider_info pi ON pi.user_id = l.user_id
  WHERE l.user_id = v_loan.lender_id;

  -- Get borrower details
  SELECT b.*, b.full_name, b.physical_address as address
  INTO v_borrower
  FROM public.borrowers b
  WHERE b.id = v_loan.borrower_id;

  -- Get country details
  SELECT * INTO v_country
  FROM public.countries
  WHERE code = v_loan.country_code;

  -- Generate HTML agreement
  v_html := format(
    '<html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { text-align: center; color: #0f3460; }
        h2 { color: #1e40af; margin-top: 30px; }
        .header { text-align: center; margin-bottom: 40px; }
        .parties { margin: 30px 0; }
        .terms { margin: 20px 0; }
        .signature-box { margin-top: 50px; display: inline-block; width: 45%%; }
        .amount { font-weight: bold; color: #0f3460; }
        table { width: 100%%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f0f9ff; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>LOAN AGREEMENT</h1>
        <p>Agreement No: <strong>%s</strong></p>
        <p>Generated: <strong>%s</strong></p>
      </div>

      <h2>1. PARTIES TO THIS AGREEMENT</h2>
      <div class="parties">
        <p><strong>LENDER:</strong><br>
        %s<br>
        %s</p>

        <p><strong>BORROWER:</strong><br>
        %s<br>
        %s</p>
      </div>

      <h2>2. LOAN TERMS</h2>
      <table>
        <tr><th>Loan Amount (Principal)</th><td class="amount">%s %s</td></tr>
        <tr><th>Annual Interest Rate (APR)</th><td class="amount">%s%%</td></tr>
        <tr><th>Loan Term</th><td>%s months</td></tr>
        <tr><th>Start Date</th><td>%s</td></tr>
        <tr><th>Maturity Date</th><td>%s</td></tr>
        <tr><th>Country</th><td>%s</td></tr>
      </table>

      <h2>3. REPAYMENT TERMS</h2>
      <p>The Borrower agrees to repay the Loan Amount plus interest according to the repayment schedule attached to this agreement.</p>

      <h2>4. DEFAULT</h2>
      <p>In the event of default, the Lender may report the Borrower to credit bureaus and take legal action to recover the outstanding amount.</p>

      <h2>5. GOVERNING LAW</h2>
      <p>This agreement shall be governed by the laws of %s.</p>

      <h2>6. SIGNATURES</h2>
      <div style="margin-top: 60px;">
        <div class="signature-box">
          <p>_________________________</p>
          <p><strong>Lender Signature</strong><br>%s<br>Date: __________</p>
        </div>
        <div class="signature-box" style="float: right;">
          <p>_________________________</p>
          <p><strong>Borrower Signature</strong><br>%s<br>Date: __________</p>
        </div>
      </div>
    </body>
    </html>',
    v_loan.id,
    to_char(NOW(), 'YYYY-MM-DD HH24:MI'),
    v_lender.full_name,
    COALESCE(v_lender.address, 'Address on file'),
    v_borrower.full_name,
    COALESCE(v_borrower.address, 'Address on file'),
    v_country.currency_symbol,
    (v_loan.principal_minor::DECIMAL / 100)::TEXT,
    (v_loan.apr_bps::DECIMAL / 100)::TEXT,
    v_loan.term_months::TEXT,
    v_loan.start_date::TEXT,
    v_loan.end_date::TEXT,
    v_country.name,
    v_country.name,
    v_lender.full_name,
    v_borrower.full_name
  );

  -- Generate plain text version
  v_text := format(
    'LOAN AGREEMENT
Agreement No: %s
Generated: %s

PARTIES:
Lender: %s
Borrower: %s

LOAN TERMS:
Principal: %s %s
APR: %s%%
Term: %s months
Start Date: %s
End Date: %s
Country: %s

This is a legally binding loan agreement.',
    v_loan.id,
    to_char(NOW(), 'YYYY-MM-DD HH24:MI'),
    v_lender.full_name,
    v_borrower.full_name,
    v_country.currency_symbol,
    (v_loan.principal_minor::DECIMAL / 100)::TEXT,
    (v_loan.apr_bps::DECIMAL / 100)::TEXT,
    v_loan.term_months::TEXT,
    v_loan.start_date::TEXT,
    v_loan.end_date::TEXT,
    v_country.name
  );

  -- Insert agreement
  INSERT INTO public.loan_agreements (
    loan_id,
    agreement_html,
    agreement_text,
    lender_name,
    lender_address,
    borrower_name,
    borrower_address,
    principal_minor,
    apr_bps,
    term_months,
    currency,
    start_date,
    end_date
  ) VALUES (
    p_loan_id,
    v_html,
    v_text,
    v_lender.full_name,
    COALESCE(v_lender.address, ''),
    v_borrower.full_name,
    COALESCE(v_borrower.address, ''),
    v_loan.principal_minor,
    v_loan.apr_bps,
    v_loan.term_months,
    v_loan.currency,
    v_loan.start_date,
    v_loan.end_date
  )
  ON CONFLICT (loan_id) DO UPDATE SET
    updated_at = NOW()
  RETURNING id INTO v_agreement_id;

  RETURN v_agreement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.generate_loan_agreement IS
'Generates a professional loan agreement document for a given loan. Called automatically when a loan is created.';
