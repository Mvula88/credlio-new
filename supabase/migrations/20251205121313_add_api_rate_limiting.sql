-- API Rate Limiting System
-- Track API usage and enforce rate limits

-- ============================================================================
-- 1. CREATE API KEYS TABLE (FOR FUTURE 3RD PARTY INTEGRATIONS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- Friendly name for the key
  key_hash TEXT NOT NULL UNIQUE,         -- SHA-256 hash of the API key
  key_prefix TEXT NOT NULL,              -- First 8 chars for identification (e.g., "cr_live_")
  permissions TEXT[] DEFAULT '{}',        -- Array of allowed operations
  -- Rate limits
  rate_limit_per_minute INTEGER DEFAULT 60,
  rate_limit_per_hour INTEGER DEFAULT 1000,
  rate_limit_per_day INTEGER DEFAULT 10000,
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  -- IP restrictions (optional)
  allowed_ips TEXT[],                    -- If set, only these IPs can use the key
  -- Timestamps
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own API keys" ON public.api_keys
  FOR ALL TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all API keys" ON public.api_keys
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );


-- ============================================================================
-- 2. CREATE RATE LIMIT TRACKING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rate_limit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Identifier (can be user_id, api_key_id, or IP hash)
  identifier_type TEXT NOT NULL CHECK (identifier_type IN ('user', 'api_key', 'ip')),
  identifier TEXT NOT NULL,
  -- Endpoint/action being rate limited
  endpoint TEXT NOT NULL,
  -- Time window
  window_start TIMESTAMPTZ NOT NULL,
  window_type TEXT NOT NULL CHECK (window_type IN ('minute', 'hour', 'day')),
  -- Count
  request_count INTEGER NOT NULL DEFAULT 1,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_rate_limit_identifier ON public.rate_limit_logs(identifier, endpoint, window_start);
CREATE INDEX IF NOT EXISTS idx_rate_limit_cleanup ON public.rate_limit_logs(window_start);

-- Enable RLS (only system can access)
ALTER TABLE public.rate_limit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view rate limit logs
CREATE POLICY "Admins can view rate limit logs" ON public.rate_limit_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );


-- ============================================================================
-- 3. CREATE RATE LIMIT CONFIGURATION TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rate_limit_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  endpoint_pattern TEXT NOT NULL UNIQUE,  -- Pattern like '/api/loans/*' or '*'
  -- Limits per window
  limit_per_minute INTEGER DEFAULT 30,
  limit_per_hour INTEGER DEFAULT 500,
  limit_per_day INTEGER DEFAULT 5000,
  -- Burst allowance (temporary spike)
  burst_limit INTEGER DEFAULT 10,
  -- Penalty for hitting limit (block for X seconds)
  penalty_seconds INTEGER DEFAULT 60,
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.rate_limit_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage rate limit configs" ON public.rate_limit_configs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- Insert default rate limit configs
INSERT INTO public.rate_limit_configs (endpoint_pattern, limit_per_minute, limit_per_hour, limit_per_day) VALUES
  ('*', 60, 1000, 10000),                           -- Default global limit
  ('/api/auth/*', 10, 50, 200),                     -- Auth endpoints (stricter)
  ('/api/loans/create', 5, 20, 100),                -- Loan creation (very strict)
  ('/api/notifications/*', 30, 300, 3000),          -- Notifications
  ('/api/export/*', 5, 20, 50)                      -- Export endpoints (expensive)
ON CONFLICT (endpoint_pattern) DO NOTHING;


-- ============================================================================
-- 4. FUNCTION TO CHECK RATE LIMIT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_identifier TEXT,
  p_identifier_type TEXT,
  p_endpoint TEXT
)
RETURNS JSON AS $$
DECLARE
  v_config RECORD;
  v_minute_count INTEGER;
  v_hour_count INTEGER;
  v_day_count INTEGER;
  v_minute_start TIMESTAMPTZ;
  v_hour_start TIMESTAMPTZ;
  v_day_start TIMESTAMPTZ;
  v_is_limited BOOLEAN := FALSE;
  v_retry_after INTEGER := 0;
