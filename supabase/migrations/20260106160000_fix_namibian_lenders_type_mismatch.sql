-- Fix type mismatch in admin_get_namibian_lenders
-- auth.users.email is VARCHAR(255) but function expects TEXT
-- Also cast other VARCHAR fields to TEXT for consistency

DROP FUNCTION IF EXISTS public.admin_get_namibian_lenders();

CREATE OR REPLACE FUNCTION public.admin_get_namibian_lenders()
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  business_name TEXT,
  id_number TEXT,
  current_tier TEXT,
  subscription_status TEXT,
  subscription_end_date TIMESTAMPTZ,
  payment_method TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Allow service_role OR users with admin role (using user_roles table)
  IF NOT (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
    )
  ) THEN
    RAISE EXCEPTION 'Only admins can access this function';
  END IF;

  RETURN QUERY
  SELECT
    l.user_id,
    p.full_name::TEXT,
    u.email::TEXT,  -- Cast VARCHAR(255) to TEXT
    l.contact_number::TEXT as phone,
    l.business_name::TEXT,
    l.id_number::TEXT,
    COALESCE(UPPER(s.tier::TEXT), 'FREE')::TEXT as current_tier,
    COALESCE(s.status::TEXT, 'none')::TEXT as subscription_status,
    s.current_period_end as subscription_end_date,
    COALESCE(s.payment_method::TEXT, NULL) as payment_method,
    l.created_at
  FROM public.lenders l
  JOIN public.profiles p ON p.user_id = l.user_id
  JOIN auth.users u ON u.id = l.user_id
  LEFT JOIN public.subscriptions s ON s.user_id = l.user_id
  WHERE l.country = 'NA'
  ORDER BY l.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.admin_get_namibian_lenders IS 'Get all Namibian lenders with their subscription status - uses user_roles table for multi-role support';
