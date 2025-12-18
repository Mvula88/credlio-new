-- Complete Audit Logging System
-- Comprehensive tracking of all important actions

-- ============================================================================
-- 1. ENHANCE AUDIT_LOGS TABLE (IF EXISTS) OR CREATE IT
-- ============================================================================

-- Check if audit_logs exists and add missing columns
DO $$
BEGIN
  -- Create table if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs' AND table_schema = 'public') THEN
    CREATE TABLE public.audit_logs (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      -- Actor info
      actor_id UUID REFERENCES auth.users(id),
      actor_role TEXT,
      actor_ip_hash TEXT,
      actor_user_agent TEXT,
      -- Action info
      action TEXT NOT NULL,
      action_category TEXT NOT NULL,
      -- Target info
      target_type TEXT,
      target_id TEXT,
      -- Data
      old_data JSONB,
      new_data JSONB,
      metadata JSONB,
      -- Chain for tamper detection
      previous_hash TEXT,
      entry_hash TEXT,
      -- Status
      severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
      -- Timestamps
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  END IF;

  -- Add columns if they don't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'action_category') THEN
    ALTER TABLE public.audit_logs ADD COLUMN action_category TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'old_data') THEN
    ALTER TABLE public.audit_logs ADD COLUMN old_data JSONB;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'new_data') THEN
    ALTER TABLE public.audit_logs ADD COLUMN new_data JSONB;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'severity') THEN
    ALTER TABLE public.audit_logs ADD COLUMN severity TEXT DEFAULT 'info';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'entry_hash') THEN
    ALTER TABLE public.audit_logs ADD COLUMN entry_hash TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'previous_hash') THEN
    ALTER TABLE public.audit_logs ADD COLUMN previous_hash TEXT;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- Create indexes for efficient queries (safely)
DO $$
BEGIN
  -- Only create indexes if columns exist
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'actor_id') THEN
    CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'action') THEN
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'action_category') THEN
    CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON public.audit_logs(action_category);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'target_type') THEN
    CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON public.audit_logs(target_type, target_id);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'severity') THEN
    CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON public.audit_logs(severity);
  END IF;
END $$;


-- ============================================================================
-- 2. FUNCTION TO CREATE AUDIT LOG ENTRY
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_audit_log(
  p_action TEXT,
  p_action_category TEXT,
  p_target_type TEXT DEFAULT NULL,
  p_target_id TEXT DEFAULT NULL,
  p_old_data JSONB DEFAULT NULL,
  p_new_data JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_severity TEXT DEFAULT 'info'
)
RETURNS UUID AS $$
DECLARE
  v_actor_id UUID;
  v_actor_role TEXT;
  v_previous_hash TEXT;
  v_entry_hash TEXT;
  v_entry_data TEXT;
  v_audit_id UUID;
BEGIN
  -- Get current user
  v_actor_id := auth.uid();

  -- Get actor's role
  SELECT role INTO v_actor_role
  FROM public.user_roles
  WHERE user_id = v_actor_id
  LIMIT 1;

  -- Get previous entry hash for chain
  SELECT entry_hash INTO v_previous_hash
  FROM public.audit_logs
  ORDER BY created_at DESC
  LIMIT 1;

  -- Generate entry hash
  v_entry_data := COALESCE(v_actor_id::TEXT, '') ||
                  p_action ||
                  COALESCE(p_target_type, '') ||
                  COALESCE(p_target_id, '') ||
                  COALESCE(v_previous_hash, 'genesis') ||
                  NOW()::TEXT;
  v_entry_hash := encode(digest(v_entry_data, 'sha256'), 'hex');

  -- Insert audit log
  INSERT INTO public.audit_logs (
    actor_id, actor_role, action, action_category,
    target_type, target_id, old_data, new_data, metadata,
    previous_hash, entry_hash, severity
  ) VALUES (
    v_actor_id, v_actor_role, p_action, p_action_category,
    p_target_type, p_target_id, p_old_data, p_new_data, p_metadata,
    v_previous_hash, v_entry_hash, p_severity
  )
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 3. AUDIT TRIGGERS FOR CRITICAL TABLES
-- ============================================================================

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
  v_old_data JSONB;
  v_new_data JSONB;
  v_severity TEXT := 'info';
