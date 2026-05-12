-- Lender-side payment notifications and wiring of the daily maintenance wrapper.
--
-- Existing state (already deployed):
--   send_payment_reminders()           -- 3-day-before reminder, BORROWER ONLY
--   update_overdue_schedules()         -- marks schedules overdue past due date
--   check_loan_defaults()              -- marks loans defaulted at 90+ days late
--   refresh_risks_and_scores(48)       -- auto-flags overdue schedules (wired into cron in commit a8d9527)
--   run_daily_loan_maintenance()       -- wrapper calling reminders/overdue/defaults BUT orphaned and missing risk refresh
--
-- Changes here:
--   (1) send_payment_reminders also notifies the LENDER so they don't forget to record cash
--       payments. The "I forgot to update" → "system auto-flags my honest borrower" failure
--       mode was the user's main concern; lender-side reminders are the primary mitigation.
--   (2) New function notify_about_new_auto_flags() runs after refresh_risks_and_scores and
--       creates lender + borrower notifications for any SYSTEM_AUTO flag that doesn't have
--       one yet. Keeps the risk engine itself untouched (single responsibility) and lets
--       the auto-flag → notification step be idempotent across cron runs.
--   (3) run_daily_loan_maintenance now also calls refresh_risks_and_scores(48) and
--       notify_about_new_auto_flags() so a single entry point covers the whole pipeline.

-- ----------------------------------------------------------------------------
-- (1) send_payment_reminders — add lender notification alongside borrower one.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_payment_reminders()
RETURNS INTEGER AS $$
DECLARE
  v_reminder_count INTEGER := 0;
  v_schedule RECORD;
  v_borrower_user_id UUID;
  v_currency_symbol TEXT;
  v_amount_due DECIMAL;
  v_days_until_due INTEGER;
  v_borrower_name TEXT;
BEGIN
  FOR v_schedule IN
    SELECT
      rs.id,
      rs.loan_id,
      rs.amount_due_minor,
      rs.due_date,
      rs.reminder_sent,
      l.lender_id,
      l.borrower_id,
      l.currency,
      b.full_name as borrower_name
    FROM public.repayment_schedules rs
    JOIN public.loans l ON l.id = rs.loan_id
    JOIN public.borrowers b ON b.id = l.borrower_id
    WHERE rs.status = 'pending'
    AND rs.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'
    AND l.status = 'active'
    AND (rs.reminder_sent IS NULL OR rs.reminder_sent = false)
  LOOP
    v_days_until_due := (v_schedule.due_date - CURRENT_DATE);
    v_borrower_name := COALESCE(v_schedule.borrower_name, 'borrower');

    v_currency_symbol := CASE
      WHEN v_schedule.currency = 'USD' THEN '$'
      WHEN v_schedule.currency = 'KES' THEN 'KSh'
      WHEN v_schedule.currency = 'UGX' THEN 'USh'
      WHEN v_schedule.currency = 'TZS' THEN 'TSh'
      WHEN v_schedule.currency = 'RWF' THEN 'FRw'
      WHEN v_schedule.currency = 'NGN' THEN 'N'
      WHEN v_schedule.currency = 'GHS' THEN 'GHC'
      WHEN v_schedule.currency = 'ZAR' THEN 'R'
      WHEN v_schedule.currency = 'NAD' THEN 'N$'
      WHEN v_schedule.currency = 'EUR' THEN 'EUR'
      WHEN v_schedule.currency = 'GBP' THEN 'GBP'
      ELSE v_schedule.currency || ' '
    END;

    v_amount_due := v_schedule.amount_due_minor / 100.0;

    -- Notify lender (always — lender always has a user_id because they sign up).
    -- Heads-up so they record cash payments on time and the system doesn't
    -- auto-flag an honest borrower because of a missed manual update.
    INSERT INTO public.notifications (
      user_id, type, title, message, link, target_role
    ) VALUES (
      v_schedule.lender_id,
      'payment_due',
      'Payment due soon',
      'Payment of ' || v_currency_symbol || v_amount_due::TEXT
        || ' from ' || v_borrower_name
        || ' is due in ' || v_days_until_due || ' day(s). Remember to mark it as paid once received.',
      '/l/loans/' || v_schedule.loan_id,
      'lender'
    );

    -- Notify borrower if linked.
    SELECT user_id INTO v_borrower_user_id
    FROM public.borrower_user_links
    WHERE borrower_id = v_schedule.borrower_id
    LIMIT 1;

    IF v_borrower_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        user_id, type, title, message, link, target_role
      ) VALUES (
        v_borrower_user_id,
        'payment_due',
        'Payment Reminder',
        'Your payment of ' || v_currency_symbol || v_amount_due::TEXT
          || ' is due in ' || v_days_until_due || ' day(s).',
        '/b/loans',
        'borrower'
      );
    END IF;

    UPDATE public.repayment_schedules
    SET reminder_sent = true, updated_at = NOW()
    WHERE id = v_schedule.id;

    v_reminder_count := v_reminder_count + 1;
  END LOOP;

  RETURN v_reminder_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- (2) notify_about_new_auto_flags — runs AFTER refresh_risks_and_scores.
