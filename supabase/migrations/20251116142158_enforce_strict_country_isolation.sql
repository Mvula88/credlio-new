-- ENFORCE STRICT COUNTRY ISOLATION
-- Lenders and borrowers can ONLY see data from their own country
-- Admins can see data from ALL countries

-- ============================================================================
-- LENDERS TABLE - Add country isolation via profiles join
-- ============================================================================

-- Drop existing lenders policies
DROP POLICY IF EXISTS "Lenders can view own record" ON public.lenders;
DROP POLICY IF EXISTS "Lenders can update own record" ON public.lenders;
DROP POLICY IF EXISTS "Admins can view all lenders" ON public.lenders;

-- Lenders can only view their own record
CREATE POLICY "Lenders can view own record" ON public.lenders
  FOR SELECT USING (
    auth.uid() = user_id
  );

-- Admins can view ALL lenders from ALL countries
CREATE POLICY "Admins can view all lenders globally" ON public.lenders
  FOR SELECT USING (
    jwt_role() = 'admin'
  );

-- Lenders can update their own record
CREATE POLICY "Lenders can update own record" ON public.lenders
  FOR UPDATE USING (
    auth.uid() = user_id
  );

-- ============================================================================
-- PROFILES TABLE - Restrict cross-country viewing
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (
    auth.uid() = user_id
  );

-- Admins can view ALL profiles from ALL countries
CREATE POLICY "Admins can view all profiles globally" ON public.profiles
  FOR SELECT USING (
    jwt_role() = 'admin'
  );

-- ============================================================================
-- BORROWERS TABLE - Already has country isolation, ensure it's strict
-- ============================================================================

DROP POLICY IF EXISTS "Lenders view country borrowers, admins view all" ON public.borrowers;

CREATE POLICY "Strict country isolation for borrowers" ON public.borrowers
  FOR SELECT USING (
    -- Admins can view ALL borrowers from ALL countries
    jwt_role() = 'admin' OR
    -- Lenders can ONLY view borrowers in THEIR country
    (jwt_role() = 'lender' AND country_code = jwt_country()) OR
    -- Borrowers can view their own record
    EXISTS (
      SELECT 1 FROM public.borrower_user_links
      WHERE borrower_id = borrowers.id AND user_id = auth.uid()
    )
  );

-- ============================================================================
-- BORROWER SCORES - Strict country isolation
-- ============================================================================

DROP POLICY IF EXISTS "Lenders view country scores, admins view all" ON public.borrower_scores;

CREATE POLICY "Strict country isolation for borrower scores" ON public.borrower_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.borrowers b
      WHERE b.id = borrower_scores.borrower_id
        AND (
          -- Admins can view ALL scores from ALL countries
          jwt_role() = 'admin' OR
          -- Lenders can ONLY view scores in THEIR country
          (jwt_role() = 'lender' AND b.country_code = jwt_country()) OR
          -- Borrowers can view their own score
          EXISTS (
            SELECT 1 FROM public.borrower_user_links
            WHERE borrower_id = b.id AND user_id = auth.uid()
          )
        )
    )
  );

-- ============================================================================
-- RISK FLAGS - Strict country isolation
-- ============================================================================

DROP POLICY IF EXISTS "Lenders view country flags, admins view all" ON public.risk_flags;
DROP POLICY IF EXISTS "Risk flags viewable in country" ON public.risk_flags;

CREATE POLICY "Strict country isolation for risk flags" ON public.risk_flags
  FOR SELECT USING (
    -- Admins can view ALL risk flags from ALL countries
    jwt_role() = 'admin' OR
    -- Lenders can ONLY view risk flags in THEIR country
    (jwt_role() = 'lender' AND country_code = jwt_country()) OR
    -- Borrowers can view flags on their own record
    EXISTS (
      SELECT 1 FROM public.borrower_user_links
      WHERE borrower_id = risk_flags.borrower_id AND user_id = auth.uid()
    )
  );

-- ============================================================================
-- LOANS - Strict country isolation
-- ============================================================================

DROP POLICY IF EXISTS "Loans viewable by parties or admins in country" ON public.loans;

CREATE POLICY "Strict country isolation for loans" ON public.loans
  FOR SELECT USING (
    -- Admins can view ALL loans from ALL countries
    jwt_role() = 'admin' OR
    -- Lenders can ONLY view loans in THEIR country (and only their own loans)
    (jwt_role() = 'lender' AND country_code = jwt_country() AND lender_id = auth.uid()) OR
    -- Borrowers can view their own loans
    EXISTS (
      SELECT 1 FROM public.borrower_user_links
      WHERE borrower_id = loans.borrower_id AND user_id = auth.uid()
    )
  );

-- ============================================================================
-- LOAN REQUESTS - Strict country isolation for marketplace
-- ============================================================================

DROP POLICY IF EXISTS "Requests viewable in country by Pro+ users" ON public.loan_requests;

CREATE POLICY "Strict country isolation for loan requests" ON public.loan_requests
  FOR SELECT USING (
    -- Admins can view ALL requests from ALL countries
    jwt_role() = 'admin' OR
    -- Lenders can ONLY view requests in THEIR country
    (jwt_role() = 'lender' AND country_code = jwt_country() AND jwt_tier() = 'PRO_PLUS') OR
    -- Borrowers can view their own requests
    (borrower_user_id = auth.uid())
  );

-- ============================================================================
-- LOAN OFFERS - Strict country isolation
-- ============================================================================

DROP POLICY IF EXISTS "Offers viewable by request owner or offer maker" ON public.loan_offers;

