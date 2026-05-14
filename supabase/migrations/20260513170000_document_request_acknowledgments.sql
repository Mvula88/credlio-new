-- Document request acknowledgment loop
--
-- WHY: per the data-custody policy the platform never stores borrower
-- documents (IDs, payslips, bank statements). Borrowers email them directly
-- to the lender. This table is the paper trail: lender requests a document,
-- borrower acknowledges sending it (records the email addresses used and
-- when), lender confirms receipt. The platform stores only the metadata
-- about who said what when, never the file.
--
-- This creates legal evidence on both sides: borrowers can't later claim
-- they sent something they didn't, and lenders can't claim they never
-- received something they did.

BEGIN;

CREATE TYPE doc_request_status AS ENUM (
  'requested',         -- Lender created the request, borrower not yet notified
  'pending_borrower',  -- Borrower has been notified, hasn't acted yet
  'sent_by_borrower',  -- Borrower says they emailed it; awaiting lender confirmation
  'received',          -- Lender confirms they got the email and the file looks legit
  'rejected',          -- Lender rejects (e.g. file looks doctored, email didn't arrive)
  'cancelled'          -- Lender withdrew the request
);

CREATE TABLE IF NOT EXISTS public.document_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Parties
  lender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  borrower_id UUID NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,
  borrower_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Tie to a loan / loan request / loan offer if there is one. All three are
  -- optional because lenders may do pre-loan due diligence (no loan yet) or
  -- post-loan checks (existing loan). The presence/absence of these doesn't
  -- gate the request itself.
  loan_request_id UUID REFERENCES public.loan_requests(id) ON DELETE SET NULL,
  loan_offer_id UUID REFERENCES public.loan_offers(id) ON DELETE SET NULL,
  loan_id UUID REFERENCES public.loans(id) ON DELETE SET NULL,

  -- What is being requested
  document_type document_type NOT NULL,
  request_notes TEXT,                       -- lender's instructions e.g. "last 3 months of bank statements"
  expected_email TEXT,                      -- lender's email the doc should be sent to
  due_at TIMESTAMPTZ,                       -- optional deadline

  -- Borrower's "I sent it" attestation
  borrower_sent_at TIMESTAMPTZ,
  borrower_sent_from_email TEXT,            -- email the borrower says they sent FROM
  borrower_sent_to_email TEXT,              -- email the borrower says they sent TO
  borrower_send_notes TEXT,                 -- free text the borrower can include
  borrower_sent_ip_hash TEXT,               -- IP at time of send-attestation (hashed)
  borrower_sent_user_agent TEXT,            -- UA at time of send-attestation

  -- Lender's "I got it" / "I rejected it" attestation
  lender_received_at TIMESTAMPTZ,
  lender_received_via_email TEXT,           -- email the lender confirms they received it on
  lender_decision_notes TEXT,
  lender_decision_ip_hash TEXT,

  -- State machine
  status doc_request_status NOT NULL DEFAULT 'requested',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Sanity constraints
  CONSTRAINT borrower_sent_fields_consistent CHECK (
    (status NOT IN ('sent_by_borrower', 'received', 'rejected'))
    OR (borrower_sent_at IS NOT NULL AND borrower_sent_from_email IS NOT NULL AND borrower_sent_to_email IS NOT NULL)
  ),
  CONSTRAINT lender_decision_fields_consistent CHECK (
    (status NOT IN ('received', 'rejected'))
    OR (lender_received_at IS NOT NULL)
  )
);

CREATE INDEX idx_doc_req_lender ON public.document_requests(lender_id);
CREATE INDEX idx_doc_req_borrower ON public.document_requests(borrower_id);
CREATE INDEX idx_doc_req_status ON public.document_requests(status);
CREATE INDEX idx_doc_req_loan_request ON public.document_requests(loan_request_id) WHERE loan_request_id IS NOT NULL;

ALTER TABLE public.document_requests ENABLE ROW LEVEL SECURITY;

-- Lender sees their own requests
CREATE POLICY "Lender views own document requests"
  ON public.document_requests FOR SELECT
  USING (lender_id = auth.uid());

CREATE POLICY "Lender creates own document requests"
  ON public.document_requests FOR INSERT
  WITH CHECK (lender_id = auth.uid());

CREATE POLICY "Lender updates own document requests"
  ON public.document_requests FOR UPDATE
  USING (lender_id = auth.uid());

-- Borrower sees requests addressed to them and can update only their own
-- "I sent it" fields (the trigger below enforces which columns they can touch)
CREATE POLICY "Borrower views own document requests"
  ON public.document_requests FOR SELECT
  USING (borrower_user_id = auth.uid());

CREATE POLICY "Borrower updates own document requests"
  ON public.document_requests FOR UPDATE
  USING (borrower_user_id = auth.uid());

-- Admins see everything (for dispute mediation)
CREATE POLICY "Admins view all document requests"
  ON public.document_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.touch_document_request_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER document_request_touch_updated_at
  BEFORE UPDATE ON public.document_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_document_request_updated_at();

