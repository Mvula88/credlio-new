-- Fix risk flag trigger - risk_flags table uses 'created_by' not 'lender_id'

CREATE OR REPLACE FUNCTION public.notify_risk_flag_added()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_borrower_user_id UUID;
BEGIN
  -- Get borrower user_id
  IF NEW.borrower_id IS NOT NULL THEN
    SELECT bul.user_id
    INTO v_borrower_user_id
    FROM public.borrower_user_links bul
    WHERE bul.borrower_id = NEW.borrower_id;
  END IF;

  -- Notify the creator of the flag (use created_by, not lender_id)
  IF NEW.created_by IS NOT NULL THEN
    PERFORM public.create_notification(
      NEW.created_by,
      'risk_flag_added',
      'Risk flag notification',
      'A risk flag has been added to a borrower profile. Review your active loans.',
      '/l/borrowers',
      'high'
    );
  END IF;

  RETURN NEW;
END;
$func$;
