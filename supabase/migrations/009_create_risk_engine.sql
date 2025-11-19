-- Function to calculate borrower score
CREATE OR REPLACE FUNCTION public.calculate_borrower_score(p_borrower_id UUID)
RETURNS INT AS $$
DECLARE
  v_base_score INT := 700;
  v_final_score INT;
  v_deductions JSONB := '{}';
  v_late_1_7_count INT;
  v_late_8_30_count INT;
  v_late_31_60_count INT;
  v_default_count INT;
BEGIN
  -- Count open risk flags by type
  SELECT 
    COUNT(*) FILTER (WHERE type = 'LATE_1_7' AND resolved_at IS NULL),
    COUNT(*) FILTER (WHERE type = 'LATE_8_30' AND resolved_at IS NULL),
    COUNT(*) FILTER (WHERE type = 'LATE_31_60' AND resolved_at IS NULL),
    COUNT(*) FILTER (WHERE type = 'DEFAULT' AND resolved_at IS NULL)
  INTO 
    v_late_1_7_count,
    v_late_8_30_count,
    v_late_31_60_count,
    v_default_count
  FROM public.risk_flags
  WHERE borrower_id = p_borrower_id;
  
  -- Apply deductions
  v_final_score := v_base_score;
  
  -- -10 points per LATE_1_7
  IF v_late_1_7_count > 0 THEN
    v_final_score := v_final_score - (v_late_1_7_count * 10);
    v_deductions := v_deductions || jsonb_build_object('late_1_7', v_late_1_7_count * 10);
  END IF;
  
  -- -35 points per LATE_8_30
  IF v_late_8_30_count > 0 THEN
    v_final_score := v_final_score - (v_late_8_30_count * 35);
    v_deductions := v_deductions || jsonb_build_object('late_8_30', v_late_8_30_count * 35);
  END IF;
  
  -- -70 points per LATE_31_60
  IF v_late_31_60_count > 0 THEN
    v_final_score := v_final_score - (v_late_31_60_count * 70);
    v_deductions := v_deductions || jsonb_build_object('late_31_60', v_late_31_60_count * 70);
  END IF;
  
  -- -200 points per DEFAULT
  IF v_default_count > 0 THEN
    v_final_score := v_final_score - (v_default_count * 200);
    v_deductions := v_deductions || jsonb_build_object('default', v_default_count * 200);
  END IF;
  
  -- Apply floor of 300
  v_final_score := GREATEST(v_final_score, 300);
  
  -- Update the score
  INSERT INTO public.borrower_scores (borrower_id, score, score_factors)
  VALUES (p_borrower_id, v_final_score, v_deductions)
  ON CONFLICT (borrower_id) 
  DO UPDATE SET 
    score = v_final_score,
    score_factors = v_deductions,
    last_calculated_at = NOW();
  
  RETURN v_final_score;
END;
$$ LANGUAGE plpgsql;

-- Main risk refresh function (to be called by cron)
CREATE OR REPLACE FUNCTION public.refresh_risks_and_scores(p_grace_hours INT DEFAULT 48)
RETURNS JSONB AS $$
DECLARE
  v_job_id UUID;
  v_records_processed INT := 0;
  v_flags_created INT := 0;
  v_scores_updated INT := 0;
  v_grace_interval INTERVAL;
  v_schedule RECORD;
  v_borrower_id UUID;
BEGIN
  -- Create job run record
  INSERT INTO public.job_runs (job_name, started_at, status)
  VALUES ('refresh_risks_and_scores', NOW(), 'running')
  RETURNING id INTO v_job_id;
  
  v_grace_interval := p_grace_hours * INTERVAL '1 hour';
  
  -- Find all overdue schedules without sufficient payments
  FOR v_schedule IN
    SELECT 
      rs.id as schedule_id,
      rs.loan_id,
      rs.due_date,
      rs.amount_due_minor,
      l.borrower_id,
      l.lender_id,
      l.country_code,
      COALESCE(SUM(re.amount_paid_minor), 0) as amount_paid,
      NOW() - rs.due_date::timestamptz as days_overdue
    FROM public.repayment_schedules rs
    JOIN public.loans l ON l.id = rs.loan_id
    LEFT JOIN public.repayment_events re ON re.schedule_id = rs.id
    WHERE l.status = 'active'
      AND rs.due_date < CURRENT_DATE
    GROUP BY rs.id, rs.loan_id, rs.due_date, rs.amount_due_minor, 
             l.borrower_id, l.lender_id, l.country_code
    HAVING COALESCE(SUM(re.amount_paid_minor), 0) < rs.amount_due_minor
  LOOP
    v_records_processed := v_records_processed + 1;
    
    -- Check if lender has reported within grace period
    IF NOT EXISTS (
      SELECT 1 FROM public.lender_reporting_logs
      WHERE schedule_id = v_schedule.schedule_id
        AND lender_id = v_schedule.lender_id
        AND reported_at > (v_schedule.due_date::timestamptz + v_grace_interval)
    ) THEN
      -- Determine risk type based on days overdue
      DECLARE
        v_risk_type risk_type;
      BEGIN
        IF v_schedule.days_overdue <= INTERVAL '7 days' THEN
          v_risk_type := 'LATE_1_7';
        ELSIF v_schedule.days_overdue <= INTERVAL '30 days' THEN
          v_risk_type := 'LATE_8_30';
        ELSIF v_schedule.days_overdue <= INTERVAL '60 days' THEN
          v_risk_type := 'LATE_31_60';
        ELSE
          v_risk_type := 'DEFAULT';
        END IF;
        
        -- Create system-auto risk flag if not exists
        IF NOT EXISTS (
          SELECT 1 FROM public.risk_flags
          WHERE borrower_id = v_schedule.borrower_id
            AND origin = 'SYSTEM_AUTO'
            AND type = v_risk_type
            AND resolved_at IS NULL
        ) THEN
          INSERT INTO public.risk_flags (
            borrower_id,
            country_code,
            origin,
            type,
            reason,
            amount_at_issue_minor
          ) VALUES (
            v_schedule.borrower_id,
            v_schedule.country_code,
            'SYSTEM_AUTO',
            v_risk_type,
            'Auto-flagged: Payment overdue by ' || EXTRACT(DAY FROM v_schedule.days_overdue) || ' days without lender update',
            v_schedule.amount_due_minor - v_schedule.amount_paid
          );
          
          v_flags_created := v_flags_created + 1;
        END IF;
        
        -- Create missed reporting log
        INSERT INTO public.lender_reporting_logs (
          schedule_id,
          lender_id,
          expected_report_by,
          status
        ) VALUES (
          v_schedule.schedule_id,
          v_schedule.lender_id,
          v_schedule.due_date::timestamptz + v_grace_interval,
          'missed'
        ) ON CONFLICT DO NOTHING;
      END;
    END IF;
  END LOOP;
  
  -- Recalculate scores for all borrowers with risk flags
  FOR v_borrower_id IN
    SELECT DISTINCT borrower_id 
    FROM public.risk_flags 
    WHERE created_at > NOW() - INTERVAL '1 day'
       OR resolved_at > NOW() - INTERVAL '1 day'
  LOOP
    PERFORM calculate_borrower_score(v_borrower_id);
    v_scores_updated := v_scores_updated + 1;
  END LOOP;
  
  -- Update job run
  UPDATE public.job_runs
  SET 
    finished_at = NOW(),
    status = 'completed',
    records_processed = v_records_processed
  WHERE id = v_job_id;
  
  RETURN jsonb_build_object(
    'job_id', v_job_id,
    'records_processed', v_records_processed,
    'flags_created', v_flags_created,
    'scores_updated', v_scores_updated
  );
