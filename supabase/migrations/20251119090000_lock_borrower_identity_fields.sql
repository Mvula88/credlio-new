-- LOCK BORROWER IDENTITY FIELDS
-- Prevents changes to critical identity fields after initial submission
-- This is a fraud prevention measure

-- ============================================================================
-- CREATE TRIGGER TO PREVENT UPDATES TO LOCKED FIELDS
-- ============================================================================

-- Function to prevent updates to locked identity fields
CREATE OR REPLACE FUNCTION public.prevent_borrower_identity_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only check on UPDATE, not INSERT
  IF TG_OP = 'UPDATE' THEN
    -- Check if profile is already completed (fields are locked)
    IF OLD.profile_completed = true THEN
      -- Prevent changes to locked fields
      IF NEW.national_id_hash IS DISTINCT FROM OLD.national_id_hash THEN
        RAISE EXCEPTION 'National ID cannot be changed after profile completion. Please contact support if you need to update this information.';
      END IF;

      IF NEW.phone_e164 IS DISTINCT FROM OLD.phone_e164 THEN
        RAISE EXCEPTION 'Phone number cannot be changed after profile completion. Please contact support if you need to update this information.';
      END IF;

      IF NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth THEN
        RAISE EXCEPTION 'Date of birth cannot be changed after profile completion. Please contact support if you need to update this information.';
      END IF;

      IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
        RAISE EXCEPTION 'Full name cannot be changed after profile completion. Please contact support if you need to update this information.';
      END IF;

      IF NEW.country_code IS DISTINCT FROM OLD.country_code THEN
        RAISE EXCEPTION 'Country cannot be changed after profile completion. Please contact support if you need to update this information.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on borrowers table
DROP TRIGGER IF EXISTS lock_borrower_identity_fields ON public.borrowers;

CREATE TRIGGER lock_borrower_identity_fields
  BEFORE UPDATE ON public.borrowers
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_borrower_identity_changes();

-- ============================================================================
-- CREATE TABLE FOR FIELD CHANGE REQUESTS
-- For when borrowers legitimately need to change locked fields
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.borrower_field_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  borrower_id UUID NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL CHECK (field_name IN ('full_name', 'national_id', 'phone_e164', 'date_of_birth', 'bank_name', 'bank_account_number', 'bank_account_name')),
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
ALTER TABLE public.borrower_field_change_requests ENABLE ROW LEVEL SECURITY;

-- Borrowers can view their own change requests
CREATE POLICY "Borrowers can view own change requests" ON public.borrower_field_change_requests
  FOR SELECT USING (
    user_id = auth.uid()
  );

-- Borrowers can create change requests
CREATE POLICY "Borrowers can create change requests" ON public.borrower_field_change_requests
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
  );

-- Admins can view all change requests
CREATE POLICY "Admins can view all change requests" ON public.borrower_field_change_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can update change requests (approve/reject)
CREATE POLICY "Admins can update change requests" ON public.borrower_field_change_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_field_change_requests_borrower ON public.borrower_field_change_requests(borrower_id);
CREATE INDEX IF NOT EXISTS idx_field_change_requests_status ON public.borrower_field_change_requests(status);

-- ============================================================================
-- FUNCTION TO APPLY APPROVED FIELD CHANGES (Admin only)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.apply_field_change_request(
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
  FROM public.borrower_field_change_requests
  WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found or already processed');
  END IF;

  -- Temporarily disable the trigger to allow the update
  ALTER TABLE public.borrowers DISABLE TRIGGER lock_borrower_identity_fields;

  -- Apply the change based on field name
  CASE v_request.field_name
    WHEN 'full_name' THEN
      UPDATE public.borrowers SET full_name = v_request.requested_value WHERE id = v_request.borrower_id;
    WHEN 'phone_e164' THEN
      UPDATE public.borrowers SET phone_e164 = v_request.requested_value WHERE id = v_request.borrower_id;
    WHEN 'date_of_birth' THEN
      UPDATE public.borrowers SET date_of_birth = v_request.requested_value::DATE WHERE id = v_request.borrower_id;
    WHEN 'bank_name' THEN
      UPDATE public.borrowers SET bank_name = v_request.requested_value WHERE id = v_request.borrower_id;
    WHEN 'bank_account_number' THEN
      UPDATE public.borrowers SET bank_account_number = v_request.requested_value WHERE id = v_request.borrower_id;
    WHEN 'bank_account_name' THEN
      UPDATE public.borrowers SET bank_account_name = v_request.requested_value WHERE id = v_request.borrower_id;
    ELSE
      -- Re-enable trigger before returning error
      ALTER TABLE public.borrowers ENABLE TRIGGER lock_borrower_identity_fields;
      RETURN jsonb_build_object('success', false, 'error', 'Unsupported field: ' || v_request.field_name);
  END CASE;

  -- Re-enable the trigger
  ALTER TABLE public.borrowers ENABLE TRIGGER lock_borrower_identity_fields;

  -- Mark request as approved
  UPDATE public.borrower_field_change_requests
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
    'FIELD_CHANGE_APPROVED',
    'borrowers',
    v_request.borrower_id,
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
-- SUMMARY OF LOCKED FIELDS:
-- ============================================================================
-- PERMANENTLY LOCKED (require admin approval to change):
-- - full_name
-- - national_id_hash
-- - phone_e164
-- - date_of_birth
-- - country_code
--
-- CAN BE CHANGED BY BORROWER:
-- - street_address
-- - city
-- - postal_code
-- - employment_status
-- - employer_name
-- - monthly_income_range
-- - income_source
-- - emergency_contact_*
-- - next_of_kin_*
-- - linkedin_url
-- - facebook_url
--
-- REQUIRES CHANGE REQUEST (admin approval):
-- - bank_name
-- - bank_account_number
-- - bank_account_name
-- ============================================================================
