-- Payment reminders (manual, in-app) + cross-lender unpaid summary
--
-- WHY:
--   1. The daily cron already sends an automatic 3-day-before reminder and
--      auto-flags risk at 48h late. But lenders need to be able to push an
--      extra reminder at any moment (a borrower who's late by a week, say)
--      and have it logged for the audit trail. The platform sends only an
--      in-app notification — no SMS yet — but every reminder is persisted.
--
--   2. When a lender searches a borrower across the platform, the most
--      useful number is "unpaid since when, how much, how many days?". This
--      migration adds a SECURITY DEFINER function that any authenticated
--      lender can call to get that summary for any borrower, bypassing
--      per-lender RLS on repayment_schedules. Same pattern the existing
--      /api/borrower/debt-summary endpoint uses for cross-lender data.

BEGIN;

-- 1. Reminder log. One row per manual reminder a lender sends.
CREATE TABLE IF NOT EXISTS public.payment_reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES public.repayment_schedules(id) ON DELETE SET NULL,
  borrower_id UUID NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,
  borrower_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  lender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  channel TEXT NOT NULL DEFAULT 'in_app',  -- future: 'sms', 'email'
  message TEXT,                             -- optional custom message
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Forensics so a later dispute can prove the reminder was actually sent.
  lender_ip_hash TEXT,
  lender_user_agent TEXT,
  notification_id UUID,                     -- link to the notifications row

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_reminders_loan ON public.payment_reminders(loan_id);
CREATE INDEX idx_payment_reminders_lender ON public.payment_reminders(lender_id);
CREATE INDEX idx_payment_reminders_borrower ON public.payment_reminders(borrower_id);

ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lender views own reminders"
  ON public.payment_reminders FOR SELECT
  USING (lender_id = auth.uid());

CREATE POLICY "Borrower views reminders sent to them"
  ON public.payment_reminders FOR SELECT
  USING (borrower_user_id = auth.uid());

CREATE POLICY "Admins view all reminders"
  ON public.payment_reminders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Service role manages reminders"
  ON public.payment_reminders FOR ALL
  USING (auth.role() = 'service_role');

-- 2. RPC: send a manual reminder. Rate-limited to one per loan per 12 hours
-- so a frustrated lender can't spam the borrower.
CREATE OR REPLACE FUNCTION public.send_payment_reminder(
  p_loan_id UUID,
  p_message TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_loan RECORD;
  v_borrower_user_id UUID;
  v_borrower_name TEXT;
  v_schedule RECORD;
  v_recent_reminder_at TIMESTAMPTZ;
  v_notification_id UUID;
  v_reminder_id UUID;
  v_currency_symbol TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_loan FROM public.loans WHERE id = p_loan_id;
  IF v_loan IS NULL THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;
  IF v_loan.lender_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the lender on this loan can send reminders';
  END IF;
  IF v_loan.status NOT IN ('active', 'pending_disbursement') THEN
    RAISE EXCEPTION 'Reminders can only be sent on active loans (current: %)', v_loan.status;
  END IF;

  -- Rate limit: one reminder per 12 hours per loan.
  SELECT sent_at INTO v_recent_reminder_at
  FROM public.payment_reminders
  WHERE loan_id = p_loan_id
    AND sent_at > NOW() - INTERVAL '12 hours'
  ORDER BY sent_at DESC
  LIMIT 1;
  IF v_recent_reminder_at IS NOT NULL THEN
    RAISE EXCEPTION 'A reminder was already sent on this loan in the last 12 hours (last sent: %)', v_recent_reminder_at;
  END IF;

  -- Find the earliest unpaid installment (most relevant one to remind about).
  SELECT rs.*
  INTO v_schedule
  FROM public.repayment_schedules rs
  WHERE rs.loan_id = p_loan_id
    AND rs.status IN ('pending', 'overdue', 'partial')
  ORDER BY rs.due_date ASC
  LIMIT 1;

  -- Borrower user id + display name for the notification.
  SELECT bul.user_id, b.full_name
  INTO v_borrower_user_id, v_borrower_name
  FROM public.borrowers b
  LEFT JOIN public.borrower_user_links bul ON bul.borrower_id = b.id
  WHERE b.id = v_loan.borrower_id;

  v_currency_symbol := CASE v_loan.currency
    WHEN 'USD' THEN '$' WHEN 'ZAR' THEN 'R' WHEN 'NAD' THEN 'N$'
    WHEN 'KES' THEN 'KSh' WHEN 'NGN' THEN 'N' WHEN 'GHS' THEN 'GHC'
    WHEN 'UGX' THEN 'USh' WHEN 'TZS' THEN 'TSh' WHEN 'RWF' THEN 'FRw'
    ELSE v_loan.currency || ' '
  END;

  -- Build the notification body. If a schedule was found we add the amount
  -- + due date so the borrower sees specifics.
  IF v_borrower_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, link, target_role, created_at)
    VALUES (
      v_borrower_user_id,
      'payment_reminder',
      'Payment reminder from your lender',
      COALESCE(
        p_message,
        CASE
          WHEN v_schedule.id IS NOT NULL THEN
            'Your lender has sent a reminder about your payment of ' ||
            v_currency_symbol || (v_schedule.amount_due_minor::NUMERIC / 100)::TEXT ||
            ' due ' || TO_CHAR(v_schedule.due_date, 'DD Mon YYYY') || '.'
          ELSE
            'Your lender has sent you a payment reminder. Please check your loan dashboard.'
        END
      ),
      '/b/repayments',
      'borrower',
      NOW()
    )
    RETURNING id INTO v_notification_id;
  END IF;

  -- Log the reminder. Always insert, even if borrower_user_id was null —
  -- the lender still attempted to remind.
  INSERT INTO public.payment_reminders (
    loan_id, schedule_id, borrower_id, borrower_user_id, lender_id,
    channel, message, notification_id
  ) VALUES (
    p_loan_id,
    v_schedule.id,
    v_loan.borrower_id,
    v_borrower_user_id,
    auth.uid(),
    'in_app',
    p_message,
    v_notification_id
  )
  RETURNING id INTO v_reminder_id;

  RETURN json_build_object(
    'success', true,
    'reminder_id', v_reminder_id,
    'notification_sent', v_notification_id IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_payment_reminder(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.send_payment_reminder IS
  'Lender sends a manual in-app reminder to the borrower on an active loan. Rate limited: max 1 per 12h per loan. Logs to payment_reminders for audit + dispute evidence.';

-- 3. Cross-lender unpaid summary.
-- Returns the borrower's earliest unpaid installment (any loan, any lender),
-- the days since that due date, and the total unpaid balance across all
-- their active loans. SECURITY DEFINER so callers don't need RLS access
-- to other lenders' schedules — the whole point is cross-lender visibility.
CREATE OR REPLACE FUNCTION public.get_borrower_unpaid_summary(p_borrower_id UUID)
RETURNS TABLE (
  borrower_id UUID,
  earliest_unpaid_due_date DATE,
  days_since_earliest_unpaid INT,
  unpaid_installment_count BIGINT,
  total_unpaid_minor BIGINT,
  currency TEXT,
  affected_loan_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  WITH unpaid AS (
    SELECT
      l.borrower_id,
      l.currency,
      l.id as loan_id,
      rs.due_date,
      rs.amount_due_minor,
      COALESCE(rs.paid_amount_minor, 0) as paid_minor,
      GREATEST(rs.amount_due_minor - COALESCE(rs.paid_amount_minor, 0), 0) as outstanding_minor
    FROM public.loans l
    JOIN public.repayment_schedules rs ON rs.loan_id = l.id
    WHERE l.borrower_id = p_borrower_id
      AND l.status = 'active'
      AND rs.status IN ('pending', 'overdue', 'partial')
      AND rs.due_date <= CURRENT_DATE
      AND rs.amount_due_minor > COALESCE(rs.paid_amount_minor, 0)
  )
  SELECT
    p_borrower_id,
    MIN(due_date),
    (CURRENT_DATE - MIN(due_date))::INT,
    COUNT(*),
    COALESCE(SUM(outstanding_minor), 0)::BIGINT,
    -- Pick the currency of the earliest unpaid loan. If the borrower has
    -- multiple currencies the UI can show them separately, but the headline
    -- summary uses the earliest one as primary.
    (SELECT u.currency FROM unpaid u ORDER BY u.due_date ASC LIMIT 1),
    COUNT(DISTINCT loan_id)
  FROM unpaid
  HAVING COUNT(*) > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_borrower_unpaid_summary(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_borrower_unpaid_summary IS
  'Returns the borrower''s earliest unpaid installment date, days since, and total unpaid amount across all their active loans. Used by cross-lender search so a lender vetting a new borrower sees their full unpaid history.';

COMMIT;