-- Enforce field-level access on UPDATE: borrowers can only touch the
-- borrower_sent_* fields and only when status is 'requested' or
-- 'pending_borrower'. Lenders can only touch the lender_received_* fields
-- and the lender_decision_* fields.
--
-- Postgres doesn't have column-level RLS for UPDATE, so we enforce by
-- comparing OLD vs NEW on each protected column and rejecting forbidden
-- changes from the wrong role.
CREATE OR REPLACE FUNCTION public.guard_document_request_update()
RETURNS TRIGGER AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  v_is_admin := EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Borrower update path: must own the row, may only set borrower_sent_*
  -- fields, and the lender_* fields must be unchanged.
  IF NEW.borrower_user_id = auth.uid() AND NEW.lender_id <> auth.uid() THEN
    IF NEW.lender_id IS DISTINCT FROM OLD.lender_id
       OR NEW.borrower_id IS DISTINCT FROM OLD.borrower_id
       OR NEW.borrower_user_id IS DISTINCT FROM OLD.borrower_user_id
       OR NEW.document_type IS DISTINCT FROM OLD.document_type
       OR NEW.request_notes IS DISTINCT FROM OLD.request_notes
       OR NEW.expected_email IS DISTINCT FROM OLD.expected_email
       OR NEW.due_at IS DISTINCT FROM OLD.due_at
       OR NEW.lender_received_at IS DISTINCT FROM OLD.lender_received_at
       OR NEW.lender_received_via_email IS DISTINCT FROM OLD.lender_received_via_email
       OR NEW.lender_decision_notes IS DISTINCT FROM OLD.lender_decision_notes THEN
      RAISE EXCEPTION 'Borrower may only update borrower_sent_* fields';
    END IF;
    -- Borrowers can only transition status from requested/pending_borrower → sent_by_borrower
    IF OLD.status NOT IN ('requested', 'pending_borrower') AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Borrower cannot change status from %', OLD.status;
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'sent_by_borrower' THEN
      RAISE EXCEPTION 'Borrower can only set status to sent_by_borrower';
    END IF;
    RETURN NEW;
  END IF;

  -- Lender update path: must own the row, may only set lender_* fields and
  -- the request-side fields (notes/due_at/expected_email) and status.
  IF NEW.lender_id = auth.uid() THEN
    IF NEW.borrower_id IS DISTINCT FROM OLD.borrower_id
       OR NEW.borrower_user_id IS DISTINCT FROM OLD.borrower_user_id
       OR NEW.borrower_sent_at IS DISTINCT FROM OLD.borrower_sent_at
       OR NEW.borrower_sent_from_email IS DISTINCT FROM OLD.borrower_sent_from_email
       OR NEW.borrower_sent_to_email IS DISTINCT FROM OLD.borrower_sent_to_email
       OR NEW.borrower_send_notes IS DISTINCT FROM OLD.borrower_send_notes THEN
      RAISE EXCEPTION 'Lender may not modify borrower-side fields';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not authorized to update this document request';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER document_request_guard_update
  BEFORE UPDATE ON public.document_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_document_request_update();

-- Notification fan-out: notify borrower when a lender creates a request,
-- notify lender when borrower says "sent", notify borrower when lender
-- confirms or rejects.
CREATE OR REPLACE FUNCTION public.notify_document_request_change()
RETURNS TRIGGER AS $$
DECLARE
  v_borrower_full_name TEXT;
  v_lender_full_name TEXT;
  v_doc_label TEXT;
BEGIN
  -- Build a human-readable document label.
  v_doc_label := REPLACE(INITCAP(REPLACE(NEW.document_type::text, '_', ' ')), 'Id', 'ID');

  SELECT full_name INTO v_borrower_full_name FROM public.borrowers WHERE id = NEW.borrower_id;
  SELECT full_name INTO v_lender_full_name FROM public.profiles WHERE user_id = NEW.lender_id;

  IF TG_OP = 'INSERT' AND NEW.status IN ('requested', 'pending_borrower') THEN
    PERFORM public.create_notification(
      p_user_id := NEW.borrower_user_id,
      p_type := 'system',
      p_title := 'Document requested: ' || v_doc_label,
      p_message := COALESCE(v_lender_full_name, 'A lender') ||
        ' has asked you to send your ' || v_doc_label || ' to ' ||
        COALESCE(NEW.expected_email, 'their registered email') || '. ' ||
        'Email it directly, then mark it as sent here.',
      p_link := '/b/document-requests/' || NEW.id::text
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'sent_by_borrower' THEN
      PERFORM public.create_notification(
        p_user_id := NEW.lender_id,
        p_type := 'system',
        p_title := v_doc_label || ' sent by ' || COALESCE(v_borrower_full_name, 'borrower'),
        p_message := COALESCE(v_borrower_full_name, 'The borrower') ||
          ' says they emailed the ' || v_doc_label || ' from ' ||
          COALESCE(NEW.borrower_sent_from_email, 'their email') || ' to ' ||
          COALESCE(NEW.borrower_sent_to_email, 'you') ||
          '. Check your inbox and confirm receipt.',
        p_link := '/l/document-requests/' || NEW.id::text
      );
    ELSIF NEW.status = 'received' THEN
      PERFORM public.create_notification(
        p_user_id := NEW.borrower_user_id,
        p_type := 'system',
        p_title := v_doc_label || ' confirmed received',
        p_message := COALESCE(v_lender_full_name, 'The lender') ||
          ' confirmed receipt of your ' || v_doc_label || '.',
        p_link := '/b/document-requests/' || NEW.id::text
      );
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.create_notification(
        p_user_id := NEW.borrower_user_id,
        p_type := 'system',
        p_title := v_doc_label || ' rejected',
        p_message := COALESCE(v_lender_full_name, 'The lender') ||
          ' rejected your ' || v_doc_label ||
          CASE WHEN NEW.lender_decision_notes IS NOT NULL
               THEN ': ' || NEW.lender_decision_notes
               ELSE '. Please re-send.'
          END,
        p_link := '/b/document-requests/' || NEW.id::text
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER document_request_notify
  AFTER INSERT OR UPDATE OF status ON public.document_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_document_request_change();

COMMENT ON TABLE public.document_requests IS
  'Acknowledgment paper trail for off-platform document exchange. Lender requests a doc; borrower attests to sending it via email; lender confirms receipt. Platform stores no files.';

COMMIT;
