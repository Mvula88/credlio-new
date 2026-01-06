-- Fix admin_get_namibian_lenders to allow service_role access
-- Service role is needed for server-side API calls

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
  -- Allow service_role OR admin users
  -- Service role is used by API routes, admin users call from frontend
  IF NOT (
    -- Check if service_role (for API calls)
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    OR
    -- Check if authenticated admin user (for frontend calls)
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid() AND app_role = 'admin'
    )
  ) THEN
    RAISE EXCEPTION 'Only admins can access this function';
  END IF;

  RETURN QUERY
  SELECT
    l.user_id,
    p.full_name,
    u.email,
    l.contact_number as phone,
    l.business_name,
    l.id_number,
    COALESCE(UPPER(s.tier::TEXT), 'FREE') as current_tier,
    COALESCE(s.status, 'none') as subscription_status,
    s.current_period_end as subscription_end_date,
    s.payment_method,
    l.created_at
  FROM public.lenders l
  JOIN public.profiles p ON p.user_id = l.user_id
  JOIN auth.users u ON u.id = l.user_id
  LEFT JOIN public.subscriptions s ON s.user_id = l.user_id
  WHERE l.country = 'NA'
  ORDER BY l.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.admin_get_namibian_lenders IS 'Get all Namibian lenders with their subscription status - allows service_role and admin access';
