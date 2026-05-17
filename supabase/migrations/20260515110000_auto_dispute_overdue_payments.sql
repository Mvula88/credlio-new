-- Auto-create disputes for payments 15+ days overdue.
--
-- WHY: by the time a payment is 15 days past due, the system has already
-- (1) sent a 3-day-before heads-up, (2) auto-flagged risk at 48h, and
-- (3) probably had at least one manual lender reminder. If none of that
-- has resulted in payment, the situation has escalated past "late" into
-- "dispute" territory. The dispute is what the borrower's cross-lender
-- reputation hinges on — it's the formal record that shows up to every
-- other lender on the platform.
--
-- Auto-disputes are attributed to the lender on the loan (created_by =
-- lender) since the dispute exists on their behalf. They can take it
-- over, add evidence, or resolve it manually from /l/disputes. The
-- borrower can also respond from /b/disputes.

BEGIN;

CREATE OR REPLACE FUNCTION public.auto_create_late_payment_disputes(
  p_days_threshold INT DEFAULT 15
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inserted INT := 0;
  v_row RECORD;
  v_dispute_id UUID;
  v_borrower_user_id UUID;
  v_lender_name TEXT;
  v_borrower_name TEXT;
  v_currency_symbol TEXT;
  v_amount_due NUMERIC;
  v_days_late INT;
BEGIN
  FOR v_row IN
    SELECT
      rs.id AS schedule_id,
      rs.due_date,
      rs.amount_due_minor,
      COALESCE(rs.paid_amount_minor, 0) AS paid_minor,
      l.id AS loan_id,
      l.borrower_id,
      l.lender_id,
      l.country_code,
      l.currency
    FROM public.repayment_schedules rs
    JOIN public.loans l ON l.id = rs.loan_id
    WHERE l.status = 'active'
      AND rs.status IN ('pending', 'overdue', 'partial')
      AND rs.due_date <= CURRENT_DATE - (p_days_threshold || ' days')::INTERVAL
      AND rs.amount_due_minor > COALESCE(rs.paid_amount_minor, 0)
      AND NOT EXISTS (
        -- Avoid duplicate auto-disputes for the same loan.
        SELECT 1 FROM public.disputes d
        WHERE d.loan_id = l.id
          AND d.type = 'late_payment_auto'
          AND d.status IN ('open', 'under_review')
      )
  LOOP
    v_days_late := (CURRENT_DATE - v_row.due_date)::INT;
    v_amount_due := (v_row.amount_due_minor - v_row.paid_minor)::NUMERIC / 100.0;

    v_currency_symbol := CASE v_row.currency
      WHEN 'USD' THEN '$' WHEN 'ZAR' THEN 'R' WHEN 'NAD' THEN 'N$'
      WHEN 'KES' THEN 'KSh' WHEN 'NGN' THEN 'N' WHEN 'GHS' THEN 'GHC'
      WHEN 'UGX' THEN 'USh' WHEN 'TZS' THEN 'TSh' WHEN 'RWF' THEN 'FRw'
      ELSE v_row.currency || ' '
    END;

    SELECT bul.user_id, b.full_name
    INTO v_borrower_user_id, v_borrower_name
    FROM public.borrowers b
    LEFT JOIN public.borrower_user_links bul ON bul.borrower_id = b.id
    WHERE b.id = v_row.borrower_id;

    SELECT COALESCE(p.full_name, 'Lender')
    INTO v_lender_name
    FROM public.profiles p
    WHERE p.user_id = v_row.lender_id;

    INSERT INTO public.disputes (
      borrower_id,
      lender_id,
      loan_id,
      country_code,
      type,
      description,
      status,
      created_by,
      created_at
    ) VALUES (
      v_row.borrower_id,
      v_row.lender_id,
      v_row.loan_id,
      v_row.country_code,
      'late_payment_auto',
      'Auto-created by the platform: installment of ' || v_currency_symbol || v_amount_due::TEXT ||
        ' was due on ' || TO_CHAR(v_row.due_date, 'DD Mon YYYY') ||
        ' and remains unpaid for ' || v_days_late || ' days. ' ||
        'This dispute is now part of the borrower''s cross-lender reputation record. ' ||
        'The lender and borrower can both add notes or evidence below.',
      'open',
      v_row.lender_id,
      NOW()
    )
    RETURNING id INTO v_dispute_id;

    v_inserted := v_inserted + 1;

    -- Notify the lender that a dispute has been created on their behalf.
    INSERT INTO public.notifications (user_id, type, title, message, link, target_role, created_at)
    VALUES (
      v_row.lender_id,
      'risk_flag',
      'Auto-dispute opened',
      'A dispute has been opened on your loan to ' || COALESCE(v_borrower_name, 'borrower') ||
        ' because an installment is ' || v_days_late || ' days unpaid. Add evidence or take action on the dispute page.',
      '/l/disputes',
      'lender',
      NOW()
    );

    IF v_borrower_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, link, target_role, created_at)
      VALUES (
        v_borrower_user_id,
        'risk_flag',
        'Dispute opened on your loan',
        v_currency_symbol || v_amount_due::TEXT || ' is ' || v_days_late ||
          ' days overdue on your loan with ' || v_lender_name ||
          '. This is now a formal dispute on your cross-lender record. Pay or respond on the disputes page.',
        '/b/disputes',
        'borrower',
        NOW()
      );
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_create_late_payment_disputes(INT) TO service_role;

COMMENT ON FUNCTION public.auto_create_late_payment_disputes IS
  'Creates type=late_payment_auto disputes for installments that have been unpaid for p_days_threshold or more days (default 15). Idempotent: never creates a duplicate open dispute on the same loan. Notifies both lender and borrower.';

-- Hook into the daily maintenance pipeline. Order: after risk flags fire
-- (so the dispute description can rely on flag history existing) but
-- before defaults (so a 90-day default still has its dispute open
-- already, not a fresh one).
CREATE OR REPLACE FUNCTION public.run_daily_loan_maintenance()
RETURNS JSON AS $$
DECLARE
  v_reminders_sent INTEGER;
  v_overdue_updated INTEGER;
  v_defaults_marked INTEGER;
  v_risk_refresh JSONB;
  v_flag_notifications INTEGER;
  v_auto_disputes INTEGER;
BEGIN
  SELECT public.send_payment_reminders() INTO v_reminders_sent;
  SELECT public.update_overdue_schedules() INTO v_overdue_updated;
  SELECT public.refresh_risks_and_scores(48) INTO v_risk_refresh;
  SELECT public.notify_about_new_auto_flags() INTO v_flag_notifications;
  SELECT public.auto_create_late_payment_disputes(15) INTO v_auto_disputes;
  SELECT public.check_loan_defaults() INTO v_defaults_marked;

  RETURN json_build_object(
    'reminders_sent', v_reminders_sent,
    'overdue_updated', v_overdue_updated,
    'risk_refresh', v_risk_refresh,
    'flag_notifications', v_flag_notifications,
    'auto_disputes', v_auto_disputes,
    'defaults_marked', v_defaults_marked,
    'run_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.run_daily_loan_maintenance() TO service_role;

COMMIT;
