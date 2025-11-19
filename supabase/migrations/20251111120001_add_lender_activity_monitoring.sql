-- Create table to log suspicious lender activity for admin review
-- This runs in the background and doesn't block lenders from using the platform

CREATE TABLE IF NOT EXISTS public.lender_activity_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lender_id UUID NOT NULL REFERENCES public.lenders(user_id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  risk_score INT NOT NULL,
  risk_factors JSONB DEFAULT '[]',
  details TEXT,
  flagged_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'cleared', 'confirmed', 'account_suspended')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_lender_activity_flags_lender ON public.lender_activity_flags(lender_id);
CREATE INDEX IF NOT EXISTS idx_lender_activity_flags_status ON public.lender_activity_flags(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_lender_activity_flags_risk ON public.lender_activity_flags(risk_level) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_lender_activity_flags_created ON public.lender_activity_flags(created_at DESC);

-- RLS policies
ALTER TABLE public.lender_activity_flags ENABLE ROW LEVEL SECURITY;

-- Admins can view all flags
CREATE POLICY "Admins can view all lender activity flags" ON public.lender_activity_flags
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Admins can update flags (review them)
CREATE POLICY "Admins can update lender activity flags" ON public.lender_activity_flags
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- System can insert flags (called by triggers)
CREATE POLICY "System can insert lender activity flags" ON public.lender_activity_flags
  FOR INSERT WITH CHECK (true);

-- Function to automatically flag suspicious lender activity
-- This is called after a borrower is registered
CREATE OR REPLACE FUNCTION public.auto_flag_suspicious_lender()
RETURNS TRIGGER AS $$
DECLARE
  v_activity_check RECORD;
BEGIN
  -- Only check if a lender created this borrower
  IF NEW.created_by_lender IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check for suspicious activity
  SELECT * INTO v_activity_check
  FROM public.check_lender_suspicious_activity(NEW.created_by_lender);

  -- If medium or high risk, create a flag
  IF v_activity_check.risk_level IN ('medium', 'high') THEN
    -- Check if there's already a pending flag for this lender in the last 24 hours
    IF NOT EXISTS (
      SELECT 1 FROM public.lender_activity_flags
      WHERE lender_id = NEW.created_by_lender
        AND status = 'pending'
        AND created_at > NOW() - INTERVAL '24 hours'
    ) THEN
      -- Create new flag
      INSERT INTO public.lender_activity_flags (
        lender_id,
        flag_type,
        risk_level,
        risk_score,
        risk_factors,
        details
      ) VALUES (
        NEW.created_by_lender,
        'suspicious_borrower_registration_pattern',
        v_activity_check.risk_level,
        v_activity_check.risk_score,
        v_activity_check.risk_factors,
        format('Automatic flag triggered after registering borrower %s', NEW.id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on borrowers table to auto-flag suspicious activity
DROP TRIGGER IF EXISTS trigger_auto_flag_suspicious_lender ON public.borrowers;
CREATE TRIGGER trigger_auto_flag_suspicious_lender
  AFTER INSERT ON public.borrowers
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_flag_suspicious_lender();

-- Function for admins to manually flag a lender
CREATE OR REPLACE FUNCTION public.flag_lender_activity(
  p_lender_id UUID,
  p_flag_type TEXT,
  p_risk_level TEXT,
  p_details TEXT
)
RETURNS UUID AS $$
DECLARE
  v_flag_id UUID;
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can flag lender activity';
  END IF;

  -- Create flag
  INSERT INTO public.lender_activity_flags (
    lender_id,
    flag_type,
    risk_level,
    risk_score,
    details
  ) VALUES (
    p_lender_id,
    p_flag_type,
    p_risk_level,
    50, -- Manual flags get default score
    p_details
  ) RETURNING id INTO v_flag_id;

  RETURN v_flag_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.flag_lender_activity(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- Add comments
COMMENT ON TABLE public.lender_activity_flags IS 'Tracks suspicious lender behavior for admin review - does NOT block lender access';
COMMENT ON COLUMN public.lender_activity_flags.flag_type IS 'Type of suspicious activity (e.g., rapid_borrower_creation, duplicate_data, etc)';
COMMENT ON COLUMN public.lender_activity_flags.risk_level IS 'low, medium, or high risk';
COMMENT ON COLUMN public.lender_activity_flags.status IS 'pending (needs review), cleared (false alarm), confirmed (real issue), account_suspended';
COMMENT ON FUNCTION public.auto_flag_suspicious_lender() IS 'Automatically flags suspicious lender activity in the background - called after borrower registration';
COMMENT ON FUNCTION public.flag_lender_activity(UUID, TEXT, TEXT, TEXT) IS 'Allows admins to manually flag suspicious lender activity';
