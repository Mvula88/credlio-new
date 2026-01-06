-- Fix admin_activate_subscription and admin_deactivate_subscription to use user_roles table
-- They were checking the old deprecated app_role column

-- ============================================
-- 1. Fix admin_activate_subscription
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

  -- Verify caller is an admin (using user_roles table for multi-role support)
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_admin_id AND role = 'admin'
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

-- ============================================
-- 2. Fix admin_deactivate_subscription
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

  -- Verify caller is an admin (using user_roles table for multi-role support)
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_admin_id AND role = 'admin'
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

COMMENT ON FUNCTION public.admin_activate_subscription IS 'Manually activate a subscription for a Namibian lender - uses user_roles table for multi-role support';
COMMENT ON FUNCTION public.admin_deactivate_subscription IS 'Deactivate a manually activated subscription - uses user_roles table for multi-role support';