END;
$$ LANGUAGE plpgsql;

-- Function to resolve a risk flag
CREATE OR REPLACE FUNCTION public.resolve_risk_flag(
  p_flag_id UUID,
  p_reason TEXT
)
RETURNS VOID AS $$
DECLARE
  v_borrower_id UUID;
  v_country TEXT;
BEGIN
  -- Check caller is lender or admin
  IF jwt_role() NOT IN ('lender', 'admin') THEN
    RAISE EXCEPTION 'Only lenders and admins can resolve risk flags';
  END IF;
  
  -- Get flag details
  SELECT borrower_id, country_code 
  INTO v_borrower_id, v_country
  FROM public.risk_flags
  WHERE id = p_flag_id;
  
  -- Check country match
  IF v_country != jwt_country() THEN
    RAISE EXCEPTION 'Cannot resolve flag from different country';
  END IF;
  
  -- Resolve the flag
  UPDATE public.risk_flags
  SET 
    resolved_at = NOW(),
    resolved_by = jwt_uid(),
    resolution_reason = p_reason,
    type = 'CLEARED'
  WHERE id = p_flag_id;
  
  -- Recalculate score
  PERFORM calculate_borrower_score(v_borrower_id);
  
  -- Log the action
  INSERT INTO public.audit_logs (actor_id, actor_role, action, target, target_id, country_code)
  VALUES (jwt_uid(), jwt_role(), 'resolve_risk', 'risk_flag', p_flag_id, v_country);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to link borrower account after onboarding
CREATE OR REPLACE FUNCTION public.link_borrower_user(
  p_national_id TEXT,
  p_phone TEXT,
  p_date_of_birth DATE
)
RETURNS UUID AS $$
DECLARE
  v_borrower_id UUID;
  v_id_hash TEXT;
  v_user_id UUID;
BEGIN
  -- Get current user
  v_user_id := jwt_uid();
  
  -- Check caller is a borrower
  IF jwt_role() != 'borrower' THEN
    RAISE EXCEPTION 'Only borrowers can link accounts';
  END IF;
  
  -- Hash the national ID
  v_id_hash := hash_national_id(p_national_id);
  
  -- Find matching borrower record
  SELECT id INTO v_borrower_id
  FROM public.borrowers
  WHERE country_code = jwt_country()
    AND national_id_hash = v_id_hash
    AND phone_e164 = p_phone
    AND date_of_birth = p_date_of_birth;
  
  IF v_borrower_id IS NULL THEN
    -- Create new borrower record if not found
    INSERT INTO public.borrowers (
      country_code,
      full_name,
      national_id_hash,
      phone_e164,
      date_of_birth
    ) VALUES (
      jwt_country(),
      (SELECT full_name FROM public.profiles WHERE user_id = v_user_id),
      v_id_hash,
      p_phone,
      p_date_of_birth
    ) RETURNING id INTO v_borrower_id;
    
    -- Create initial score
    INSERT INTO public.borrower_scores (borrower_id, score)
    VALUES (v_borrower_id, (SELECT default_credit_score FROM public.country_policies WHERE country_code = jwt_country()));
    
    -- Create identity index
    INSERT INTO public.borrower_identity_index (borrower_id, id_hash, phone_e164, date_of_birth)
    VALUES (v_borrower_id, v_id_hash, p_phone, p_date_of_birth);
  END IF;
  
  -- Create link
  INSERT INTO public.borrower_user_links (borrower_id, user_id)
  VALUES (v_borrower_id, v_user_id)
  ON CONFLICT DO NOTHING;
  
  -- Mark onboarding as complete
  UPDATE public.profiles
  SET onboarding_completed = TRUE
  WHERE user_id = v_user_id;
  
  RETURN v_borrower_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;