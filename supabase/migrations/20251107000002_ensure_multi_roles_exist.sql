-- Ensure all users with lenders table entry have lender role in user_roles
-- This fixes any users who might be missing the lender role

DO $$
DECLARE
  lender_record RECORD;
BEGIN
  FOR lender_record IN
    SELECT DISTINCT l.user_id
    FROM public.lenders l
  LOOP
    -- Ensure lender role exists in user_roles
    INSERT INTO public.user_roles (user_id, role)
    VALUES (lender_record.user_id, 'lender')
    ON CONFLICT (user_id, role) DO NOTHING;

    RAISE NOTICE 'Ensured lender role for user: %', lender_record.user_id;
  END LOOP;
END $$;

-- Also ensure admin and borrower roles exist for users who have those records
DO $$
DECLARE
  user_record RECORD;
BEGIN
  -- Ensure admin roles
  FOR user_record IN
    SELECT DISTINCT user_id
    FROM public.profiles
    WHERE app_role = 'admin'
  LOOP
    INSERT INTO public.user_roles (user_id, role)
    VALUES (user_record.user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;

  -- Ensure borrower roles
  FOR user_record IN
    SELECT DISTINCT user_id
    FROM public.borrower_user_links
  LOOP
    INSERT INTO public.user_roles (user_id, role)
    VALUES (user_record.user_id, 'borrower')
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;
END $$;