BEGIN
  -- Get rate limit config for this endpoint
  SELECT * INTO v_config
  FROM public.rate_limit_configs
  WHERE is_active = TRUE
  AND (endpoint_pattern = p_endpoint OR endpoint_pattern = '*')
  ORDER BY CASE WHEN endpoint_pattern = '*' THEN 1 ELSE 0 END
  LIMIT 1;

  -- Use defaults if no config
  IF v_config IS NULL THEN
    v_config.limit_per_minute := 60;
    v_config.limit_per_hour := 1000;
    v_config.limit_per_day := 10000;
    v_config.penalty_seconds := 60;
  END IF;

  -- Calculate window starts
  v_minute_start := DATE_TRUNC('minute', NOW());
  v_hour_start := DATE_TRUNC('hour', NOW());
  v_day_start := DATE_TRUNC('day', NOW());

  -- Get current counts
  SELECT COALESCE(SUM(request_count), 0) INTO v_minute_count
  FROM public.rate_limit_logs
  WHERE identifier = p_identifier AND endpoint = p_endpoint
  AND window_type = 'minute' AND window_start = v_minute_start;

  SELECT COALESCE(SUM(request_count), 0) INTO v_hour_count
  FROM public.rate_limit_logs
  WHERE identifier = p_identifier AND endpoint = p_endpoint
  AND window_type = 'hour' AND window_start = v_hour_start;

  SELECT COALESCE(SUM(request_count), 0) INTO v_day_count
  FROM public.rate_limit_logs
  WHERE identifier = p_identifier AND endpoint = p_endpoint
  AND window_type = 'day' AND window_start = v_day_start;

  -- Check if rate limited
  IF v_minute_count >= v_config.limit_per_minute THEN
    v_is_limited := TRUE;
    v_retry_after := 60 - EXTRACT(SECOND FROM NOW())::INTEGER;
  ELSIF v_hour_count >= v_config.limit_per_hour THEN
    v_is_limited := TRUE;
    v_retry_after := 3600 - EXTRACT(EPOCH FROM NOW() - v_hour_start)::INTEGER;
  ELSIF v_day_count >= v_config.limit_per_day THEN
    v_is_limited := TRUE;
    v_retry_after := 86400 - EXTRACT(EPOCH FROM NOW() - v_day_start)::INTEGER;
  END IF;

  -- If not limited, increment counters
  IF NOT v_is_limited THEN
    -- Upsert minute counter
    INSERT INTO public.rate_limit_logs (identifier, identifier_type, endpoint, window_start, window_type, request_count)
    VALUES (p_identifier, p_identifier_type, p_endpoint, v_minute_start, 'minute', 1)
    ON CONFLICT (identifier, endpoint, window_start) WHERE window_type = 'minute'
    DO UPDATE SET request_count = rate_limit_logs.request_count + 1, updated_at = NOW();

    -- Upsert hour counter
    INSERT INTO public.rate_limit_logs (identifier, identifier_type, endpoint, window_start, window_type, request_count)
    VALUES (p_identifier, p_identifier_type, p_endpoint, v_hour_start, 'hour', 1)
    ON CONFLICT (identifier, endpoint, window_start) WHERE window_type = 'hour'
    DO UPDATE SET request_count = rate_limit_logs.request_count + 1, updated_at = NOW();

    -- Upsert day counter
    INSERT INTO public.rate_limit_logs (identifier, identifier_type, endpoint, window_start, window_type, request_count)
    VALUES (p_identifier, p_identifier_type, p_endpoint, v_day_start, 'day', 1)
    ON CONFLICT (identifier, endpoint, window_start) WHERE window_type = 'day'
    DO UPDATE SET request_count = rate_limit_logs.request_count + 1, updated_at = NOW();
  END IF;

  RETURN json_build_object(
    'allowed', NOT v_is_limited,
    'retry_after', v_retry_after,
    'limits', json_build_object(
      'minute', json_build_object('used', v_minute_count, 'limit', v_config.limit_per_minute),
      'hour', json_build_object('used', v_hour_count, 'limit', v_config.limit_per_hour),
      'day', json_build_object('used', v_day_count, 'limit', v_config.limit_per_day)
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 5. FUNCTION TO GENERATE API KEY
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_api_key(
  p_name TEXT,
  p_permissions TEXT[] DEFAULT '{}',
  p_rate_limit_per_minute INTEGER DEFAULT 60
)
RETURNS JSON AS $$
DECLARE
  v_raw_key TEXT;
  v_key_hash TEXT;
  v_key_prefix TEXT;
  v_api_key_id UUID;
BEGIN
  -- Generate a random key
  v_raw_key := 'cr_live_' || encode(gen_random_bytes(32), 'hex');
  v_key_prefix := LEFT(v_raw_key, 16);
  v_key_hash := encode(digest(v_raw_key, 'sha256'), 'hex');

  -- Insert the key
  INSERT INTO public.api_keys (
    user_id, name, key_hash, key_prefix, permissions, rate_limit_per_minute
  ) VALUES (
    auth.uid(), p_name, v_key_hash, v_key_prefix, p_permissions, p_rate_limit_per_minute
  )
  RETURNING id INTO v_api_key_id;

  -- Return the raw key (only shown once!)
  RETURN json_build_object(
    'success', TRUE,
    'api_key_id', v_api_key_id,
    'api_key', v_raw_key,
    'warning', 'Store this key securely. It will not be shown again.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 6. FUNCTION TO VALIDATE API KEY
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_api_key(p_api_key TEXT)
RETURNS JSON AS $$
DECLARE
  v_key_hash TEXT;
  v_api_key RECORD;
BEGIN
  -- Hash the provided key
  v_key_hash := encode(digest(p_api_key, 'sha256'), 'hex');

  -- Look up the key
  SELECT * INTO v_api_key
  FROM public.api_keys
  WHERE key_hash = v_key_hash;

  IF v_api_key IS NULL THEN
    RETURN json_build_object('valid', FALSE, 'error', 'Invalid API key');
  END IF;

  IF NOT v_api_key.is_active THEN
    RETURN json_build_object('valid', FALSE, 'error', 'API key is disabled');
  END IF;

  IF v_api_key.expires_at IS NOT NULL AND v_api_key.expires_at < NOW() THEN
    RETURN json_build_object('valid', FALSE, 'error', 'API key has expired');
  END IF;

  -- Update last used
  UPDATE public.api_keys
  SET last_used_at = NOW()
  WHERE id = v_api_key.id;

  RETURN json_build_object(
    'valid', TRUE,
    'user_id', v_api_key.user_id,
    'permissions', v_api_key.permissions,
    'rate_limit_per_minute', v_api_key.rate_limit_per_minute
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 7. FUNCTION TO REVOKE API KEY
-- ============================================================================

CREATE OR REPLACE FUNCTION public.revoke_api_key(p_api_key_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.api_keys
  SET is_active = FALSE, updated_at = NOW()
  WHERE id = p_api_key_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'API key not found or not authorized';
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 8. CLEANUP OLD RATE LIMIT LOGS (RUN PERIODICALLY)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_logs()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  -- Delete logs older than 7 days
  DELETE FROM public.rate_limit_logs
  WHERE window_start < NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Grant permissions
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_api_key(TEXT, TEXT[], INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_api_key(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_api_key(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limit_logs() TO authenticated;


-- Log migration
DO $$
BEGIN
  RAISE NOTICE 'API rate limiting system created';
  RAISE NOTICE 'Features: API key generation, rate limit checking, configurable limits per endpoint';
END $$;