--     Creates lender + borrower notifications for any SYSTEM_AUTO risk_flag
--     that doesn't already have a notification. Idempotent across runs.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_about_new_auto_flags()
RETURNS INTEGER AS $$
DECLARE
  v_notified INT := 0;
  v_flag RECORD;
  v_lender_user_id UUID;
  v_borrower_user_id UUID;
  v_borrower_name TEXT;
  v_severity_label TEXT;
BEGIN
  -- Process flags created within the last 7 days that haven't been notified yet.
  -- Using a NOT EXISTS check against notifications avoids needing a flag column
  -- on risk_flags and keeps this function idempotent.
  FOR v_flag IN
    SELECT
      rf.id, rf.borrower_id, rf.type::TEXT AS type, rf.reason, rf.created_at,
      b.full_name AS borrower_name
    FROM public.risk_flags rf
    JOIN public.borrowers b ON b.id = rf.borrower_id
    WHERE rf.origin = 'SYSTEM_AUTO'
      AND rf.created_at > NOW() - INTERVAL '7 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.metadata->>'risk_flag_id' = rf.id::TEXT
      )
  LOOP
    v_severity_label := CASE v_flag.type
      WHEN 'LATE_1_7' THEN 'late (1-7 days)'
      WHEN 'LATE_8_30' THEN 'late (8-30 days)'
      WHEN 'LATE_31_60' THEN 'late (31-60 days)'
      WHEN 'DEFAULT' THEN 'in default (60+ days)'
      ELSE v_flag.type
    END;

    v_borrower_name := COALESCE(v_flag.borrower_name, 'A borrower');

    -- Notify lenders who have an active loan to this borrower.
    -- Multiple lenders may have lent to the same borrower; each should know
    -- that the borrower has been flagged.
    FOR v_lender_user_id IN
      SELECT DISTINCT l.lender_id
      FROM public.loans l
      WHERE l.borrower_id = v_flag.borrower_id
        AND l.status = 'active'
    LOOP
      INSERT INTO public.notifications (
        user_id, type, title, message, link, target_role, metadata
      ) VALUES (
        v_lender_user_id,
        'payment_overdue',
        'Borrower flagged for missed payment',
        v_borrower_name || ' was automatically flagged as ' || v_severity_label
          || '. ' || COALESCE(v_flag.reason, ''),
        '/l/borrowers/' || v_flag.borrower_id,
        'lender',
        jsonb_build_object('risk_flag_id', v_flag.id)
      );
      v_notified := v_notified + 1;
    END LOOP;

    -- Notify borrower if they have a linked user account.
    SELECT user_id INTO v_borrower_user_id
    FROM public.borrower_user_links
    WHERE borrower_id = v_flag.borrower_id
    LIMIT 1;

    IF v_borrower_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        user_id, type, title, message, link, target_role, metadata
      ) VALUES (
        v_borrower_user_id,
        'payment_overdue',
        'You were flagged for a missed payment',
        'A lender has not recorded your payment. Your credit record has been updated. If you have paid, contact your lender to update the system, or open a dispute.',
        '/b/credit',
        'borrower',
        jsonb_build_object('risk_flag_id', v_flag.id)
      );
      v_notified := v_notified + 1;
    END IF;
  END LOOP;

  RETURN v_notified;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.notify_about_new_auto_flags() TO service_role;

