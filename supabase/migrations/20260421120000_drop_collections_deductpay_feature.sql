-- Drop Collections / DeductPay / DPO feature
--
-- The Collections/DeductPay feature (automatic card deduction via DPO) was
-- abandoned. The runtime code (consent page, DPO webhook, deduction cron,
-- lender collections/payout UI) has already been removed. This migration
-- removes the now-orphaned database schema that was introduced by:
--   - 20260105180005_collections_deductpay_feature.sql
--   - 20260105200000_add_borrower_revoke_mandate.sql
--
-- No other code paths reference these objects, so dropping them is safe.
-- Uses IF EXISTS so the migration is idempotent.

BEGIN;

-- 1. Drop functions (they reference the tables via SECURITY DEFINER)
DROP FUNCTION IF EXISTS public.revoke_mandate_by_borrower(UUID);
DROP FUNCTION IF EXISTS public.cancel_mandate(UUID, TEXT);
DROP FUNCTION IF EXISTS public.get_collection_stats(UUID);
DROP FUNCTION IF EXISTS public.submit_borrower_consent(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_mandate_for_consent(TEXT);
DROP FUNCTION IF EXISTS public.create_payment_mandate(UUID, DECIMAL, TEXT, INTEGER, DATE);
DROP FUNCTION IF EXISTS public.generate_consent_token();

-- 2. Drop tables in reverse dependency order.
--    CASCADE on each drops the policies and indexes attached to it.
DROP TABLE IF EXISTS public.payment_webhook_logs CASCADE;
DROP TABLE IF EXISTS public.deduction_transactions CASCADE;
DROP TABLE IF EXISTS public.scheduled_deductions CASCADE;
DROP TABLE IF EXISTS public.payment_methods CASCADE;
DROP TABLE IF EXISTS public.payment_mandates CASCADE;
DROP TABLE IF EXISTS public.lender_payout_settings CASCADE;

COMMIT;
