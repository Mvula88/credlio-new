-- Manual Subscription Activation for Namibia
-- Allows admin to manually activate subscriptions for lenders who pay via cash or e-wallet
-- This is specific to Namibia where alternative payment methods are common

-- ============================================
-- 1. Add payment method tracking to subscriptions
-- ============================================
DO $$
BEGIN
  -- Add payment_method column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE public.subscriptions
    ADD COLUMN payment_method TEXT DEFAULT 'stripe' CHECK (payment_method IN ('stripe', 'cash', 'ewallet', 'bank_transfer'));
  END IF;

  -- Add manually_activated_by column to track which admin activated
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'manually_activated_by'
  ) THEN
    ALTER TABLE public.subscriptions
    ADD COLUMN manually_activated_by UUID REFERENCES auth.users(id);
  END IF;

  -- Add manual_payment_reference for tracking cash/ewallet payments
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'manual_payment_reference'
  ) THEN
    ALTER TABLE public.subscriptions
    ADD COLUMN manual_payment_reference TEXT;
  END IF;

  -- Add notes for manual activations
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'manual_notes'
  ) THEN
    ALTER TABLE public.subscriptions
    ADD COLUMN manual_notes TEXT;
  END IF;
END $$;

-- ============================================
-- 2. Create manual activation audit table
-- ============================================
CREATE TABLE IF NOT EXISTS public.manual_subscription_activations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lender_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activated_by UUID NOT NULL REFERENCES auth.users(id),
  tier TEXT NOT NULL CHECK (tier IN ('PRO', 'BUSINESS')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'ewallet', 'bank_transfer')),
  payment_reference TEXT,
  amount_paid DECIMAL(10,2),
  currency TEXT DEFAULT 'NAD',
  duration_months INTEGER NOT NULL DEFAULT 1,
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date TIMESTAMPTZ NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_manual_activations_lender
ON public.manual_subscription_activations(lender_user_id);

CREATE INDEX IF NOT EXISTS idx_manual_activations_date
ON public.manual_subscription_activations(created_at DESC);

-- Enable RLS
ALTER TABLE public.manual_subscription_activations ENABLE ROW LEVEL SECURITY;

-- Only admins can view and manage manual activations
CREATE POLICY "Admins can manage manual activations" ON public.manual_subscription_activations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND app_role = 'admin'
    )
  );

