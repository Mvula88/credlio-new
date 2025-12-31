-- Fix risk flag trigger - don't notify the creator about their own action
-- Instead, notify OTHER lenders who have active loans with this borrower

CREATE OR REPLACE FUNCTION public.notify_risk_flag_added()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_lender RECORD;
  v_borrower_name TEXT;
BEGIN
  -- Get borrower name
  SELECT full_name INTO v_borrower_name
  FROM public.borrowers
  WHERE id = NEW.borrower_id;

  -- Notify all OTHER lenders who have active loans with this borrower
  -- (not the creator of the flag)
  FOR v_lender IN
    SELECT DISTINCT l.lender_id
    FROM public.loans l
    WHERE l.borrower_id = NEW.borrower_id
      AND l.status IN ('active', 'pending_signatures', 'pending_disbursement')
      AND l.lender_id != NEW.created_by  -- Don't notify the creator
  LOOP
    PERFORM public.create_notification(
      v_lender.lender_id,
      'risk_flag_added',
      'Risk Flag Warning',
      'A borrower you have an active loan with (' || COALESCE(v_borrower_name, 'Unknown') || ') has been flagged by another lender.',
      '/l/loans',
      'high'
    );
  END LOOP;

  RETURN NEW;
END;
$func$;
