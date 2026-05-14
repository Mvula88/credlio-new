-- Pre-launch cleanup of orphan code surfaced by the audit.
--
-- (1) refresh_borrower_score wrapper.
--     5 callers reference public.refresh_borrower_score(uuid) — in
--     013_link_borrower_user.sql, 015_unregistered_borrower_tracking.sql,
--     and /api/cron/check-overdue-reports — but the function is defined
--     nowhere. Every call has been silently failing in production. The
--     intended function is calculate_borrower_score. Creating a thin
--     wrapper that delegates is safer than rewriting 5 callers: any
--     external code that happens to reference the name keeps working.
--
-- (2) Drop unused outbound-webhook tables.
--     webhook_endpoints, webhook_deliveries, webhook_event_types are pure
--     scaffolding for an outbound-webhook feature that was never built.
--     No app code, RPC, or trigger writes to them. Dropping reduces the
--     schema surface area; the feature can be re-introduced later if
--     needed.
--     NOTE: this is unrelated to Stripe webhooks (inbound, handled by
--     /api/stripe/webhook + the subscriptions table). Stripe is untouched.

-- (1) refresh_borrower_score wrapper
CREATE OR REPLACE FUNCTION public.refresh_borrower_score(p_borrower_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN public.calculate_borrower_score(p_borrower_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_borrower_score(UUID) TO authenticated;

COMMENT ON FUNCTION public.refresh_borrower_score IS
  'Compatibility wrapper around calculate_borrower_score. Several historical callers reference this name; rather than rewriting them, this function delegates so all callers succeed.';

-- (2) Drop unused outbound-webhook tables. IF EXISTS so the migration is
-- safe to re-run; CASCADE in case stray FKs were created later.
DROP TABLE IF EXISTS public.webhook_deliveries CASCADE;
DROP TABLE IF EXISTS public.webhook_event_types CASCADE;
DROP TABLE IF EXISTS public.webhook_endpoints CASCADE;
