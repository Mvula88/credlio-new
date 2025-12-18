-- Outbound Webhooks System
-- Allow lenders to receive webhook notifications for events

-- ============================================================================
-- 1. CREATE WEBHOOK ENDPOINTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  -- Secret for signing payloads (HMAC-SHA256)
  secret TEXT NOT NULL,
  -- Events to subscribe to
  events TEXT[] NOT NULL DEFAULT '{}',
  -- Headers to include
  custom_headers JSONB DEFAULT '{}',
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  -- Stats
  total_deliveries INTEGER DEFAULT 0,
  successful_deliveries INTEGER DEFAULT 0,
  failed_deliveries INTEGER DEFAULT 0,
  last_delivery_at TIMESTAMPTZ,
  last_error TEXT,
  -- Rate limiting (max deliveries per hour)
  rate_limit_per_hour INTEGER DEFAULT 100,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own webhooks" ON public.webhook_endpoints
  FOR ALL TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all webhooks" ON public.webhook_endpoints
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );


-- ============================================================================
-- 2. CREATE WEBHOOK DELIVERIES TABLE (LOG OF ALL ATTEMPTS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  endpoint_id UUID NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  -- Event details
  event_type TEXT NOT NULL,
  event_id UUID NOT NULL,  -- ID of the triggering record
  payload JSONB NOT NULL,
  -- Delivery attempt
  attempt_number INTEGER NOT NULL DEFAULT 1,
  -- Response
  response_status INTEGER,
  response_body TEXT,
  response_time_ms INTEGER,
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed', 'retrying')),
  error_message TEXT,
  -- Next retry
  next_retry_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their webhook deliveries" ON public.webhook_deliveries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.webhook_endpoints we
      WHERE we.id = webhook_deliveries.endpoint_id AND we.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all deliveries" ON public.webhook_deliveries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint ON public.webhook_deliveries(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON public.webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry ON public.webhook_deliveries(next_retry_at) WHERE status = 'retrying';


-- ============================================================================
-- 3. AVAILABLE WEBHOOK EVENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.webhook_event_types (
  event_type TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  payload_example JSONB,
  is_active BOOLEAN DEFAULT TRUE
);

-- Insert available events
INSERT INTO public.webhook_event_types (event_type, description, payload_example) VALUES
  ('loan.created', 'A new loan has been created', '{"loan_id": "uuid", "borrower_name": "John Doe", "principal": 1000, "currency": "KES"}'),
  ('loan.approved', 'A loan has been approved by borrower', '{"loan_id": "uuid", "status": "approved"}'),
  ('loan.disbursed', 'Loan funds have been disbursed', '{"loan_id": "uuid", "amount": 1000}'),
  ('loan.completed', 'A loan has been fully repaid', '{"loan_id": "uuid", "total_repaid": 1150}'),
  ('loan.defaulted', 'A loan has been marked as defaulted', '{"loan_id": "uuid", "days_overdue": 90}'),
  ('payment.received', 'A payment has been received', '{"loan_id": "uuid", "amount": 100, "remaining": 900}'),
  ('payment.overdue', 'A payment is overdue', '{"loan_id": "uuid", "schedule_id": "uuid", "days_overdue": 7}'),
  ('late_fee.applied', 'A late fee has been applied', '{"loan_id": "uuid", "fee_amount": 50, "tier": 1}'),
  ('borrower.created', 'A new borrower has been registered', '{"borrower_id": "uuid", "name": "John Doe"}'),
  ('collateral.seized', 'Collateral has been seized', '{"collateral_id": "uuid", "loan_id": "uuid"}'),
  ('restructure.requested', 'A loan restructure has been requested', '{"restructure_id": "uuid", "loan_id": "uuid"}'),
  ('restructure.approved', 'A loan restructure has been approved', '{"restructure_id": "uuid", "new_term": 12}')
ON CONFLICT (event_type) DO NOTHING;


-- ============================================================================
-- 4. FUNCTION TO CREATE WEBHOOK ENDPOINT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_webhook_endpoint(
  p_name TEXT,
  p_url TEXT,
  p_events TEXT[]
)
RETURNS JSON AS $$
DECLARE
  v_secret TEXT;
  v_endpoint_id UUID;
BEGIN
  -- Generate a secret
  v_secret := 'whsec_' || encode(gen_random_bytes(32), 'hex');

  -- Insert endpoint
  INSERT INTO public.webhook_endpoints (user_id, name, url, secret, events)
  VALUES (auth.uid(), p_name, p_url, v_secret, p_events)
  RETURNING id INTO v_endpoint_id;

  RETURN json_build_object(
    'success', TRUE,
    'endpoint_id', v_endpoint_id,
    'secret', v_secret,
    'warning', 'Store this secret securely. It will not be shown again.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 5. FUNCTION TO QUEUE WEBHOOK DELIVERY
-- ============================================================================

CREATE OR REPLACE FUNCTION public.queue_webhook_event(
  p_event_type TEXT,
  p_event_id UUID,
  p_payload JSONB,
  p_user_id UUID DEFAULT NULL  -- Specific user, or NULL for all subscribed
)
RETURNS INTEGER AS $$
DECLARE
  v_endpoint RECORD;
  v_count INTEGER := 0;
BEGIN
  -- Find all active endpoints subscribed to this event
  FOR v_endpoint IN
    SELECT *
    FROM public.webhook_endpoints
    WHERE is_active = TRUE
    AND p_event_type = ANY(events)
    AND (p_user_id IS NULL OR user_id = p_user_id)
  LOOP
    -- Queue delivery
    INSERT INTO public.webhook_deliveries (
      endpoint_id, event_type, event_id, payload
    ) VALUES (
      v_endpoint.id, p_event_type, p_event_id, p_payload
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 6. FUNCTION TO UPDATE DELIVERY STATUS (CALLED BY WEBHOOK PROCESSOR)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_webhook_delivery(
  p_delivery_id UUID,
  p_status TEXT,
  p_response_status INTEGER DEFAULT NULL,
  p_response_body TEXT DEFAULT NULL,
  p_response_time_ms INTEGER DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_delivery RECORD;
  v_endpoint_id UUID;
BEGIN
  -- Get delivery
  SELECT * INTO v_delivery
  FROM public.webhook_deliveries
  WHERE id = p_delivery_id;

  IF v_delivery IS NULL THEN
    RETURN FALSE;
  END IF;

  v_endpoint_id := v_delivery.endpoint_id;

  -- Update delivery
  UPDATE public.webhook_deliveries
  SET
    status = p_status,
    response_status = p_response_status,
    response_body = LEFT(p_response_body, 5000),  -- Limit response body size
    response_time_ms = p_response_time_ms,
    error_message = p_error_message,
    delivered_at = CASE WHEN p_status = 'delivered' THEN NOW() ELSE NULL END,
    next_retry_at = CASE
      WHEN p_status = 'retrying' THEN NOW() + (POWER(2, v_delivery.attempt_number) * INTERVAL '1 minute')
      ELSE NULL
    END,
    attempt_number = CASE WHEN p_status = 'retrying' THEN v_delivery.attempt_number + 1 ELSE v_delivery.attempt_number END
  WHERE id = p_delivery_id;

  -- Update endpoint stats
  UPDATE public.webhook_endpoints
  SET
    total_deliveries = total_deliveries + 1,
    successful_deliveries = CASE WHEN p_status = 'delivered' THEN successful_deliveries + 1 ELSE successful_deliveries END,
    failed_deliveries = CASE WHEN p_status = 'failed' THEN failed_deliveries + 1 ELSE failed_deliveries END,
    last_delivery_at = NOW(),
    last_error = CASE WHEN p_status = 'failed' THEN p_error_message ELSE last_error END,
    updated_at = NOW()
  WHERE id = v_endpoint_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 7. FUNCTION TO GET PENDING WEBHOOKS (FOR PROCESSOR)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_pending_webhooks(p_limit INTEGER DEFAULT 100)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_to_json(d))
    FROM (
      SELECT
        wd.id as delivery_id,
        wd.event_type,
        wd.event_id,
        wd.payload,
        wd.attempt_number,
        we.url,
        we.secret,
        we.custom_headers
      FROM public.webhook_deliveries wd
      JOIN public.webhook_endpoints we ON we.id = wd.endpoint_id
      WHERE (wd.status = 'pending' OR (wd.status = 'retrying' AND wd.next_retry_at <= NOW()))
      AND we.is_active = TRUE
      AND wd.attempt_number <= 5  -- Max 5 retries
      ORDER BY wd.created_at ASC
      LIMIT p_limit
    ) d
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 8. FUNCTION TO TEST WEBHOOK ENDPOINT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.test_webhook_endpoint(p_endpoint_id UUID)
RETURNS JSON AS $$
DECLARE
  v_endpoint RECORD;
BEGIN
  -- Get endpoint
  SELECT * INTO v_endpoint
  FROM public.webhook_endpoints
  WHERE id = p_endpoint_id AND user_id = auth.uid();

  IF v_endpoint IS NULL THEN
    RETURN json_build_object('error', 'Endpoint not found');
  END IF;

  -- Queue a test event
  INSERT INTO public.webhook_deliveries (
    endpoint_id, event_type, event_id, payload
  ) VALUES (
    p_endpoint_id,
    'test.ping',
    gen_random_uuid(),
    json_build_object(
      'event', 'test.ping',
      'message', 'This is a test webhook from Credlio',
      'timestamp', NOW()
    )
  );

  RETURN json_build_object(
    'success', TRUE,
    'message', 'Test webhook queued for delivery'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 9. FUNCTION TO GET WEBHOOK DELIVERY HISTORY
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_webhook_delivery_history(
  p_endpoint_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_to_json(d))
    FROM (
      SELECT
        wd.id,
        wd.event_type,
        wd.event_id,
        wd.status,
        wd.attempt_number,
        wd.response_status,
        wd.response_time_ms,
        wd.error_message,
        wd.created_at,
        wd.delivered_at,
        we.name as endpoint_name,
        we.url as endpoint_url
      FROM public.webhook_deliveries wd
      JOIN public.webhook_endpoints we ON we.id = wd.endpoint_id
      WHERE we.user_id = auth.uid()
      AND (p_endpoint_id IS NULL OR wd.endpoint_id = p_endpoint_id)
      AND (p_status IS NULL OR wd.status = p_status)
      ORDER BY wd.created_at DESC
      LIMIT p_limit
    ) d
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 10. TRIGGERS TO AUTO-QUEUE WEBHOOKS ON EVENTS
-- ============================================================================

-- Loan status change trigger
CREATE OR REPLACE FUNCTION public.trigger_loan_webhook()
RETURNS TRIGGER AS $$
DECLARE
  v_event_type TEXT;
  v_payload JSONB;
BEGIN
  -- Determine event type based on status change
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'loan.created';
  ELSIF NEW.status != OLD.status THEN
    v_event_type := CASE NEW.status
      WHEN 'active' THEN 'loan.disbursed'
      WHEN 'completed' THEN 'loan.completed'
      WHEN 'defaulted' THEN 'loan.defaulted'
      ELSE NULL
    END;
  END IF;

  IF v_event_type IS NOT NULL THEN
    -- Build payload
    v_payload := json_build_object(
      'loan_id', NEW.id,
      'status', NEW.status,
      'principal', NEW.principal_minor / 100.0,
      'currency', NEW.currency,
      'borrower_id', NEW.borrower_id,
      'timestamp', NOW()
    );

    -- Queue for the lender
    PERFORM public.queue_webhook_event(v_event_type, NEW.id, v_payload, NEW.lender_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_loan_webhook ON public.loans;
CREATE TRIGGER trigger_loan_webhook
  AFTER INSERT OR UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.trigger_loan_webhook();


-- Payment received trigger (on repayment schedule update)
CREATE OR REPLACE FUNCTION public.trigger_payment_webhook()
RETURNS TRIGGER AS $$
DECLARE
  v_loan RECORD;
  v_payload JSONB;
BEGIN
  -- Check if status changed to paid
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
    -- Get loan info
    SELECT * INTO v_loan FROM public.loans WHERE id = NEW.loan_id;

    v_payload := json_build_object(
      'loan_id', NEW.loan_id,
      'schedule_id', NEW.id,
      'installment_no', NEW.installment_no,
      'amount_paid', COALESCE(NEW.paid_amount_minor, NEW.amount_due_minor) / 100.0,
      'is_early_payment', COALESCE(NEW.is_early_payment, FALSE),
      'timestamp', NOW()
    );

    PERFORM public.queue_webhook_event('payment.received', NEW.id, v_payload, v_loan.lender_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_payment_webhook ON public.repayment_schedules;
CREATE TRIGGER trigger_payment_webhook
  AFTER UPDATE ON public.repayment_schedules
  FOR EACH ROW EXECUTE FUNCTION public.trigger_payment_webhook();


-- Grant permissions
GRANT EXECUTE ON FUNCTION public.create_webhook_endpoint(TEXT, TEXT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.queue_webhook_event(TEXT, UUID, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_webhook_delivery(UUID, TEXT, INTEGER, TEXT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_webhooks(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.test_webhook_endpoint(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_webhook_delivery_history(UUID, TEXT, INTEGER) TO authenticated;


-- Log migration
DO $$
BEGIN
  RAISE NOTICE 'Outbound webhooks system created';
  RAISE NOTICE 'Features: Webhook endpoints, event subscriptions, delivery tracking, auto-triggers';
END $$;
