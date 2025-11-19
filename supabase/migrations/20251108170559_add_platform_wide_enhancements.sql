-- ============================================================================
-- PLATFORM-WIDE ENHANCEMENTS
-- ============================================================================
-- Features:
-- 1. Lender Reputation System
-- 2. Smart Matching & Saved Searches (Lender)
-- 3. Loan Request Templates (Borrower)
-- 4. In-App Messaging (All users)
-- 5. Request History & Analytics (All users)
-- 6. Dispute Resolution Center (Admin + Users)
-- ============================================================================

-- ============================================================================
-- SECTION 1: LENDER REPUTATION SYSTEM
-- ============================================================================

-- Create lender reputation table
CREATE TABLE IF NOT EXISTS public.lender_reputation (
  lender_id UUID PRIMARY KEY REFERENCES public.lenders(user_id) ON DELETE CASCADE,
  total_loans_disbursed INT DEFAULT 0,
  total_loans_completed INT DEFAULT 0,
  total_loans_defaulted INT DEFAULT 0,
  total_disbursements_disputed INT DEFAULT 0,
  total_disbursements_confirmed INT DEFAULT 0,
  successful_disbursement_rate DECIMAL(5,2) DEFAULT 100.00, -- Percentage
  average_response_time_hours DECIMAL(10,2) DEFAULT 0,
  reputation_score INT DEFAULT 100, -- 0-100 scale
  is_suspended BOOLEAN DEFAULT FALSE,
  suspension_reason TEXT,
  suspended_at TIMESTAMPTZ,
  suspended_until TIMESTAMPTZ,
  total_offers_made INT DEFAULT 0,
  total_offers_accepted INT DEFAULT 0,
  offer_acceptance_rate DECIMAL(5,2) DEFAULT 0,
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create lender reputation events log
CREATE TABLE IF NOT EXISTS public.lender_reputation_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lender_id UUID NOT NULL REFERENCES public.lenders(user_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'loan_disbursed', 'loan_completed', 'disbursement_disputed', 'disbursement_confirmed', 'offer_made', 'offer_accepted'
  loan_id UUID REFERENCES public.loans(id) ON DELETE SET NULL,
  offer_id UUID REFERENCES public.loan_offers(id) ON DELETE SET NULL,
  impact_on_score INT DEFAULT 0, -- Positive or negative impact
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reputation_events_lender ON public.lender_reputation_events(lender_id, created_at DESC);

-- ============================================================================
-- SECTION 2: SMART MATCHING & SAVED SEARCHES (LENDER SIDE)
-- ============================================================================

-- Create saved search preferences for lenders
CREATE TABLE IF NOT EXISTS public.lender_saved_searches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lender_id UUID NOT NULL REFERENCES public.lenders(user_id) ON DELETE CASCADE,
  search_name TEXT NOT NULL,
  min_credit_score INT,
  max_credit_score INT,
  min_amount_minor BIGINT,
  max_amount_minor BIGINT,
  max_term_months INT,
  country_codes TEXT[], -- Array of country codes
  exclude_high_risk BOOLEAN DEFAULT TRUE,
  notify_on_match BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_lender ON public.lender_saved_searches(lender_id, is_active);

-- Create notification preferences
CREATE TABLE IF NOT EXISTS public.lender_notification_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lender_id UUID NOT NULL REFERENCES public.lenders(user_id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES public.loan_requests(id) ON DELETE CASCADE,
  saved_search_id UUID REFERENCES public.lender_saved_searches(id) ON DELETE SET NULL,
  notified_at TIMESTAMPTZ DEFAULT NOW(),
  viewed_at TIMESTAMPTZ,
  offer_made BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_notification_log_lender ON public.lender_notification_log(lender_id, notified_at DESC);

-- ============================================================================
-- SECTION 3: LOAN REQUEST TEMPLATES (BORROWER SIDE)
-- ============================================================================

-- Create loan purpose enum (if not exists, otherwise skip)
DO $$ BEGIN
  CREATE TYPE loan_purpose AS ENUM (
    'business_expansion',
    'working_capital',
    'equipment_purchase',
    'inventory',
    'personal_emergency',
    'education',
    'medical',
    'home_improvement',
    'debt_consolidation',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create request templates table
CREATE TABLE IF NOT EXISTS public.loan_request_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purpose loan_purpose NOT NULL,
  template_name TEXT NOT NULL,
  description TEXT,
  suggested_min_amount_minor BIGINT,
  suggested_max_amount_minor BIGINT,
  suggested_term_months INT,
  required_documents TEXT[], -- Array of document types
  typical_interest_rate_bps INT, -- Basis points for reference
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add loan purpose to loan_requests
ALTER TABLE public.loan_requests ADD COLUMN IF NOT EXISTS purpose loan_purpose;
ALTER TABLE public.loan_requests ADD COLUMN IF NOT EXISTS purpose_description TEXT;
ALTER TABLE public.loan_requests ADD COLUMN IF NOT EXISTS documents_provided TEXT[];

-- ============================================================================
-- SECTION 4: IN-APP MESSAGING SYSTEM (ALL USERS)
-- ============================================================================

-- Create message threads table
CREATE TABLE IF NOT EXISTS public.message_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID REFERENCES public.loan_requests(id) ON DELETE CASCADE,
  offer_id UUID REFERENCES public.loan_offers(id) ON DELETE CASCADE,
  lender_id UUID NOT NULL REFERENCES public.lenders(user_id) ON DELETE CASCADE,
  borrower_id UUID NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active', -- 'active', 'closed', 'archived'
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_threads_lender ON public.message_threads(lender_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_borrower ON public.message_threads(borrower_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_request ON public.message_threads(request_id);

-- Create messages table
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL, -- 'lender', 'borrower', 'admin'
  sender_id UUID NOT NULL, -- user_id of sender
  message TEXT NOT NULL,
  is_system_message BOOLEAN DEFAULT FALSE,
  flagged_as_spam BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_thread ON public.messages(thread_id, created_at DESC);

-- Create message moderation keywords
CREATE TABLE IF NOT EXISTS public.message_moderation_keywords (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  keyword TEXT NOT NULL UNIQUE,
  severity TEXT DEFAULT 'medium', -- 'low', 'medium', 'high'
  action TEXT DEFAULT 'flag', -- 'flag', 'block', 'warn'
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert common scam keywords
INSERT INTO public.message_moderation_keywords (keyword, severity, action) VALUES
  ('bank account', 'medium', 'flag'),
  ('password', 'high', 'block'),
  ('send money', 'high', 'flag'),
  ('western union', 'high', 'flag'),
  ('moneygram', 'high', 'flag'),
  ('bitcoin', 'medium', 'flag'),
  ('cryptocurrency', 'medium', 'flag'),
  ('urgent', 'low', 'flag'),
  ('guaranteed', 'medium', 'flag')
ON CONFLICT (keyword) DO NOTHING;

-- ============================================================================
-- SECTION 5: REQUEST HISTORY & ANALYTICS (ALL USERS)
-- ============================================================================

-- Create request performance tracking
CREATE TABLE IF NOT EXISTS public.request_performance_stats (
  request_id UUID PRIMARY KEY REFERENCES public.loan_requests(id) ON DELETE CASCADE,
  borrower_id UUID NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,
  total_views INT DEFAULT 0,
  total_offers_received INT DEFAULT 0,
  average_offer_rate_bps INT,
  lowest_offer_rate_bps INT,
  highest_offer_rate_bps INT,
  time_to_first_offer_hours DECIMAL(10,2),
  time_to_acceptance_hours DECIMAL(10,2),
  was_accepted BOOLEAN DEFAULT FALSE,
  was_cancelled BOOLEAN DEFAULT FALSE,
  was_expired BOOLEAN DEFAULT FALSE,
  final_status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_request_stats_borrower ON public.request_performance_stats(borrower_id);

-- Create borrower request history summary
CREATE TABLE IF NOT EXISTS public.borrower_request_summary (
  borrower_id UUID PRIMARY KEY REFERENCES public.borrowers(id) ON DELETE CASCADE,
  total_requests_created INT DEFAULT 0,
  total_requests_accepted INT DEFAULT 0,
  total_requests_cancelled INT DEFAULT 0,
  total_requests_expired INT DEFAULT 0,
  average_offers_per_request DECIMAL(5,2) DEFAULT 0,
  average_interest_rate_bps INT,
  best_interest_rate_bps INT,
  request_acceptance_rate DECIMAL(5,2) DEFAULT 0,
  last_request_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create market analytics table (for showing trends)
CREATE TABLE IF NOT EXISTS public.market_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL UNIQUE,
  total_requests_created INT DEFAULT 0,
  total_requests_accepted INT DEFAULT 0,
  total_offers_made INT DEFAULT 0,
  average_request_amount_minor BIGINT,
  average_interest_rate_bps INT,
  median_interest_rate_bps INT,
  total_active_lenders INT DEFAULT 0,
  total_active_borrowers INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_analytics_date ON public.market_analytics(date DESC);

-- ============================================================================
-- SECTION 6: DISPUTE RESOLUTION CENTER (ADMIN + USERS)
-- ============================================================================

-- Add new values to existing dispute_status enum
ALTER TYPE dispute_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE dispute_status ADD VALUE IF NOT EXISTS 'awaiting_evidence';
ALTER TYPE dispute_status ADD VALUE IF NOT EXISTS 'resolved_in_favor_borrower';
ALTER TYPE dispute_status ADD VALUE IF NOT EXISTS 'resolved_in_favor_lender';
ALTER TYPE dispute_status ADD VALUE IF NOT EXISTS 'closed_no_action';
ALTER TYPE dispute_status ADD VALUE IF NOT EXISTS 'escalated';

-- Enhance existing disputes table with new columns
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS dispute_number TEXT;
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS request_id UUID REFERENCES public.loan_requests(id) ON DELETE SET NULL;
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS filed_by TEXT;
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS dispute_type TEXT;
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS amount_disputed_minor BIGINT;
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS assigned_to_admin UUID;
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS resolution_action TEXT;
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS sla_due_date TIMESTAMPTZ;
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Rename sla_due_at to sla_due_date if sla_due_at exists and sla_due_date doesn't
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'disputes' AND column_name = 'sla_due_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'disputes' AND column_name = 'sla_due_date'
  ) THEN
    ALTER TABLE public.disputes RENAME COLUMN sla_due_at TO sla_due_date;
  END IF;
END $$;

-- Make dispute_number unique if not already
DO $$ BEGIN
  ALTER TABLE public.disputes ADD CONSTRAINT disputes_dispute_number_unique UNIQUE(dispute_number);
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- Create indexes for disputes (only if they don't exist)
CREATE INDEX IF NOT EXISTS idx_disputes_lender ON public.disputes(lender_id) WHERE lender_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_disputes_admin ON public.disputes(assigned_to_admin) WHERE assigned_to_admin IS NOT NULL;

-- Create dispute evidence table
CREATE TABLE IF NOT EXISTS public.dispute_evidence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  uploaded_by TEXT NOT NULL, -- 'borrower', 'lender', 'admin'
  uploader_id UUID NOT NULL,
  evidence_type TEXT NOT NULL, -- 'document', 'screenshot', 'message_log', 'bank_statement', 'other'
  file_hash TEXT NOT NULL,
  file_name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_dispute ON public.dispute_evidence(dispute_id, created_at DESC);

-- Create dispute timeline/activity log
CREATE TABLE IF NOT EXISTS public.dispute_timeline (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'filed', 'status_changed', 'evidence_added', 'comment_added', 'assigned', 'resolved'
  actor_type TEXT NOT NULL, -- 'borrower', 'lender', 'admin', 'system'
  actor_id UUID,
  old_value TEXT,
  new_value TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timeline_dispute ON public.dispute_timeline(dispute_id, created_at DESC);

-- Create dispute comments table (for internal admin notes and user replies)
CREATE TABLE IF NOT EXISTS public.dispute_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  commenter_type TEXT NOT NULL, -- 'borrower', 'lender', 'admin'
  commenter_id UUID NOT NULL,
  comment TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT FALSE, -- Internal admin notes not visible to users
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_dispute ON public.dispute_comments(dispute_id, created_at ASC);

-- ============================================================================
-- SECTION 7: FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function: Update lender reputation
CREATE OR REPLACE FUNCTION public.update_lender_reputation(p_lender_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_disbursed INT;
  v_total_confirmed INT;
  v_total_disputed INT;
  v_total_completed INT;
  v_total_defaulted INT;
  v_total_offers INT;
  v_total_accepted INT;
  v_success_rate DECIMAL(5,2);
  v_acceptance_rate DECIMAL(5,2);
  v_reputation_score INT;
BEGIN
  -- Get disbursement stats
  SELECT
    COUNT(*) FILTER (WHERE status IN ('active', 'completed', 'disputed')),
    COUNT(*) FILTER (WHERE disbursement_confirmed_by_borrower = TRUE),
    COUNT(*) FILTER (WHERE disbursement_disputed = TRUE),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE status = 'defaulted')
  INTO v_total_disbursed, v_total_confirmed, v_total_disputed, v_total_completed, v_total_defaulted
  FROM public.loans
  WHERE lender_id = p_lender_id;

  -- Get offer stats
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'accepted')
  INTO v_total_offers, v_total_accepted
  FROM public.loan_offers
  WHERE lender_id = p_lender_id;

  -- Calculate rates
  v_success_rate := CASE
    WHEN v_total_disbursed > 0 THEN
      ((v_total_confirmed::DECIMAL / v_total_disbursed) * 100)
    ELSE 100
  END;

  v_acceptance_rate := CASE
    WHEN v_total_offers > 0 THEN
      ((v_total_accepted::DECIMAL / v_total_offers) * 100)
    ELSE 0
  END;

  -- Calculate reputation score (0-100)
  v_reputation_score := 100;

  -- Deduct points for disputes
  v_reputation_score := v_reputation_score - (v_total_disputed * 10);

  -- Deduct points for defaults
  v_reputation_score := v_reputation_score - (v_total_defaulted * 5);

  -- Bonus for completed loans
  v_reputation_score := v_reputation_score + LEAST(v_total_completed, 10);

  -- Ensure score is between 0-100
  v_reputation_score := GREATEST(0, LEAST(100, v_reputation_score));

  -- Update or insert reputation
  INSERT INTO public.lender_reputation (
    lender_id,
    total_loans_disbursed,
    total_loans_completed,
    total_loans_defaulted,
    total_disbursements_disputed,
    total_disbursements_confirmed,
    successful_disbursement_rate,
    reputation_score,
    total_offers_made,
    total_offers_accepted,
    offer_acceptance_rate,
    updated_at
  ) VALUES (
    p_lender_id,
    v_total_disbursed,
    v_total_completed,
    v_total_defaulted,
    v_total_disputed,
    v_total_confirmed,
    v_success_rate,
    v_reputation_score,
    v_total_offers,
    v_total_accepted,
    v_acceptance_rate,
    NOW()
  )
  ON CONFLICT (lender_id) DO UPDATE SET
    total_loans_disbursed = EXCLUDED.total_loans_disbursed,
    total_loans_completed = EXCLUDED.total_loans_completed,
    total_loans_defaulted = EXCLUDED.total_loans_defaulted,
    total_disbursements_disputed = EXCLUDED.total_disbursements_disputed,
    total_disbursements_confirmed = EXCLUDED.total_disbursements_confirmed,
    successful_disbursement_rate = EXCLUDED.successful_disbursement_rate,
    reputation_score = EXCLUDED.reputation_score,
    total_offers_made = EXCLUDED.total_offers_made,
    total_offers_accepted = EXCLUDED.total_offers_accepted,
    offer_acceptance_rate = EXCLUDED.offer_acceptance_rate,
    updated_at = NOW();

  -- Auto-suspend if dispute rate > 30%
  IF v_total_disbursed > 5 AND (v_total_disputed::DECIMAL / v_total_disbursed) > 0.3 THEN
    UPDATE public.lender_reputation
    SET
      is_suspended = TRUE,
      suspension_reason = 'High dispute rate (>30%)',
      suspended_at = NOW(),
      suspended_until = NOW() + INTERVAL '30 days'
    WHERE lender_id = p_lender_id;
  END IF;
END;
$$;

-- Function: Check for matching saved searches
CREATE OR REPLACE FUNCTION public.notify_lenders_of_matching_request(p_request_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request record;
  v_search record;
BEGIN
  -- Get request details
  SELECT
    lr.*,
    b.borrower_scores[1].score AS credit_score
  INTO v_request
  FROM public.loan_requests lr
  JOIN public.borrowers b ON lr.borrower_id = b.id
  WHERE lr.id = p_request_id;

  -- Find matching saved searches
  FOR v_search IN
    SELECT * FROM public.lender_saved_searches
    WHERE is_active = TRUE
      AND notify_on_match = TRUE
      AND (min_credit_score IS NULL OR v_request.credit_score >= min_credit_score)
      AND (max_credit_score IS NULL OR v_request.credit_score <= max_credit_score)
      AND (min_amount_minor IS NULL OR v_request.amount_minor >= min_amount_minor)
      AND (max_amount_minor IS NULL OR v_request.amount_minor <= max_amount_minor)
      AND (country_codes IS NULL OR v_request.borrower_id IN (
        SELECT id FROM public.borrowers WHERE country_code = ANY(v_search.country_codes)
      ))
  LOOP
    -- Log notification
    INSERT INTO public.lender_notification_log (lender_id, request_id, saved_search_id)
    VALUES (v_search.lender_id, p_request_id, v_search.id);
  END LOOP;
END;
$$;

-- Function: File a dispute
CREATE OR REPLACE FUNCTION public.file_dispute(
  p_loan_id UUID,
  p_filed_by TEXT,
  p_dispute_type TEXT,
  p_title TEXT,
  p_description TEXT,
  p_amount_disputed_minor BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_dispute_id UUID;
  v_dispute_number TEXT;
  v_loan record;
  v_filer_id UUID;
  v_sla_hours INT;
BEGIN
  -- Get loan details
  SELECT * INTO v_loan
  FROM public.loans
  WHERE id = p_loan_id;

  IF v_loan IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Loan not found');
  END IF;

  -- Get filer ID
  v_filer_id := auth.uid();

  -- Verify filer is involved in the loan
  IF p_filed_by = 'borrower' AND v_loan.borrower_id != (SELECT id FROM public.borrowers WHERE user_id = v_filer_id) THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'You are not the borrower of this loan');
  END IF;

  IF p_filed_by = 'lender' AND v_loan.lender_id != v_filer_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'You are not the lender of this loan');
  END IF;

  -- Generate dispute number
  v_dispute_number := 'DSP-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
    LPAD((SELECT COUNT(*) + 1 FROM public.disputes WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW()))::TEXT, 5, '0');

  -- Determine SLA based on dispute type
  v_sla_hours := CASE p_dispute_type
    WHEN 'fraud' THEN 24
    WHEN 'non_disbursement' THEN 48
    ELSE 72
  END;

  -- Create dispute
  INSERT INTO public.disputes (
    dispute_number,
    loan_id,
    borrower_id,
    lender_id,
    filed_by,
    dispute_type,
    title,
    description,
    amount_disputed_minor,
    priority,
    sla_due_date
  ) VALUES (
    v_dispute_number,
    p_loan_id,
    v_loan.borrower_id,
    v_loan.lender_id,
    p_filed_by,
    p_dispute_type,
    p_title,
    p_description,
    p_amount_disputed_minor,
    CASE p_dispute_type WHEN 'fraud' THEN 'urgent' ELSE 'medium' END,
    NOW() + (v_sla_hours || ' hours')::INTERVAL
  )
  RETURNING id INTO v_dispute_id;

  -- Log timeline event
  INSERT INTO public.dispute_timeline (dispute_id, action, actor_type, actor_id, notes)
  VALUES (v_dispute_id, 'filed', p_filed_by, v_filer_id, 'Dispute filed');

  RETURN jsonb_build_object(
    'success', TRUE,
    'dispute_id', v_dispute_id,
    'dispute_number', v_dispute_number,
    'message', 'Dispute filed successfully. Ticket: ' || v_dispute_number
  );
END;
$$;

-- ============================================================================
-- SECTION 8: TRIGGERS
-- ============================================================================

-- Trigger: Update reputation on loan status change
CREATE OR REPLACE FUNCTION public.trigger_update_lender_reputation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update reputation when loan status changes or disbursement is confirmed/disputed
  IF (TG_OP = 'UPDATE' AND (
    OLD.status IS DISTINCT FROM NEW.status OR
    OLD.disbursement_confirmed_by_borrower IS DISTINCT FROM NEW.disbursement_confirmed_by_borrower OR
    OLD.disbursement_disputed IS DISTINCT FROM NEW.disbursement_disputed
  )) OR TG_OP = 'INSERT' THEN
    PERFORM update_lender_reputation(NEW.lender_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_reputation_on_loan_change ON public.loans;
CREATE TRIGGER update_reputation_on_loan_change
  AFTER INSERT OR UPDATE ON public.loans
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_lender_reputation();

-- Trigger: Notify lenders when new request is created
CREATE OR REPLACE FUNCTION public.trigger_notify_matching_lenders()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM notify_lenders_of_matching_request(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_lenders_on_new_request ON public.loan_requests;
CREATE TRIGGER notify_lenders_on_new_request
  AFTER INSERT ON public.loan_requests
  FOR EACH ROW
  EXECUTE FUNCTION trigger_notify_matching_lenders();

-- ============================================================================
-- SECTION 9: RLS POLICIES
-- ============================================================================

-- Lender reputation policies
ALTER TABLE public.lender_reputation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lenders can view own reputation"
  ON public.lender_reputation FOR SELECT
  USING (lender_id = auth.uid());

CREATE POLICY "All users can view lender reputation (public info)"
  ON public.lender_reputation FOR SELECT
  USING (TRUE);

-- Saved searches policies
ALTER TABLE public.lender_saved_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lenders can manage own saved searches"
  ON public.lender_saved_searches FOR ALL
  USING (lender_id = auth.uid());

-- Messages policies
ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view threads they're part of"
  ON public.message_threads FOR SELECT
  USING (
    lender_id = auth.uid() OR
    borrower_id IN (SELECT id FROM public.borrowers WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can view messages in their threads"
  ON public.messages FOR SELECT
  USING (
    thread_id IN (
      SELECT id FROM public.message_threads
      WHERE lender_id = auth.uid() OR
        borrower_id IN (SELECT id FROM public.borrowers WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can send messages in their threads"
  ON public.messages FOR INSERT
  WITH CHECK (
    thread_id IN (
      SELECT id FROM public.message_threads
      WHERE lender_id = auth.uid() OR
        borrower_id IN (SELECT id FROM public.borrowers WHERE user_id = auth.uid())
    )
  );

-- Disputes policies
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own disputes"
  ON public.disputes FOR SELECT
  USING (
    lender_id = auth.uid() OR
    borrower_id IN (SELECT id FROM public.borrowers WHERE user_id = auth.uid()) OR
    jwt_role() = 'admin'
  );

CREATE POLICY "Users can file disputes"
  ON public.disputes FOR INSERT
  WITH CHECK (
    lender_id = auth.uid() OR
    borrower_id IN (SELECT id FROM public.borrowers WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can upload evidence for their disputes"
  ON public.dispute_evidence FOR INSERT
  WITH CHECK (
    dispute_id IN (
      SELECT id FROM public.disputes
      WHERE lender_id = auth.uid() OR
        borrower_id IN (SELECT id FROM public.borrowers WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can comment on their disputes"
  ON public.dispute_comments FOR INSERT
  WITH CHECK (
    dispute_id IN (
      SELECT id FROM public.disputes
      WHERE lender_id = auth.uid() OR
        borrower_id IN (SELECT id FROM public.borrowers WHERE user_id = auth.uid()) OR
        jwt_role() = 'admin'
    )
  );

-- ============================================================================
-- SECTION 10: SEED DATA
-- ============================================================================

-- Insert loan request templates
INSERT INTO public.loan_request_templates (purpose, template_name, description, suggested_min_amount_minor, suggested_max_amount_minor, suggested_term_months, required_documents, typical_interest_rate_bps) VALUES
  ('business_expansion', 'Business Expansion Loan', 'Expand your business operations, open new locations, or increase inventory', 500000, 5000000, 12, ARRAY['business_registration', 'tax_clearance', 'bank_statement', 'business_plan'], 1500),
  ('working_capital', 'Working Capital Loan', 'Manage day-to-day business operations and cash flow', 100000, 2000000, 6, ARRAY['business_registration', 'bank_statement', 'proof_of_address'], 1800),
  ('equipment_purchase', 'Equipment Purchase Loan', 'Purchase machinery, vehicles, or business equipment', 300000, 3000000, 24, ARRAY['business_registration', 'quotation', 'bank_statement'], 1400),
  ('personal_emergency', 'Personal Emergency Loan', 'Handle unexpected medical bills or urgent expenses', 50000, 500000, 3, ARRAY['national_id', 'payslip', 'proof_of_address'], 2000),
  ('education', 'Education Loan', 'Pay for tuition, books, and educational expenses', 100000, 1000000, 12, ARRAY['national_id', 'acceptance_letter', 'proof_of_address'], 1200),
  ('debt_consolidation', 'Debt Consolidation Loan', 'Consolidate multiple debts into one manageable payment', 200000, 2000000, 18, ARRAY['national_id', 'bank_statement', 'debt_statements'], 1600)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.lender_reputation IS 'Tracks lender reputation scores based on disbursement success, disputes, and loan completion';
COMMENT ON TABLE public.lender_saved_searches IS 'Stores lender search preferences for smart matching and notifications';
COMMENT ON TABLE public.loan_request_templates IS 'Pre-defined templates for common loan purposes to help borrowers';
COMMENT ON TABLE public.message_threads IS 'Message threads between lenders and borrowers for loan negotiations';
COMMENT ON TABLE public.messages IS 'Individual messages within threads';
COMMENT ON TABLE public.disputes IS 'Formal dispute cases between lenders and borrowers';
COMMENT ON TABLE public.dispute_evidence IS 'Evidence uploaded by parties in dispute cases';
COMMENT ON TABLE public.market_analytics IS 'Daily aggregated market statistics for trend analysis';

COMMENT ON FUNCTION public.update_lender_reputation IS 'Calculates and updates lender reputation score based on loan performance';
COMMENT ON FUNCTION public.notify_lenders_of_matching_request IS 'Notifies lenders with matching saved searches when new request is created';
COMMENT ON FUNCTION public.file_dispute IS 'Files a formal dispute and creates ticket number';