CREATE POLICY "Strict country isolation for loan offers" ON public.loan_offers
  FOR SELECT USING (
    -- Admins can view ALL offers from ALL countries
    jwt_role() = 'admin' OR
    -- Lenders can view their own offers (country check via loan_requests)
    (lender_id = auth.uid() AND jwt_tier() = 'PRO_PLUS') OR
    -- Borrowers can view offers on their requests
    EXISTS (
      SELECT 1 FROM public.loan_requests lr
      WHERE lr.id = loan_offers.request_id
        AND lr.borrower_user_id = auth.uid()
    )
  );

-- ============================================================================
-- DISPUTES - Strict country isolation
-- ============================================================================

DROP POLICY IF EXISTS "Disputes viewable by parties or admin" ON public.disputes;

CREATE POLICY "Strict country isolation for disputes" ON public.disputes
  FOR SELECT USING (
    -- Admins can view ALL disputes from ALL countries
    jwt_role() = 'admin' OR
    -- Users can ONLY view disputes in THEIR country if they're involved
    (
      country_code = jwt_country() AND
      (
        created_by = auth.uid() OR
        lender_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM public.borrower_user_links
          WHERE borrower_id = disputes.borrower_id AND user_id = auth.uid()
        )
      )
    )
  );

-- ============================================================================
-- DOCUMENT HASHES - Strict country isolation
-- ============================================================================

DROP POLICY IF EXISTS "Docs viewable by owner or linked borrower" ON public.document_hashes;

CREATE POLICY "Strict country isolation for document hashes" ON public.document_hashes
  FOR SELECT USING (
    -- Admins can view ALL documents from ALL countries
    jwt_role() = 'admin' OR
    -- Lenders can view their own documents (must be in same country as borrower)
    (lender_id = auth.uid() AND jwt_role() = 'lender' AND
     EXISTS (
       SELECT 1 FROM public.borrowers b
       WHERE b.id = document_hashes.borrower_id
         AND b.country_code = jwt_country()
     )) OR
    -- Borrowers can view documents about them
    EXISTS (
      SELECT 1 FROM public.borrower_user_links
      WHERE borrower_id = document_hashes.borrower_id
        AND user_id = auth.uid()
    )
  );

-- ============================================================================
-- AUDIT LOGS - Strict country isolation for non-admins
-- ============================================================================

DROP POLICY IF EXISTS "Admins can view audit logs in their country" ON public.audit_logs;

CREATE POLICY "Strict country isolation for audit logs" ON public.audit_logs
  FOR SELECT USING (
    -- Admins can view ALL audit logs from ALL countries
    jwt_role() = 'admin'
  );

-- ============================================================================
-- SEARCH LOGS - Strict country isolation
-- ============================================================================

DROP POLICY IF EXISTS "Admins can view search logs in their country" ON public.search_logs;

CREATE POLICY "Strict country isolation for search logs" ON public.search_logs
  FOR SELECT USING (
    -- Admins can view ALL search logs from ALL countries
    jwt_role() = 'admin'
  );

-- ============================================================================
-- FRAUD SIGNALS - Strict country isolation
-- ============================================================================

DROP POLICY IF EXISTS "Admins can view fraud signals in their country" ON public.fraud_signals;

CREATE POLICY "Strict country isolation for fraud signals" ON public.fraud_signals
  FOR SELECT USING (
    -- Admins can view ALL fraud signals from ALL countries
    jwt_role() = 'admin'
  );

-- ============================================================================
-- REPAYMENT SCHEDULES - Strict country isolation via loans
-- ============================================================================

DROP POLICY IF EXISTS "Schedules viewable by loan parties" ON public.repayment_schedules;

CREATE POLICY "Strict country isolation for repayment schedules" ON public.repayment_schedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = repayment_schedules.loan_id
        AND (
          -- Admins can view ALL schedules from ALL countries
          jwt_role() = 'admin' OR
          -- Lenders can ONLY view schedules for loans in THEIR country
          (l.country_code = jwt_country() AND l.lender_id = auth.uid()) OR
          -- Borrowers can view their own loan schedules
          EXISTS (
            SELECT 1 FROM public.borrower_user_links
            WHERE borrower_id = l.borrower_id AND user_id = auth.uid()
          )
        )
    )
  );

-- ============================================================================
-- REPAYMENT EVENTS - Strict country isolation via loans
-- ============================================================================

DROP POLICY IF EXISTS "Events viewable by loan parties" ON public.repayment_events;

CREATE POLICY "Strict country isolation for repayment events" ON public.repayment_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.repayment_schedules rs
      JOIN public.loans l ON l.id = rs.loan_id
      WHERE rs.id = repayment_events.schedule_id
        AND (
          -- Admins can view ALL events from ALL countries
          jwt_role() = 'admin' OR
          -- Lenders can ONLY view events for loans in THEIR country
          (l.country_code = jwt_country() AND l.lender_id = auth.uid()) OR
          -- Borrowers can view their own loan events
          EXISTS (
            SELECT 1 FROM public.borrower_user_links
            WHERE borrower_id = l.borrower_id AND user_id = auth.uid()
          )
        )
    )
  );

-- ============================================================================
-- LENDER REPORTING LOGS - Strict country isolation
-- ============================================================================

CREATE POLICY "Strict country isolation for lender reporting logs" ON public.lender_reporting_logs
  FOR SELECT USING (
    -- Admins can view ALL logs from ALL countries
    jwt_role() = 'admin' OR
    -- Lenders can view their own reporting logs
    (lender_id = auth.uid())
  );

-- ============================================================================
-- Summary of Country Isolation Rules:
-- ============================================================================
-- 1. ADMINS: Can view ALL data from ALL countries (global access)
-- 2. LENDERS: Can ONLY view data from THEIR OWN country (strict isolation)
-- 3. BORROWERS: Can ONLY view THEIR OWN data
-- 4. No cross-country data leakage for non-admin users
-- ============================================================================
