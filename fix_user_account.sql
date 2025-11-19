-- Fix user account: d122d015-70d3-42db-8a69-87554ad1e33a
-- Create missing lender record

INSERT INTO public.lenders (user_id, created_at, updated_at)
VALUES ('d122d015-70d3-42db-8a69-87554ad1e33a', NOW(), NOW())
ON CONFLICT (user_id) DO NOTHING;

-- Ensure subscription exists
INSERT INTO public.subscriptions (user_id, tier, status, created_at, updated_at)
VALUES ('d122d015-70d3-42db-8a69-87554ad1e33a', 'BASIC', 'active', NOW(), NOW())
ON CONFLICT (user_id) DO NOTHING;

-- Verify the records
SELECT 'Profile:' as record_type, user_id, app_role, onboarding_completed FROM public.profiles WHERE user_id = 'd122d015-70d3-42db-8a69-87554ad1e33a'
UNION ALL
SELECT 'Lender:' as record_type, user_id::text, id::text, created_at::text FROM public.lenders WHERE user_id = 'd122d015-70d3-42db-8a69-87554ad1e33a'
UNION ALL
SELECT 'Subscription:' as record_type, user_id::text, tier::text, status::text FROM public.subscriptions WHERE user_id = 'd122d015-70d3-42db-8a69-87554ad1e33a';
