-- Enable RLS on all tables
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_currency_allowed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrowers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrower_user_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrower_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lender_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repayment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repayment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lender_reporting_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_hashes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrower_identity_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_signals ENABLE ROW LEVEL SECURITY;

-- Countries and currency policies (public read)
CREATE POLICY "Countries are viewable by all" ON public.countries
  FOR SELECT USING (true);

CREATE POLICY "Currency policies are viewable by all" ON public.country_currency_allowed
  FOR SELECT USING (true);

CREATE POLICY "Country policies are viewable by all" ON public.country_policies
  FOR SELECT USING (true);

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Lenders policies
CREATE POLICY "Lenders can view own record" ON public.lenders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Lenders can update own record" ON public.lenders
  FOR UPDATE USING (auth.uid() = user_id);

-- Borrowers policies (country-scoped)
CREATE POLICY "Lenders/admins can view borrowers in their country" ON public.borrowers
  FOR SELECT USING (
    country_code = jwt_country() AND
    (jwt_role() IN ('lender', 'admin') OR 
     EXISTS (
       SELECT 1 FROM public.borrower_user_links 
       WHERE borrower_id = borrowers.id AND user_id = auth.uid()
     ))
  );

CREATE POLICY "Lenders can create borrowers in their country" ON public.borrowers
  FOR INSERT WITH CHECK (
    country_code = jwt_country() AND 
    jwt_role() = 'lender'
  );

-- Borrower scores policies
CREATE POLICY "Scores viewable by lenders/admins in country or linked borrower" ON public.borrower_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.borrowers b
      WHERE b.id = borrower_scores.borrower_id
        AND b.country_code = jwt_country()
        AND (
          jwt_role() IN ('lender', 'admin') OR
          EXISTS (
            SELECT 1 FROM public.borrower_user_links
            WHERE borrower_id = b.id AND user_id = auth.uid()
          )
        )
    )
  );

-- Risk flags policies (country-scoped)
CREATE POLICY "Risk flags viewable in country" ON public.risk_flags
  FOR SELECT USING (
    country_code = jwt_country() AND
    (jwt_role() IN ('lender', 'admin') OR
     EXISTS (
       SELECT 1 FROM public.borrower_user_links
       WHERE borrower_id = risk_flags.borrower_id AND user_id = auth.uid()
     ))
  );

CREATE POLICY "Lenders can create risk flags in their country" ON public.risk_flags
  FOR INSERT WITH CHECK (
    country_code = jwt_country() AND
    jwt_role() = 'lender'
  );

CREATE POLICY "Lenders/admins can update risk flags in their country" ON public.risk_flags
  FOR UPDATE USING (
    country_code = jwt_country() AND
    jwt_role() IN ('lender', 'admin')
  );

