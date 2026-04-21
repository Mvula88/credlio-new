-- Enable RLS on 11 previously-exposed public tables
--
-- The Supabase advisor flagged these tables as having RLS disabled,
-- meaning any client with the anon key could read and modify every row.
-- This migration enables RLS on each table and adds SELECT policies
-- appropriate to the data's sensitivity.
--
-- Write policies are intentionally omitted for every table:
--   - Triggers and SECURITY DEFINER functions run as table owner and
--     bypass RLS, so legitimate backend writes still work.
--   - Server routes using the service role key also bypass RLS.
--   - Direct writes from the anon/authenticated role are blocked,
--     which is the correct behavior for all 11 tables (they are either
--     audit logs, system-owned aggregates, or admin-managed reference
--     data — none should accept direct client writes).

BEGIN;

-- ============================================
-- Admin-only tables
-- ============================================

-- audit_ledger: hash-chained immutable audit log
ALTER TABLE public.audit_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read audit ledger"
  ON public.audit_ledger FOR SELECT
  USING (public.is_admin());

-- dispute_timeline: dispute event history (contains sensitive PII and actor context)
ALTER TABLE public.dispute_timeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read dispute timeline"
  ON public.dispute_timeline FOR SELECT
  USING (public.is_admin());

-- market_analytics: daily aggregate platform stats
ALTER TABLE public.market_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read market analytics"
  ON public.market_analytics FOR SELECT
  USING (public.is_admin());

-- message_moderation_keywords: exposing this list would let users evade moderation
ALTER TABLE public.message_moderation_keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read moderation keywords"
  ON public.message_moderation_keywords FOR SELECT
  USING (public.is_admin());

-- webhook_event_types: internal webhook catalog
ALTER TABLE public.webhook_event_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read webhook event types"
  ON public.webhook_event_types FOR SELECT
  USING (public.is_admin());

-- ============================================
-- Authenticated-read reference tables
-- ============================================

-- loan_request_templates: borrower UI reads active templates when creating a request
ALTER TABLE public.loan_request_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read active templates"
  ON public.loan_request_templates FOR SELECT
  TO authenticated
  USING (is_active = TRUE OR public.is_admin());

-- plan_limits: clients may look up limits for their subscription tier
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read plan limits"
  ON public.plan_limits FOR SELECT
  TO authenticated
  USING (TRUE);

-- ============================================
-- Self-access + admin tables
-- ============================================

-- borrower_request_summary: borrower sees own aggregate stats
ALTER TABLE public.borrower_request_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Borrower or admin can read own request summary"
  ON public.borrower_request_summary FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.borrower_user_links bul
      WHERE bul.borrower_id = borrower_request_summary.borrower_id
        AND bul.user_id = auth.uid()
    )
  );

-- request_performance_stats: borrower sees own per-request metrics
ALTER TABLE public.request_performance_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Borrower or admin can read own request stats"
  ON public.request_performance_stats FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.borrower_user_links bul
      WHERE bul.borrower_id = request_performance_stats.borrower_id
        AND bul.user_id = auth.uid()
    )
  );

-- lender_notification_log: lender sees own notification history
ALTER TABLE public.lender_notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lender or admin can read own notification log"
  ON public.lender_notification_log FOR SELECT
  USING (lender_id = auth.uid() OR public.is_admin());

-- lender_reputation_events: lender sees own reputation events
ALTER TABLE public.lender_reputation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lender or admin can read own reputation events"
  ON public.lender_reputation_events FOR SELECT
  USING (lender_id = auth.uid() OR public.is_admin());

COMMIT;