-- ============================================
-- 3. Function to manually activate subscription (Namibia only)
-- ============================================
CREATE OR REPLACE FUNCTION public.admin_activate_subscription(
  p_lender_user_id UUID,
  p_tier TEXT,
  p_payment_method TEXT,
  p_payment_reference TEXT DEFAULT NULL,
  p_amount_paid DECIMAL DEFAULT NULL,
  p_duration_months INTEGER DEFAULT 1,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id UUID;
  v_lender_country TEXT;
  v_start_date TIMESTAMPTZ;
  v_end_date TIMESTAMPTZ;
  v_activation_id UUID;
BEGIN
  -- Get admin user ID
  v_admin_id := auth.uid();

  -- Verify caller is an admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = v_admin_id AND app_role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can manually activate subscriptions';
  END IF;

  -- Get lender's country
  SELECT country INTO v_lender_country
  FROM public.lenders
  WHERE user_id = p_lender_user_id;

  -- Verify lender is from Namibia (NA)
  IF v_lender_country IS NULL OR v_lender_country != 'NA' THEN
    RAISE EXCEPTION 'Manual activation is only available for Namibian lenders. Lender country: %', COALESCE(v_lender_country, 'not found');
  END IF;

  -- Validate tier
  IF p_tier NOT IN ('PRO', 'BUSINESS') THEN
    RAISE EXCEPTION 'Invalid tier. Must be PRO or BUSINESS';
  END IF;

  -- Validate payment method
  IF p_payment_method NOT IN ('cash', 'ewallet', 'bank_transfer') THEN
    RAISE EXCEPTION 'Invalid payment method. Must be cash, ewallet, or bank_transfer';
  END IF;

  -- Calculate dates
  v_start_date := NOW();
  v_end_date := NOW() + (p_duration_months || ' months')::INTERVAL;

  -- Create or update subscription
  INSERT INTO public.subscriptions (
    user_id,
    tier,
    payment_method,
    manually_activated_by,
    manual_payment_reference,
    manual_notes,
    current_period_start,
    current_period_end,
    status,
    created_at,
    updated_at
  ) VALUES (
    p_lender_user_id,
    p_tier::sub_tier,
    p_payment_method,
    v_admin_id,
    p_payment_reference,
    p_notes,
    v_start_date,
    v_end_date,
    'active',
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    tier = p_tier::sub_tier,
    payment_method = p_payment_method,
    manually_activated_by = v_admin_id,
    manual_payment_reference = p_payment_reference,
    manual_notes = p_notes,
    current_period_start = v_start_date,
    current_period_end = v_end_date,
    status = 'active',
    updated_at = NOW();

  -- Log the activation
  INSERT INTO public.manual_subscription_activations (
    lender_user_id,
    activated_by,
    tier,
    payment_method,
    payment_reference,
    amount_paid,
    currency,
    duration_months,
    start_date,
    end_date,
    notes
  ) VALUES (
    p_lender_user_id,
    v_admin_id,
    p_tier,
    p_payment_method,
    p_payment_reference,
    p_amount_paid,
    'NAD',
    p_duration_months,
    v_start_date,
    v_end_date,
    p_notes
  ) RETURNING id INTO v_activation_id;

  -- Log to audit ledger
  INSERT INTO public.audit_ledger (
    actor_id,
    action,
    target_type,
    target_id,
    payload,
    created_at
  ) VALUES (
    v_admin_id,
    'manual_subscription_activation',
    'subscription',
    p_lender_user_id,
    jsonb_build_object(
      'tier', p_tier,
      'payment_method', p_payment_method,
      'payment_reference', p_payment_reference,
      'amount_paid', p_amount_paid,
      'duration_months', p_duration_months,
      'end_date', v_end_date
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'activation_id', v_activation_id,
    'tier', p_tier,
    'start_date', v_start_date,
    'end_date', v_end_date,
    'message', 'Subscription activated successfully'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_activate_subscription(UUID, TEXT, TEXT, TEXT, DECIMAL, INTEGER, TEXT) TO authenticated;

-- ============================================
-- 4. Function to get Namibian lenders for admin
-- ============================================
CREATE OR REPLACE FUNCTION public.admin_get_namibian_lenders()
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  business_name TEXT,
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
  -- Verify caller is an admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid() AND app_role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can access this function';
  END IF;

  RETURN QUERY
  SELECT
    l.user_id,
    p.full_name,
    u.email,
    l.phone,
    l.business_name,
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

GRANT EXECUTE ON FUNCTION public.admin_get_namibian_lenders() TO authenticated;

-- ============================================
-- 5. Function to deactivate manual subscription
-- ============================================
CREATE OR REPLACE FUNCTION public.admin_deactivate_subscription(
  p_lender_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id UUID;
  v_lender_country TEXT;
BEGIN
  v_admin_id := auth.uid();

  -- Verify caller is an admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = v_admin_id AND app_role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can deactivate subscriptions';
  END IF;

  -- Get lender's country
  SELECT country INTO v_lender_country
  FROM public.lenders
  WHERE user_id = p_lender_user_id;

  -- Verify lender is from Namibia
  IF v_lender_country IS NULL OR v_lender_country != 'NA' THEN
    RAISE EXCEPTION 'Manual deactivation is only available for Namibian lenders';
  END IF;

  -- Update subscription to inactive
  UPDATE public.subscriptions
  SET
    status = 'cancelled',
    manual_notes = COALESCE(manual_notes || E'\n', '') || 'Deactivated: ' || COALESCE(p_reason, 'No reason provided'),
    updated_at = NOW()
  WHERE user_id = p_lender_user_id;

  -- Log to audit
  INSERT INTO public.audit_ledger (
    actor_id,
    action,
    target_type,
    target_id,
    payload,
    created_at
  ) VALUES (
    v_admin_id,
    'manual_subscription_deactivation',
    'subscription',
    p_lender_user_id,
    jsonb_build_object('reason', p_reason),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Subscription deactivated successfully'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_deactivate_subscription(UUID, TEXT) TO authenticated;

-- ============================================
-- 6. Comments
-- ============================================
COMMENT ON TABLE public.manual_subscription_activations IS 'Audit log of manual subscription activations for Namibian lenders paying via cash/ewallet';
COMMENT ON FUNCTION public.admin_activate_subscription IS 'Manually activate a subscription for a Namibian lender (cash/ewallet payment)';
COMMENT ON FUNCTION public.admin_get_namibian_lenders IS 'Get all Namibian lenders with their subscription status';
COMMENT ON FUNCTION public.admin_deactivate_subscription IS 'Deactivate a manually activated subscription';