-- ----------------------------------------------------------------------------
-- (3) run_daily_loan_maintenance — now also runs risk refresh + new-flag notifs.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_daily_loan_maintenance()
RETURNS JSON AS $$
DECLARE
  v_reminders_sent INTEGER;
  v_overdue_updated INTEGER;
  v_defaults_marked INTEGER;
  v_risk_refresh JSONB;
  v_flag_notifications INTEGER;
BEGIN
  -- Order matters: send reminders BEFORE risk refresh so lenders get the
  -- 3-day heads-up before any flag fires on this run.
  SELECT public.send_payment_reminders() INTO v_reminders_sent;
  SELECT public.update_overdue_schedules() INTO v_overdue_updated;
  SELECT public.refresh_risks_and_scores(48) INTO v_risk_refresh;
  SELECT public.notify_about_new_auto_flags() INTO v_flag_notifications;
  SELECT public.check_loan_defaults() INTO v_defaults_marked;

  RETURN json_build_object(
    'reminders_sent', v_reminders_sent,
    'overdue_updated', v_overdue_updated,
    'risk_refresh', v_risk_refresh,
    'flag_notifications', v_flag_notifications,
    'defaults_marked', v_defaults_marked,
    'run_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.run_daily_loan_maintenance() TO service_role;

COMMENT ON FUNCTION public.send_payment_reminders IS
  'Notifies lender and borrower of payments due in next 3 days. Marks reminder_sent so it only fires once per schedule.';

COMMENT ON FUNCTION public.notify_about_new_auto_flags IS
  'Creates lender + borrower notifications for SYSTEM_AUTO risk_flags that have no notification yet. Idempotent.';

COMMENT ON FUNCTION public.run_daily_loan_maintenance IS
  'Single entry point for the daily cron. Order: reminders → overdue → risk refresh → flag notifications → defaults.';

-- ----------------------------------------------------------------------------
-- (4) Guard notify_risk_flag_added trigger against SYSTEM_AUTO flags.
--
-- The existing trigger was designed for manually-filed flags ("lender X
-- flagged this borrower → warn other lenders with active loans"). Our new
-- notify_about_new_auto_flags() handles SYSTEM_AUTO flags more thoroughly
-- (notifies both lender and borrower, uses metadata for idempotency).
-- Without this guard, every SYSTEM_AUTO flag generates two notifications
-- per active lender (one from the trigger, one from the new function).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_risk_flag_added()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_lender RECORD;
  v_borrower_name TEXT;
BEGIN
  -- SYSTEM_AUTO flags are handled by notify_about_new_auto_flags; skip here
  -- to avoid double-notifying.
  IF NEW.origin = 'SYSTEM_AUTO' THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_borrower_name
  FROM public.borrowers
  WHERE id = NEW.borrower_id;

  FOR v_lender IN
    SELECT DISTINCT l.lender_id
    FROM public.loans l
    WHERE l.borrower_id = NEW.borrower_id
      AND l.status IN ('active', 'pending_signatures', 'pending_disbursement')
      AND l.lender_id != NEW.created_by
  LOOP
    PERFORM public.create_notification(
      v_lender.lender_id,
      'risk_flag_added',
      'Risk Flag Warning',
      'A borrower you have an active loan with (' || COALESCE(v_borrower_name, 'Unknown') || ') has been flagged by another lender.',
      '/l/loans',
      'high'
    );
  END LOOP;

  RETURN NEW;
END;
$func$;
