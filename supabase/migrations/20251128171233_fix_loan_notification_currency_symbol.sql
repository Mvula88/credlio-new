-- Fix the notify_borrower_of_loan_offer trigger function
-- The original used public.countries with wrong column name, should use country_currency_allowed

CREATE OR REPLACE FUNCTION public.notify_borrower_of_loan_offer()
RETURNS TRIGGER AS $$
DECLARE
  v_borrower_user_id UUID;
  v_lender_name TEXT;
  v_amount DECIMAL;
  v_currency_symbol TEXT;
BEGIN
  -- Only trigger for pending_offer status
  IF NEW.status = 'pending_offer' THEN
    -- Get borrower's user_id
    SELECT user_id INTO v_borrower_user_id
    FROM public.borrower_user_links
    WHERE borrower_id = NEW.borrower_id;

    -- Only notify if borrower has an account
    IF v_borrower_user_id IS NOT NULL THEN
      -- Get lender name
      SELECT COALESCE(l.business_name, p.full_name, 'A lender') INTO v_lender_name
      FROM public.lenders l
      LEFT JOIN public.profiles p ON l.user_id = p.user_id
      WHERE l.user_id = NEW.lender_id;

      -- Calculate amount in major units
      v_amount := COALESCE(NEW.principal_minor, 0) / 100.0;

      -- Get currency symbol from country_currency_allowed table
      SELECT currency_symbol INTO v_currency_symbol
      FROM public.country_currency_allowed
      WHERE country_code = NEW.country_code
      LIMIT 1;

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
        )::jsonb
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
