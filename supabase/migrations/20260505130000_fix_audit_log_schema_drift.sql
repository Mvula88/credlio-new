-- Fix audit_logs schema drift that breaks INSERTs on audited tables
--
-- Background:
--   audit_logs was first created in 006_create_support_tables.sql with columns
--   (action audit_action, target text NOT NULL, target_id, country_code, payload, ...).
--
--   20251205121527_complete_audit_logging.sql tried to migrate it to a richer
--   schema via a CREATE TABLE branch (which only runs if the table didn't exist)
--   plus a series of ALTER TABLE ADD COLUMN IF NOT EXISTS — but two columns
--   the new code expects were missed: target_type and metadata.
--
--   That same migration installed audit_trigger_func, which fires AFTER
--   INSERT/UPDATE/DELETE on six tables (loans, borrowers, lenders, collaterals,
--   late_fees, loan_restructures) and calls create_audit_log. create_audit_log
--   then INSERTs into audit_logs using the columns target_type and metadata
--   that don't exist — so every insert into those six tables fails in
--   production.
--
--   audit_trigger_func also passes a compound action like 'borrowers_create'
--   to create_audit_log's p_action TEXT, which audit_logs.action (an
--   audit_action enum allowing only create/update/delete/view/search/...)
--   rejects.
--
-- Fix:
--   1. Add target_type TEXT and metadata JSONB columns (idempotent).
--   2. Drop the NOT NULL constraint on target — the new path doesn't supply
--      it; older direct INSERTs that DO supply it continue to work.
--   3. Rewrite create_audit_log to:
--        - Cast p_action to audit_action (with a defensive fallback to 'view'
--          if a stray value sneaks in — better than blocking the parent write).
--        - Backfill the legacy target column from target_type so it stays
--          consistent for code that still reads target.
--   4. Rewrite audit_trigger_func to pass just v_action ('create'/'update'/
--      'delete' — all valid audit_action values) and put the table name in
--      action_category + target_type, where it belongs.
--
-- Net effect: the six audited tables can be inserted/updated/deleted again,
-- and audit rows are written with full information (table name in target_type,
-- row id in target_id, before/after JSON in old_data/new_data).

-- 1. Add missing columns idempotently.
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS target_type TEXT;

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_audit_logs_target_type
  ON public.audit_logs(target_type, target_id);

-- 2. Make legacy target column nullable so the new write path doesn't have
--    to populate it. Existing direct INSERTs that DO populate target keep
--    working.
ALTER TABLE public.audit_logs
  ALTER COLUMN target DROP NOT NULL;

-- 3. Rewrite create_audit_log so it uses columns that actually exist, casts
--    action to the enum safely, and keeps the legacy target column in sync.
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
  v_action_enum public.audit_action;
  v_target_id_uuid UUID;
BEGIN
  v_actor_id := auth.uid();

  SELECT role INTO v_actor_role
  FROM public.user_roles
  WHERE user_id = v_actor_id
  LIMIT 1;

  -- Cast p_action to the audit_action enum. If the caller passes something
  -- not in the enum, fall back to 'view' rather than block the parent write.
  -- Triggers should pass valid values now (create/update/delete) but this
  -- protects against future regressions.
  BEGIN
    v_action_enum := p_action::public.audit_action;
  EXCEPTION WHEN invalid_text_representation OR check_violation THEN
    v_action_enum := 'view'::public.audit_action;
  END;

  -- target_id is UUID in audit_logs; the function takes TEXT, so coerce.
  BEGIN
    v_target_id_uuid := p_target_id::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    v_target_id_uuid := NULL;
  END;

  SELECT entry_hash INTO v_previous_hash
  FROM public.audit_logs
  ORDER BY created_at DESC
  LIMIT 1;

  v_entry_data := COALESCE(v_actor_id::TEXT, '') ||
                  p_action ||
                  COALESCE(p_target_type, '') ||
                  COALESCE(p_target_id, '') ||
                  COALESCE(v_previous_hash, 'genesis') ||
                  NOW()::TEXT;
  v_entry_hash := encode(digest(v_entry_data, 'sha256'), 'hex');

  INSERT INTO public.audit_logs (
    actor_id, actor_role, action, action_category,
    target, target_type, target_id,
    old_data, new_data, metadata,
    previous_hash, entry_hash, severity
  ) VALUES (
    v_actor_id,
    v_actor_role::public.app_role,
    v_action_enum,
    p_action_category,
    -- Keep legacy target column populated from target_type (or category as
    -- fallback) so rows remain consistent for older readers.
    COALESCE(p_target_type, p_action_category),
    p_target_type,
    v_target_id_uuid,
    p_old_data, p_new_data, p_metadata,
    v_previous_hash, v_entry_hash, p_severity
  )
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Rewrite audit_trigger_func so the action passed to create_audit_log
--    is a valid enum value. Table name moves to action_category +
--    target_type, where create_audit_log already places it.
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
  v_old_data JSONB;
  v_new_data JSONB;
  v_severity TEXT := 'info';
BEGIN
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

  PERFORM public.create_audit_log(
    p_action := v_action,
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

COMMENT ON FUNCTION public.create_audit_log IS
  'Writes an audit row. Casts action to audit_action enum (falls back to view), populates both legacy target and new target_type columns. Used by audit_trigger_func.';

COMMENT ON FUNCTION public.audit_trigger_func IS
  'Generic AFTER trigger that audits INSERT/UPDATE/DELETE. Fires on loans, borrowers, lenders, collaterals, late_fees, loan_restructures.';
