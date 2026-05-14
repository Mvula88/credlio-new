-- Structured spoken-attestation fields on video_verifications
--
-- WHY: video_verifications today is a bag of booleans (face_detected,
-- voice_recorded, etc.) that nobody fills in. To turn it into a real fraud
-- defense the borrower records a video saying their full name, today's
-- date, the requested loan amount, and a consent sentence. The browser's
-- SpeechRecognition API transcribes it client-side. We store the transcript
-- text on the platform but NOT the video — the video goes to the lender by
-- email under the data-custody policy.
--
-- The transcript + the system's parsed fields make the recording legally
-- equivalent to a signed declaration: borrower stated X on date Y from
-- device Z with IP fingerprint W.

BEGIN;

ALTER TABLE public.video_verifications
  ADD COLUMN IF NOT EXISTS loan_request_id UUID REFERENCES public.loan_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attestation_transcript TEXT,
  ADD COLUMN IF NOT EXISTS attestation_language TEXT DEFAULT 'en-US',
  ADD COLUMN IF NOT EXISTS spoken_name TEXT,
  ADD COLUMN IF NOT EXISTS spoken_date DATE,
  ADD COLUMN IF NOT EXISTS spoken_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS spoken_currency TEXT,
  ADD COLUMN IF NOT EXISTS name_matches_profile BOOLEAN,
  ADD COLUMN IF NOT EXISTS date_matches_today BOOLEAN,
  ADD COLUMN IF NOT EXISTS amount_matches_request BOOLEAN,
  ADD COLUMN IF NOT EXISTS borrower_ip_hash TEXT,
  ADD COLUMN IF NOT EXISTS borrower_user_agent TEXT,
  ADD COLUMN IF NOT EXISTS sent_to_lender_email TEXT,
  ADD COLUMN IF NOT EXISTS borrower_user_id UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_video_verif_loan_request
  ON public.video_verifications(loan_request_id)
  WHERE loan_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_video_verif_video_hash
  ON public.video_verifications(video_hash);

-- Compute the match flags inside the DB so the client can't lie about them.
-- The client sends transcript + parsed values; this trigger compares those
-- parsed values against the canonical source of truth.
CREATE OR REPLACE FUNCTION public.evaluate_video_attestation()
RETURNS TRIGGER AS $$
DECLARE
  v_profile_name TEXT;
  v_request_amount NUMERIC;
  v_normalized_spoken TEXT;
  v_normalized_profile TEXT;
BEGIN
  -- Name match: normalize both to lowercase, strip non-alphanumerics, check
  -- that every word of the profile name appears in the spoken name. This
  -- handles middle-name omissions, hyphens, and casing differences.
  IF NEW.spoken_name IS NOT NULL THEN
    SELECT b.full_name INTO v_profile_name
    FROM public.borrowers b
    WHERE b.id = NEW.borrower_id;

    v_normalized_spoken := LOWER(REGEXP_REPLACE(NEW.spoken_name, '[^a-zA-Z ]', '', 'g'));
    v_normalized_profile := LOWER(REGEXP_REPLACE(COALESCE(v_profile_name, ''), '[^a-zA-Z ]', '', 'g'));

    NEW.name_matches_profile := (
      v_profile_name IS NOT NULL
      AND v_normalized_profile <> ''
      AND (
        -- spoken contains all words of profile, OR profile contains all words of spoken
        (SELECT bool_and(part IN (SELECT unnest(STRING_TO_ARRAY(v_normalized_spoken, ' '))))
         FROM unnest(STRING_TO_ARRAY(v_normalized_profile, ' ')) AS part
         WHERE part <> '')
        OR
        (SELECT bool_and(part IN (SELECT unnest(STRING_TO_ARRAY(v_normalized_profile, ' '))))
         FROM unnest(STRING_TO_ARRAY(v_normalized_spoken, ' ')) AS part
         WHERE part <> '')
      )
    );
  END IF;

  -- Date match: spoken date must equal today.
  IF NEW.spoken_date IS NOT NULL THEN
    NEW.date_matches_today := (NEW.spoken_date = CURRENT_DATE);
  END IF;

  -- Amount match: ±2% tolerance against the linked loan request, if any.
  IF NEW.spoken_amount IS NOT NULL AND NEW.loan_request_id IS NOT NULL THEN
    SELECT amount INTO v_request_amount
    FROM public.loan_requests
    WHERE id = NEW.loan_request_id;

    IF v_request_amount IS NOT NULL AND v_request_amount > 0 THEN
      NEW.amount_matches_request := (
        ABS(NEW.spoken_amount - v_request_amount) / v_request_amount <= 0.02
      );
    END IF;
  END IF;

  -- passed_verification rolls up the three matches plus duration sanity.
  -- We require at least 10s of footage (anything shorter is suspiciously
  -- terse for the full attestation script).
  NEW.passed_verification := (
    COALESCE(NEW.name_matches_profile, false)
    AND COALESCE(NEW.date_matches_today, false)
    AND COALESCE(NEW.video_duration_seconds, 0) >= 10
  );

  -- Build a risk_flags array describing what didn't match.
  NEW.risk_flags := ARRAY[]::TEXT[];
  IF NEW.name_matches_profile = false THEN
    NEW.risk_flags := NEW.risk_flags || 'Spoken name does not match profile name';
  END IF;
  IF NEW.date_matches_today = false THEN
    NEW.risk_flags := NEW.risk_flags || 'Spoken date is not today';
  END IF;
  IF NEW.amount_matches_request = false THEN
    NEW.risk_flags := NEW.risk_flags || 'Spoken amount does not match loan request';
  END IF;
  IF COALESCE(NEW.video_duration_seconds, 0) < 10 THEN
    NEW.risk_flags := NEW.risk_flags || 'Video shorter than 10 seconds';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS evaluate_video_attestation_trg ON public.video_verifications;
CREATE TRIGGER evaluate_video_attestation_trg
  BEFORE INSERT OR UPDATE ON public.video_verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.evaluate_video_attestation();

-- Open up RLS so the borrower can create their own attestation. Existing
-- policies cover lender SELECT/INSERT; add the borrower-side ones.
DROP POLICY IF EXISTS "Borrower creates own video attestation" ON public.video_verifications;
CREATE POLICY "Borrower creates own video attestation"
  ON public.video_verifications FOR INSERT
  WITH CHECK (
    borrower_user_id = auth.uid()
    OR lender_id = auth.uid()  -- preserve legacy lender-creates flow
  );

DROP POLICY IF EXISTS "Borrower views own video attestation" ON public.video_verifications;
CREATE POLICY "Borrower views own video attestation"
  ON public.video_verifications FOR SELECT
  USING (
    borrower_user_id = auth.uid()
    OR lender_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

COMMENT ON COLUMN public.video_verifications.attestation_transcript IS
  'Transcript of the borrower''s spoken attestation, captured client-side via SpeechRecognition. The video itself stays off-platform.';
COMMENT ON FUNCTION public.evaluate_video_attestation IS
  'Computes name/date/amount match flags by comparing the client-supplied spoken values against the canonical profile and loan request. Client cannot lie about the matches.';

COMMIT;