BEGIN
  -- Determine action
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_new_data := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_old_data := to_jsonb(OLD);
    v_severity := 'warning';
  END IF;

  -- Create audit log
  PERFORM public.create_audit_log(
    p_action := TG_TABLE_NAME || '_' || v_action,
    p_action_category := TG_TABLE_NAME,
    p_target_type := TG_TABLE_NAME,
    p_target_id := CASE
      WHEN TG_OP = 'DELETE' THEN OLD.id::TEXT
      ELSE NEW.id::TEXT
    END,
    p_old_data := v_old_data,
    p_new_data := v_new_data,
    p_severity := v_severity
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Create audit triggers for critical tables
-- Loans
DROP TRIGGER IF EXISTS audit_loans ON public.loans;
CREATE TRIGGER audit_loans
  AFTER INSERT OR UPDATE OR DELETE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Borrowers
DROP TRIGGER IF EXISTS audit_borrowers ON public.borrowers;
CREATE TRIGGER audit_borrowers
  AFTER INSERT OR UPDATE OR DELETE ON public.borrowers
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Lenders
DROP TRIGGER IF EXISTS audit_lenders ON public.lenders;
CREATE TRIGGER audit_lenders
  AFTER INSERT OR UPDATE OR DELETE ON public.lenders
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Collaterals
DROP TRIGGER IF EXISTS audit_collaterals ON public.collaterals;
CREATE TRIGGER audit_collaterals
  AFTER INSERT OR UPDATE OR DELETE ON public.collaterals
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Late Fees
DROP TRIGGER IF EXISTS audit_late_fees ON public.late_fees;
CREATE TRIGGER audit_late_fees
  AFTER INSERT OR UPDATE OR DELETE ON public.late_fees
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Loan Restructures
DROP TRIGGER IF EXISTS audit_loan_restructures ON public.loan_restructures;
CREATE TRIGGER audit_loan_restructures
  AFTER INSERT OR UPDATE OR DELETE ON public.loan_restructures
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();


-- ============================================================================
-- 4. FUNCTION TO QUERY AUDIT LOGS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.query_audit_logs(
  p_action_category TEXT DEFAULT NULL,
  p_target_type TEXT DEFAULT NULL,
  p_target_id TEXT DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL,
  p_severity TEXT DEFAULT NULL,
  p_from_date TIMESTAMPTZ DEFAULT NULL,
  p_to_date TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSON AS $$
DECLARE
  v_data JSON;
  v_total INTEGER;
BEGIN
  -- Only admins can query audit logs
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RETURN json_build_object('error', 'Admin access required');
  END IF;

  -- Get total count
  SELECT COUNT(*) INTO v_total
  FROM public.audit_logs
  WHERE (p_action_category IS NULL OR action_category = p_action_category)
  AND (p_target_type IS NULL OR target_type = p_target_type)
  AND (p_target_id IS NULL OR target_id = p_target_id)
  AND (p_actor_id IS NULL OR actor_id = p_actor_id)
  AND (p_severity IS NULL OR severity = p_severity)
  AND (p_from_date IS NULL OR created_at >= p_from_date)
  AND (p_to_date IS NULL OR created_at <= p_to_date);

  -- Get data
  SELECT json_agg(row_to_json(d))
  INTO v_data
  FROM (
    SELECT
      al.id,
      al.actor_id,
      al.actor_role,
      p.email as actor_email,
      al.action,
      al.action_category,
      al.target_type,
      al.target_id,
      al.old_data,
      al.new_data,
      al.metadata,
      al.severity,
      al.created_at
    FROM public.audit_logs al
    LEFT JOIN auth.users p ON p.id = al.actor_id
    WHERE (p_action_category IS NULL OR al.action_category = p_action_category)
    AND (p_target_type IS NULL OR al.target_type = p_target_type)
    AND (p_target_id IS NULL OR al.target_id = p_target_id)
    AND (p_actor_id IS NULL OR al.actor_id = p_actor_id)
    AND (p_severity IS NULL OR al.severity = p_severity)
    AND (p_from_date IS NULL OR al.created_at >= p_from_date)
    AND (p_to_date IS NULL OR al.created_at <= p_to_date)
    ORDER BY al.created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) d;

  RETURN json_build_object(
    'success', TRUE,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'data', COALESCE(v_data, '[]'::json)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 5. FUNCTION TO VERIFY AUDIT CHAIN INTEGRITY
-- ============================================================================

CREATE OR REPLACE FUNCTION public.verify_audit_chain_integrity(
  p_from_date TIMESTAMPTZ DEFAULT NULL,
  p_to_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_current RECORD;
  v_expected_prev_hash TEXT := NULL;
  v_broken_entries INTEGER := 0;
  v_total_entries INTEGER := 0;
  v_first_broken_id UUID;
BEGIN
  -- Only admins can verify
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RETURN json_build_object('error', 'Admin access required');
  END IF;

  FOR v_current IN
    SELECT id, previous_hash, entry_hash
    FROM public.audit_logs
    WHERE (p_from_date IS NULL OR created_at >= p_from_date)
    AND (p_to_date IS NULL OR created_at <= p_to_date)
    ORDER BY created_at ASC
  LOOP
    v_total_entries := v_total_entries + 1;

    -- Check if previous hash matches
    IF v_expected_prev_hash IS NOT NULL AND v_current.previous_hash != v_expected_prev_hash THEN
      v_broken_entries := v_broken_entries + 1;
      IF v_first_broken_id IS NULL THEN
        v_first_broken_id := v_current.id;
      END IF;
    END IF;

    v_expected_prev_hash := v_current.entry_hash;
  END LOOP;

  RETURN json_build_object(
    'success', TRUE,
    'total_entries', v_total_entries,
    'broken_entries', v_broken_entries,
    'chain_integrity', CASE WHEN v_broken_entries = 0 THEN 'valid' ELSE 'compromised' END,
    'first_broken_entry', v_first_broken_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 6. FUNCTION TO GET AUDIT STATS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_audit_stats(
  p_days INTEGER DEFAULT 30
)
RETURNS JSON AS $$
BEGIN
  -- Only admins
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RETURN json_build_object('error', 'Admin access required');
  END IF;

  RETURN json_build_object(
    'total_entries', (SELECT COUNT(*) FROM public.audit_logs WHERE created_at >= NOW() - (p_days || ' days')::INTERVAL),
    'by_category', (
      SELECT json_object_agg(action_category, cnt)
      FROM (
        SELECT action_category, COUNT(*) as cnt
        FROM public.audit_logs
        WHERE created_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY action_category
      ) t
    ),
    'by_severity', (
      SELECT json_object_agg(severity, cnt)
      FROM (
        SELECT COALESCE(severity, 'info') as severity, COUNT(*) as cnt
        FROM public.audit_logs
        WHERE created_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY severity
      ) t
    ),
    'by_day', (
      SELECT json_agg(row_to_json(t))
      FROM (
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM public.audit_logs
        WHERE created_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      ) t
    ),
    'period_days', p_days
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Grant permissions
GRANT EXECUTE ON FUNCTION public.create_audit_log(TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.query_audit_logs(TEXT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_audit_chain_integrity(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_audit_stats(INTEGER) TO authenticated;


-- Log migration
DO $$
BEGIN
  RAISE NOTICE 'Complete audit logging system created';
  RAISE NOTICE 'Features: Auto-triggers, chain integrity, query functions, stats';
END $$;