-- Loans policies (country-scoped)
CREATE POLICY "Loans viewable by parties or admins in country" ON public.loans
  FOR SELECT USING (
    country_code = jwt_country() AND
    (
      lender_id = auth.uid() OR
      jwt_role() = 'admin' OR
      EXISTS (
        SELECT 1 FROM public.borrower_user_links
        WHERE borrower_id = loans.borrower_id AND user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Lenders can create loans in their country" ON public.loans
  FOR INSERT WITH CHECK (
    country_code = jwt_country() AND
    lender_id = auth.uid()
  );

-- Repayment schedules policies
CREATE POLICY "Schedules viewable by loan parties" ON public.repayment_schedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = repayment_schedules.loan_id
        AND l.country_code = jwt_country()
        AND (
          l.lender_id = auth.uid() OR
          jwt_role() = 'admin' OR
          EXISTS (
            SELECT 1 FROM public.borrower_user_links
            WHERE borrower_id = l.borrower_id AND user_id = auth.uid()
          )
        )
    )
  );

-- Repayment events policies
CREATE POLICY "Events viewable by loan parties" ON public.repayment_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.repayment_schedules rs
      JOIN public.loans l ON l.id = rs.loan_id
      WHERE rs.id = repayment_events.schedule_id
        AND l.country_code = jwt_country()
        AND (
          l.lender_id = auth.uid() OR
          jwt_role() = 'admin' OR
          EXISTS (
            SELECT 1 FROM public.borrower_user_links
            WHERE borrower_id = l.borrower_id AND user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "Lenders can create repayment events" ON public.repayment_events
  FOR INSERT WITH CHECK (
    reported_by = auth.uid() AND
    jwt_role() = 'lender'
  );

-- Marketplace policies (country-scoped, tier-gated)
CREATE POLICY "Requests viewable in country by Pro+ users" ON public.loan_requests
  FOR SELECT USING (
    country_code = jwt_country() AND
    jwt_tier() = 'PRO_PLUS'
  );

CREATE POLICY "Borrowers can create requests in their country" ON public.loan_requests
  FOR INSERT WITH CHECK (
    country_code = jwt_country() AND
    borrower_user_id = auth.uid() AND
    jwt_role() = 'borrower' AND
    jwt_tier() = 'PRO_PLUS'
  );

CREATE POLICY "Borrowers can update own requests" ON public.loan_requests
  FOR UPDATE USING (
    borrower_user_id = auth.uid()
  );

CREATE POLICY "Offers viewable by request owner or offer maker" ON public.loan_offers
  FOR SELECT USING (
    jwt_tier() = 'PRO_PLUS' AND
    (
      lender_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM public.loan_requests lr
        WHERE lr.id = loan_offers.request_id
          AND lr.borrower_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Lenders can create offers" ON public.loan_offers
  FOR INSERT WITH CHECK (
    lender_id = auth.uid() AND
    jwt_role() = 'lender' AND
    jwt_tier() = 'PRO_PLUS'
  );

CREATE POLICY "Lenders can update own offers" ON public.loan_offers
  FOR UPDATE USING (
    lender_id = auth.uid()
  );

-- Document hashes policies
CREATE POLICY "Docs viewable by owner or linked borrower" ON public.document_hashes
  FOR SELECT USING (
    (lender_id = auth.uid() AND jwt_role() = 'lender') OR
    (jwt_role() = 'admin' AND 
     EXISTS (
       SELECT 1 FROM public.borrowers b
       WHERE b.id = document_hashes.borrower_id
         AND b.country_code = jwt_country()
     )) OR
    EXISTS (
      SELECT 1 FROM public.borrower_user_links
      WHERE borrower_id = document_hashes.borrower_id 
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "Lenders can create doc hashes" ON public.document_hashes
  FOR INSERT WITH CHECK (
    lender_id = auth.uid() AND
    jwt_role() = 'lender'
  );

-- Disputes policies
CREATE POLICY "Disputes viewable by parties or admin" ON public.disputes
  FOR SELECT USING (
    country_code = jwt_country() AND
    (
      created_by = auth.uid() OR
      lender_id = auth.uid() OR
      jwt_role() = 'admin' OR
      EXISTS (
        SELECT 1 FROM public.borrower_user_links
        WHERE borrower_id = disputes.borrower_id AND user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can create disputes in their country" ON public.disputes
  FOR INSERT WITH CHECK (
    country_code = jwt_country() AND
    created_by = auth.uid()
  );

CREATE POLICY "Admins can update disputes in their country" ON public.disputes
  FOR UPDATE USING (
    country_code = jwt_country() AND
    jwt_role() = 'admin'
  );

-- Subscriptions policies
CREATE POLICY "Users can view own subscription" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can manage subscriptions" ON public.subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- Audit logs policies (admins only)
CREATE POLICY "Admins can view audit logs in their country" ON public.audit_logs
  FOR SELECT USING (
    jwt_role() = 'admin' AND
    (country_code IS NULL OR country_code = jwt_country())
  );

-- Search logs policies
CREATE POLICY "Admins can view search logs in their country" ON public.search_logs
  FOR SELECT USING (
    jwt_role() = 'admin' AND
    country_code = jwt_country()
  );

-- Lender scores policies
CREATE POLICY "Lender scores viewable by admin or self" ON public.lender_scores
  FOR SELECT USING (
    lender_id = auth.uid() OR
    jwt_role() = 'admin'
  );

-- Trusted devices policies
CREATE POLICY "Users can view own devices" ON public.trusted_devices
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own devices" ON public.trusted_devices
  FOR ALL USING (auth.uid() = user_id);

-- Job runs policies (admins only)
CREATE POLICY "Admins can view job runs" ON public.job_runs
  FOR SELECT USING (jwt_role() = 'admin');

-- Fraud signals policies
CREATE POLICY "Admins can view fraud signals in their country" ON public.fraud_signals
  FOR SELECT USING (
    jwt_role() = 'admin' AND
    country_code = jwt_country()
  );

-- Grant necessary permissions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;