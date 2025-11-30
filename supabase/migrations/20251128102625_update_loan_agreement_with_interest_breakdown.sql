-- Update loan agreement function to include new interest breakdown
-- Shows: Principal + Interest Rate + Interest Amount = Total
-- Also shows: Payment Type (Once-off vs Installments)

-- Add new columns to loan_agreements table for the new interest system
ALTER TABLE public.loan_agreements
ADD COLUMN IF NOT EXISTS base_rate_percent DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS extra_rate_per_installment DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS total_interest_percent DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS interest_amount_minor BIGINT,
ADD COLUMN IF NOT EXISTS total_amount_minor BIGINT,
ADD COLUMN IF NOT EXISTS payment_type TEXT,
ADD COLUMN IF NOT EXISTS num_installments INT;

-- Update the generate_loan_agreement function
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
  v_currency_symbol TEXT;
  v_principal_display TEXT;
  v_interest_amount DECIMAL;
  v_interest_display TEXT;
  v_total_display TEXT;
  v_total_rate DECIMAL;
  v_payment_info TEXT;
  v_installment_display TEXT;
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

  v_currency_symbol := COALESCE(v_country.currency_symbol, '$');

  -- Calculate interest values using new system or fallback to old
  v_total_rate := COALESCE(v_loan.total_interest_percent, v_loan.base_rate_percent, v_loan.apr_bps::DECIMAL / 100);
  v_interest_amount := COALESCE(v_loan.interest_amount_minor, (v_loan.principal_minor * v_total_rate / 100))::DECIMAL;

  v_principal_display := v_currency_symbol || ' ' || to_char(v_loan.principal_minor::DECIMAL / 100, 'FM999,999,999.00');
  v_interest_display := v_currency_symbol || ' ' || to_char(v_interest_amount / 100, 'FM999,999,999.00');
  v_total_display := v_currency_symbol || ' ' || to_char(COALESCE(v_loan.total_amount_minor, v_loan.principal_minor + v_interest_amount)::DECIMAL / 100, 'FM999,999,999.00');

  -- Payment type info
  IF COALESCE(v_loan.payment_type::TEXT, 'once_off') = 'once_off' OR COALESCE(v_loan.num_installments, 1) <= 1 THEN
    v_payment_info := 'Single Payment (Once-off)';
    v_installment_display := 'Full amount due at maturity: ' || v_total_display;
  ELSE
    v_payment_info := v_loan.num_installments::TEXT || ' Monthly Installments';
    v_installment_display := v_currency_symbol || ' ' ||
      to_char(CEIL(COALESCE(v_loan.total_amount_minor, v_loan.principal_minor + v_interest_amount)::DECIMAL / v_loan.num_installments / 100), 'FM999,999,999.00')
      || ' per month x ' || v_loan.num_installments::TEXT || ' months';
  END IF;

  -- Generate HTML agreement with clear interest breakdown
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
        .highlight { background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0; }
        .total-box { background-color: #dbeafe; padding: 15px; border-radius: 8px; margin: 15px 0; border: 2px solid #3b82f6; }
        table { width: 100%%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f0f9ff; }
        .breakdown { background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #22c55e; }
        .breakdown h3 { margin-top: 0; color: #166534; }
        .breakdown-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
        .breakdown-total { font-size: 1.2em; font-weight: bold; color: #166534; border-top: 2px solid #166534; padding-top: 10px; margin-top: 10px; }
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

      <h2>2. LOAN AMOUNT BREAKDOWN</h2>
      <div class="breakdown">
        <h3>What You Will Pay</h3>
        <div class="breakdown-row">
          <span>Principal (Amount Borrowed):</span>
          <span class="amount">%s</span>
        </div>
        <div class="breakdown-row">
          <span>Interest Rate:</span>
          <span class="amount">%s%%</span>
        </div>
        <div class="breakdown-row">
          <span>Interest Amount:</span>
          <span class="amount" style="color: #ea580c;">%s</span>
        </div>
        <div class="breakdown-row breakdown-total">
          <span>TOTAL TO REPAY:</span>
          <span>%s</span>
        </div>
      </div>

      <h2>3. PAYMENT SCHEDULE</h2>
      <table>
        <tr><th>Payment Type</th><td class="amount">%s</td></tr>
        <tr><th>Payment Details</th><td>%s</td></tr>
        <tr><th>Loan Term</th><td>%s months</td></tr>
        <tr><th>Start Date</th><td>%s</td></tr>
        <tr><th>Maturity Date</th><td>%s</td></tr>
      </table>

      <div class="highlight">
        <strong>IMPORTANT:</strong> The Borrower agrees to repay the total amount of <strong>%s</strong>
        as per the payment schedule above. Failure to pay on time may result in late fees and impact your credit score.
      </div>

      <h2>4. DEFAULT AND CONSEQUENCES</h2>
      <p>In the event of default (failure to pay as agreed), the Lender may:</p>
      <ul>
        <li>Report the Borrower to credit bureaus, which will negatively impact credit score</li>
        <li>Take legal action to recover the outstanding amount</li>
        <li>Charge additional fees as permitted by law</li>
      </ul>

      <h2>5. GOVERNING LAW</h2>
      <p>This agreement shall be governed by the laws of %s.</p>

      <h2>6. ACKNOWLEDGMENT</h2>
      <p>Both parties acknowledge that they have read, understood, and agree to all terms in this agreement.</p>

      <h2>7. SIGNATURES</h2>
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
    v_principal_display,
    v_total_rate::TEXT,
    v_interest_display,
    v_total_display,
    v_payment_info,
    v_installment_display,
    COALESCE(v_loan.num_installments, v_loan.term_months)::TEXT,
    v_loan.start_date::TEXT,
    v_loan.end_date::TEXT,
    v_total_display,
    v_country.name,
    v_lender.full_name,
    v_borrower.full_name
  );

  -- Generate plain text version with breakdown
  v_text := format(
    'LOAN AGREEMENT
Agreement No: %s
Generated: %s

=====================================
PARTIES:
=====================================
Lender: %s
Borrower: %s

=====================================
LOAN AMOUNT BREAKDOWN:
=====================================
Principal (Borrowed): %s
Interest Rate: %s%%
Interest Amount: %s
------------------------------------
TOTAL TO REPAY: %s

=====================================
PAYMENT SCHEDULE:
=====================================
Payment Type: %s
%s
Term: %s months
Start Date: %s
End Date: %s
Country: %s

=====================================
This is a legally binding loan agreement.
Both parties must sign to confirm acceptance.',
    v_loan.id,
    to_char(NOW(), 'YYYY-MM-DD HH24:MI'),
    v_lender.full_name,
    v_borrower.full_name,
    v_principal_display,
    v_total_rate::TEXT,
    v_interest_display,
    v_total_display,
    v_payment_info,
    v_installment_display,
    COALESCE(v_loan.num_installments, v_loan.term_months)::TEXT,
    v_loan.start_date::TEXT,
    v_loan.end_date::TEXT,
    v_country.name
  );

  -- Insert or update agreement
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
    end_date,
    base_rate_percent,
    extra_rate_per_installment,
    total_interest_percent,
    interest_amount_minor,
    total_amount_minor,
    payment_type,
    num_installments
  ) VALUES (
    p_loan_id,
    v_html,
    v_text,
    v_lender.full_name,
    COALESCE(v_lender.address, ''),
    v_borrower.full_name,
    COALESCE(v_borrower.address, ''),
    v_loan.principal_minor,
    COALESCE(v_loan.apr_bps, (v_total_rate * 100)::INT),
    COALESCE(v_loan.num_installments, v_loan.term_months),
    v_loan.currency,
    v_loan.start_date,
    v_loan.end_date,
    v_loan.base_rate_percent,
    v_loan.extra_rate_per_installment,
    v_total_rate,
    v_interest_amount::BIGINT,
    COALESCE(v_loan.total_amount_minor, v_loan.principal_minor + v_interest_amount::BIGINT),
    v_loan.payment_type::TEXT,
    v_loan.num_installments
  )
  ON CONFLICT (loan_id) DO UPDATE SET
    agreement_html = EXCLUDED.agreement_html,
    agreement_text = EXCLUDED.agreement_text,
    base_rate_percent = EXCLUDED.base_rate_percent,
    extra_rate_per_installment = EXCLUDED.extra_rate_per_installment,
    total_interest_percent = EXCLUDED.total_interest_percent,
    interest_amount_minor = EXCLUDED.interest_amount_minor,
    total_amount_minor = EXCLUDED.total_amount_minor,
    payment_type = EXCLUDED.payment_type,
    num_installments = EXCLUDED.num_installments,
    updated_at = NOW()
  RETURNING id INTO v_agreement_id;

  RETURN v_agreement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.generate_loan_agreement IS
'Generates a professional loan agreement with clear interest breakdown. Shows Principal + Interest Rate + Interest Amount = Total, and payment type (once-off vs installments).';
