-- LOCK LENDER IDENTITY FIELDS
-- Prevents changes to critical identity fields after initial submission
-- This is a fraud prevention measure

-- ============================================================================
-- CREATE TRIGGER TO PREVENT UPDATES TO LOCKED FIELDS ON LENDERS TABLE
-- ============================================================================

-- Function to prevent updates to locked identity fields for lenders
CREATE OR REPLACE FUNCTION public.prevent_lender_identity_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only check on UPDATE, not INSERT
  IF TG_OP = 'UPDATE' THEN
    -- Check if profile is already completed (fields are locked)
    IF OLD.profile_completed = true THEN
      -- Prevent changes to locked fields
      IF NEW.id_number IS DISTINCT FROM OLD.id_number THEN
        RAISE EXCEPTION 'ID number cannot be changed after profile completion. Please contact support if you need to update this information.';
      END IF;

      IF NEW.id_type IS DISTINCT FROM OLD.id_type THEN
        RAISE EXCEPTION 'ID type cannot be changed after profile completion. Please contact support if you need to update this information.';
      END IF;

      IF NEW.contact_number IS DISTINCT FROM OLD.contact_number THEN
        RAISE EXCEPTION 'Phone number cannot be changed after profile completion. Please contact support if you need to update this information.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on lenders table
DROP TRIGGER IF EXISTS lock_lender_identity_fields ON public.lenders;

CREATE TRIGGER lock_lender_identity_fields
  BEFORE UPDATE ON public.lenders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_lender_identity_changes();

-- ============================================================================
-- ALSO LOCK FIELDS IN PROFILES TABLE FOR LENDERS
-- ============================================================================

-- Function to prevent updates to locked identity fields in profiles
CREATE OR REPLACE FUNCTION public.prevent_profile_identity_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only check on UPDATE, not INSERT
  IF TG_OP = 'UPDATE' THEN
    -- Check if onboarding is already completed (fields are locked)
    IF OLD.onboarding_completed = true THEN
      -- Prevent changes to locked fields
      IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
        RAISE EXCEPTION 'Full name cannot be changed after profile completion. Please contact support if you need to update this information.';
      END IF;

      IF NEW.phone_e164 IS DISTINCT FROM OLD.phone_e164 THEN
        RAISE EXCEPTION 'Phone number cannot be changed after profile completion. Please contact support if you need to update this information.';
      END IF;

      IF NEW.country_code IS DISTINCT FROM OLD.country_code THEN
        RAISE EXCEPTION 'Country cannot be changed after profile completion. Please contact support if you need to update this information.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on profiles table
DROP TRIGGER IF EXISTS lock_profile_identity_fields ON public.profiles;

CREATE TRIGGER lock_profile_identity_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_identity_changes();

-- ============================================================================
-- CREATE TABLE FOR LENDER FIELD CHANGE REQUESTS
-- For when lenders legitimately need to change locked fields
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lender_field_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL CHECK (field_name IN ('full_name', 'id_number', 'id_type', 'contact_number', 'phone_e164')),
  current_value TEXT,
  requested_value TEXT NOT NULL,
  reason TEXT NOT NULL,
  supporting_document_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.lender_field_change_requests ENABLE ROW LEVEL SECURITY;

-- Lenders can view their own change requests
CREATE POLICY "Lenders can view own change requests" ON public.lender_field_change_requests
  FOR SELECT USING (
    lender_user_id = auth.uid()
  );

-- Lenders can create change requests
CREATE POLICY "Lenders can create change requests" ON public.lender_field_change_requests
  FOR INSERT WITH CHECK (
    lender_user_id = auth.uid()
  );

-- Admins can view all change requests
CREATE POLICY "Admins can view all lender change requests" ON public.lender_field_change_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can update change requests (approve/reject)
CREATE POLICY "Admins can update lender change requests" ON public.lender_field_change_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_lender_field_change_requests_user ON public.lender_field_change_requests(lender_user_id);
CREATE INDEX IF NOT EXISTS idx_lender_field_change_requests_status ON public.lender_field_change_requests(status);

-- ============================================================================
-- FUNCTION TO APPLY APPROVED LENDER FIELD CHANGES (Admin only)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.apply_lender_field_change_request(
  p_request_id UUID,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request RECORD;
  v_result JSONB;
BEGIN
  -- Get the change request
  SELECT * INTO v_request
  FROM public.lender_field_change_requests
  WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found or already processed');
  END IF;

  -- Temporarily disable the triggers to allow the update
  ALTER TABLE public.lenders DISABLE TRIGGER lock_lender_identity_fields;
  ALTER TABLE public.profiles DISABLE TRIGGER lock_profile_identity_fields;

  -- Apply the change based on field name
  CASE v_request.field_name
    WHEN 'full_name' THEN
      UPDATE public.profiles SET full_name = v_request.requested_value WHERE user_id = v_request.lender_user_id;
    WHEN 'phone_e164' THEN
      UPDATE public.profiles SET phone_e164 = v_request.requested_value WHERE user_id = v_request.lender_user_id;
      UPDATE public.lenders SET contact_number = v_request.requested_value WHERE user_id = v_request.lender_user_id;
    WHEN 'contact_number' THEN
      UPDATE public.lenders SET contact_number = v_request.requested_value WHERE user_id = v_request.lender_user_id;
      UPDATE public.profiles SET phone_e164 = v_request.requested_value WHERE user_id = v_request.lender_user_id;
    WHEN 'id_number' THEN
      UPDATE public.lenders SET id_number = v_request.requested_value WHERE user_id = v_request.lender_user_id;
    WHEN 'id_type' THEN
      UPDATE public.lenders SET id_type = v_request.requested_value WHERE user_id = v_request.lender_user_id;
    ELSE
      -- Re-enable triggers before returning error
      ALTER TABLE public.lenders ENABLE TRIGGER lock_lender_identity_fields;
      ALTER TABLE public.profiles ENABLE TRIGGER lock_profile_identity_fields;
      RETURN jsonb_build_object('success', false, 'error', 'Unsupported field: ' || v_request.field_name);
  END CASE;

  -- Re-enable the triggers
  ALTER TABLE public.lenders ENABLE TRIGGER lock_lender_identity_fields;
  ALTER TABLE public.profiles ENABLE TRIGGER lock_profile_identity_fields;

  -- Mark request as approved
  UPDATE public.lender_field_change_requests
  SET
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = NOW(),
    review_notes = p_admin_notes,
    updated_at = NOW()
  WHERE id = p_request_id;

  -- Log the change in audit
  INSERT INTO public.audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    old_value,
    new_value,
    ip_address
  ) VALUES (
    auth.uid(),
    'LENDER_FIELD_CHANGE_APPROVED',
    'lenders',
    v_request.lender_user_id,
    jsonb_build_object(v_request.field_name, v_request.current_value),
    jsonb_build_object(v_request.field_name, v_request.requested_value),
    '0.0.0.0'
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Field change applied successfully',
    'field', v_request.field_name,
    'new_value', v_request.requested_value
  );
END;
$$;

-- ============================================================================
-- SUMMARY OF LOCKED FIELDS FOR LENDERS:
-- ============================================================================
-- PERMANENTLY LOCKED (require admin approval to change):
-- In profiles table:
--   - full_name
--   - phone_e164
--   - country_code
--
-- In lenders table:
--   - id_number
--   - id_type
--   - contact_number
--
-- CAN BE CHANGED BY LENDER:
-- In lenders table:
--   - city
--   - lending_purpose
--   - id_photo_path (can re-upload)
-- ============================================================================
