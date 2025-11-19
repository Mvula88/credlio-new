-- Debug script to check user roles and access
-- Replace YOUR_USER_ID with your actual auth.users.id

-- Check if you have roles in user_roles table
SELECT 'User Roles:' as check_type;
SELECT user_id, role, created_at FROM public.user_roles;

-- Check if you have a lender record
SELECT 'Lender Records:' as check_type;
SELECT user_id, business_name, verification_status FROM public.lenders;

-- Check borrower records
SELECT 'Borrower Records:' as check_type;
SELECT id, full_name, phone_e164, email FROM public.borrowers;

-- Check borrower_user_links
SELECT 'Borrower User Links:' as check_type;
SELECT borrower_id, user_id, linked_at FROM public.borrower_user_links;

-- Check profiles
SELECT 'Profiles:' as check_type;
SELECT user_id, full_name, app_role FROM public.profiles;
