-- Fix infinite recursion in borrower_documents trigger
-- The trigger was firing on both INSERT and UPDATE, causing infinite loop
-- when the trigger itself performs an UPDATE

-- Drop the problematic trigger
DROP TRIGGER IF EXISTS after_borrower_document_upload ON public.borrower_documents;

-- Recreate trigger to ONLY run on INSERT (not UPDATE)
CREATE TRIGGER after_borrower_document_upload
  AFTER INSERT ON public.borrower_documents
  FOR EACH ROW
  EXECUTE FUNCTION trigger_auto_verify_on_document_upload();

-- The trigger function itself is fine, it just shouldn't re-trigger itself
-- when it updates the risk_score and risk_factors columns
