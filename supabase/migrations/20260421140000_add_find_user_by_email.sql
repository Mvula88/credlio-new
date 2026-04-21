-- Add find_user_by_email RPC for efficient auth.users lookup by email
--
-- The registration routes (register-borrower, register-lender) previously
-- called supabase.auth.admin.listUsers() and filtered client-side, which
-- scans every auth user on every signup attempt and breaks past a few
-- thousand users.
--
-- This function does an indexed lookup against auth.users.email (Supabase
-- stores emails lowercased by default, and there is a unique index on that
-- column) and returns the user id or NULL.
--
-- Security model:
--   - SECURITY DEFINER so the function can read the auth schema.
--   - Execute is granted only to service_role. Registration routes already
--     use the service-role client for their admin workflow, so no behavior
--     change — just a faster lookup path.

CREATE OR REPLACE FUNCTION public.find_user_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
  SELECT id
  FROM auth.users
  WHERE email = lower(p_email)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_user_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_user_by_email(text) TO service_role;
