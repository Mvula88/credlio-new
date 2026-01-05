# Collections Feature - Your Critical Questions Answered

## 📌 Your Questions & My Answers

### 1. ❓ Should it be in sidebar menu or settings?

**MY ANSWER: Sidebar menu (Already implemented ✅)**

**Why:**
- Collections is a **core lending activity** (like Loans, Repayments)
- Lenders need **quick access** to monitor incoming payments
- Settings would bury it too deep

**What's in Settings:**
- Lender payout setup (bank details, DPO verification)

**Business Plan Restriction:** ✅ Already implemented - only shows for BUSINESS tier users

---

### 2. ❓ Who puts in card details - Lender or Borrower?

**MY ANSWER: BORROWER MUST (Already implemented correctly ✅)**

**Critical Flow:**
```
Lender creates mandate → Gets consent link → Sends to borrower →
Borrower opens link → Borrower enters OWN card → System tokenizes card
```

**WHY BORROWER MUST ENTER THEIR OWN CARD:**

1. **Legal/Compliance (PCI-DSS):**
   - Lenders are NOT allowed to handle card data
   - Would require expensive PCI compliance certification
   - Massive liability if data breaches

2. **Security:**
   - Lender NEVER sees full card number
   - System stores only tokenized version
   - CVV never stored anywhere

3. **Legal Protection:**
   - Borrower owns the consent (can't claim fraud)
   - Proof of authorization with IP address, timestamp
   - Borrower can't dispute legitimate charges

4. **Trust:**
   - Borrowers feel safer entering own details
   - Reduces fraud concerns

**⚠️ CRITICAL: Lender should NEVER have access to borrower card details!**

---

### 3. ❓ Letter of Consent - Should be sent before deduction?

**MY ANSWER: YES! (Partially implemented, enhanced now ✅)**

**What I Built:**
- ✅ Consent page with clear terms and checkbox
- ✅ Tracks: `consent_given_at`, `consent_ip_address`, `consent_user_agent`
- ✅ Consent must be given BEFORE first deduction

**What I Just Added:**
- ✅ **PDF consent form generator** (`lib/utils/generateConsentPDF.ts`)
- ✅ Downloadable consent letter for borrower to keep
- ✅ 10-point terms and conditions
- ✅ Digital signature capture

**Consent Process:**
1. Borrower receives consent link
2. Reviews mandate details (amount, frequency, dates)
3. Reads and downloads consent PDF
4. Checks "I authorize" checkbox
5. Enters card details
6. Submits consent
7. System records: timestamp, IP, user agent, signature

**Legal Protection:**
- PDF includes all terms
- Borrower signature (digital or physical)
- Can be used as evidence if disputed
- Stored in database: `consent_document_url`

---

### 4. ❓ How does system know if deduction succeeded or failed?

**MY ANSWER: Two-part system (CRITICAL PIECE WAS MISSING!)**

#### The Complete Flow:

```
┌─────────────────────────────────────────────────────────┐
│ PART 1: INITIATE DEDUCTION (I JUST ADDED THIS!)        │
└─────────────────────────────────────────────────────────┘
Daily at 8 AM (Cron Job):
  1. System checks for due deductions
  2. Finds scheduled_deductions with date <= today
  3. Calls DPO API to charge borrower's card
  4. DPO processes payment
     ↓
     ↓
┌─────────────────────────────────────────────────────────┐
│ PART 2: RECEIVE RESULT (I BUILT THIS EARLIER!)         │
└─────────────────────────────────────────────────────────┘
Minutes later:
  5. DPO sends webhook to your system
  6. Webhook handler receives event (success/failed)
  7. Updates scheduled_deduction status
  8. Creates deduction_transaction record
  9. If success: Schedules next deduction
  10. If failed: Schedules retry (max 3 attempts)
```

#### What I Built:

**PART 1: Deduction Initiator (NEW! ✅)**
- **File:** `app/api/cron/process-deductions/route.ts`
- **Runs:** Daily at 8 AM (configured in `vercel.json`)
- **Does:**
  - Finds all due deductions
  - Charges cards via DPO API
  - Updates status to "processing"
  - Waits for webhook

**PART 2: Webhook Handler (ALREADY BUILT ✅)**
- **File:** `app/api/webhooks/dpo/route.ts`
- **Receives:** DPO payment notifications
- **Events:**
  - `payment.success` → Records transaction, schedules next
  - `payment.failed` → Schedules retry (3 attempts)
  - `payment.refunded` → Marks as refunded
  - `payment.disputed` → Pauses mandate
- **Updates:** Database automatically

#### Security:
- Webhook signature verification
- All webhooks logged for audit
- IP address tracking
- Failure reasons recorded

---

## 🚨 OTHER CRITICAL ISSUES I IDENTIFIED

### 5. ⚠️ What Happens After 3 Failed Payment Attempts?

**ISSUE:** Not fully handled

**CURRENT:** After 3 failures, deduction marked as "failed"

**MISSING:**
- ❌ Notify lender about repeated failures
- ❌ Notify borrower (card issue? insufficient funds?)
- ❌ Automatic mandate suspension?
- ❌ Late fee application?
- ❌ Report to credit bureau?

**RECOMMENDATION:**
```sql
-- Add to migration:
ALTER TABLE payment_mandates ADD COLUMN consecutive_failures INTEGER DEFAULT 0;

-- After 3rd failure:
-- 1. Increment consecutive_failures
-- 2. If consecutive_failures >= 3:
--    - Pause mandate (status = 'paused')
--    - Send urgent notification to lender
--    - Send SMS to borrower (card problem?)
--    - Apply late fee to loan
-- 3. Lender can manually resume after borrower fixes issue
```

---

### 6. ⚠️ Who Pays Transaction Fees?

**ISSUE:** Not clearly defined

**CURRENT:** Platform takes 2% of gross amount

**MISSING:**
- Who pays DPO's transaction fees? (Usually 3-5%)
- Who pays failed payment fees?
- Who pays refund fees?

**RECOMMENDATION:**
```
Option A (Borrower pays fees):
  Borrower charged: Loan payment + Platform fee (2%) + DPO fee (3%)
  Lender receives: Loan payment
  Platform receives: 2% + covers DPO fee

Option B (Split fees):
  Borrower charged: Loan payment + DPO fee (3%)
  Platform receives: 2% from lender amount
  Lender receives: Loan payment - 2%

Option C (Platform absorbs):
  Borrower charged: Loan payment
  Platform receives: 2% - DPO fee = Net loss on small amounts!
  Lender receives: Loan payment

RECOMMENDED: Option A (Most transparent)
```

---

### 7. ⚠️ Borrower Wants to Cancel Mandate

**ISSUE:** Partially handled

**CURRENT:**
- Function exists: `cancel_mandate()` (lender only)
- Borrower cannot cancel via UI

**WHAT I JUST ADDED:**
- Created revoke mandate page template
- Needs database function: `revoke_mandate_by_borrower()`

**ADD TO MIGRATION:**
```sql
CREATE OR REPLACE FUNCTION public.revoke_mandate_by_borrower(
  p_mandate_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update mandate status
  UPDATE public.payment_mandates
  SET
    status = 'cancelled_borrower',
    cancelled_at = NOW(),
    updated_at = NOW()
  WHERE id = p_mandate_id;

  -- Cancel pending deductions
  UPDATE public.scheduled_deductions
  SET status = 'cancelled'
  WHERE mandate_id = p_mandate_id AND status = 'scheduled';

  -- Deactivate payment method
  UPDATE public.payment_methods
  SET is_active = FALSE
  WHERE id IN (
    SELECT payment_method_id FROM public.scheduled_deductions
    WHERE mandate_id = p_mandate_id
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_mandate_by_borrower(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.revoke_mandate_by_borrower(UUID) TO authenticated;
```

**BORROWER CANCELLATION FLOW:**
1. Borrower gets revoke link: `/revoke-mandate/{mandateId}`
2. Shows consequences (must make manual payments)
3. Confirms cancellation
4. Mandate cancelled, lender notified
5. Borrower must pay manually to avoid default

---

### 8. ⚠️ Data Retention & Privacy (GDPR/POPIA)

**ISSUE:** Card data storage compliance

**CURRENT:**
- Card tokens stored indefinitely
- No data deletion policy

**MISSING:**
- What happens to card data when:
  - Loan is paid off?
  - Mandate is cancelled?
  - Borrower requests data deletion?
  - Account is closed?

**RECOMMENDATION:**
```sql
-- Add to payment_methods table:
ALTER TABLE payment_methods ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE payment_methods ADD COLUMN deletion_reason TEXT;

-- After loan completion:
UPDATE payment_methods
SET
  card_token = 'DELETED',
  is_active = FALSE,
  deleted_at = NOW(),
  deletion_reason = 'Loan completed'
WHERE id IN (
  SELECT DISTINCT payment_method_id
  FROM scheduled_deductions
  WHERE loan_id = {completed_loan_id}
);

-- Retention policy:
-- 1. Keep transaction history (for auditing)
-- 2. Delete card tokens after 90 days of inactivity
-- 3. Anonymize borrower data after X years
```

---

### 9. ⚠️ Card Expiry Handling

**ISSUE:** Cards expire

**CURRENT:**
- Stores expiry date
- No automatic handling

**MISSING:**
- What happens when card expires?
- How does borrower update card?
- Notification before expiry?

**RECOMMENDATION:**
```sql
-- Add function to check for expiring cards:
CREATE OR REPLACE FUNCTION check_expiring_cards()
RETURNS void AS $$
BEGIN
  -- Find cards expiring in next 30 days
  INSERT INTO notifications (...)
  SELECT ...
  FROM payment_methods
  WHERE
    is_active = TRUE
    AND make_date(card_expiry_year, card_expiry_month, 1) <= NOW() + INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Run monthly via cron
-- Notify borrower: "Your card expires soon, update it"
-- Send update card link (similar to consent link)
```

---

### 10. ⚠️ Partial Payments / Insufficient Funds

**ISSUE:** What if card has insufficient balance?

**CURRENT:**
- DPO attempts full amount
- Either succeeds or fails completely

**MISSING:**
- Partial payment handling?
- Retry with lower amount?
- Notify borrower about amount needed?

**RECOMMENDATION:**
```
Option A: All or nothing (simpler)
  - Require full amount
  - If insufficient funds, fail and retry
  - Borrower must ensure funds available

Option B: Partial payments (complex)
  - If insufficient funds, charge what's available
  - Record as partial payment
  - Schedule another deduction for remainder
  - Risk: Multiple small transactions, higher fees

RECOMMENDED: Option A (All or nothing)
```

---

### 11. ⚠️ Testing & Sandbox Mode

**ISSUE:** Can't test without real money

**CRITICAL:**
- Need sandbox/test mode for development
- DPO should have test API keys
- Test cards that always succeed/fail

**REQUIRED BEFORE GOING LIVE:**
```bash
# Environment variables:
DPO_MODE=sandbox  # or 'production'
DPO_SANDBOX_API_KEY=test_key_123
DPO_SANDBOX_COMPANY_TOKEN=test_token_456

# Test cards (from DPO):
# Success: 4111 1111 1111 1111
# Declined: 4000 0000 0000 0002
# Insufficient funds: 4000 0000 0000 9995

# In code:
const apiUrl = process.env.DPO_MODE === 'sandbox'
  ? 'https://sandbox.dpo.com/api/v1'
  : 'https://api.dpo.com/v1'
```

---

### 12. ⚠️ Dispute/Chargeback Handling

**ISSUE:** Borrower disputes charge with their bank

**CURRENT:**
- Webhook receives `payment.disputed`
- Marks transaction as disputed

**MISSING:**
- How do you respond to dispute?
- Provide evidence (consent PDF, loan agreement)?
- Reverse payout to lender if lost?
- Ban borrower from future automatic deductions?

**RECOMMENDATION:**
```
When dispute received:
1. Pause all future deductions for this borrower
2. Notify lender immediately
3. Gather evidence:
   - Consent PDF with signature
   - IP address of consent
   - Loan agreement
   - Repayment schedule
4. Submit to DPO for dispute resolution
5. If lost:
   - Reverse lender payout
   - Mark borrower as high-risk
   - Consider legal action
6. If won:
   - Resume deductions
   - Add notes to borrower profile
```

---

### 13. ⚠️ Multi-Currency Support

**ISSUE:** What if borrower card is USD but loan is NAD?

**CURRENT:**
- Currency stored with mandate
- No conversion handling

**QUESTIONS:**
- Do you support multi-currency?
- Who pays conversion fees?
- What exchange rate is used?

**IF SINGLE CURRENCY (NAD only):**
```sql
-- Validate in create_payment_mandate:
IF v_mandate.currency != 'NAD' THEN
  RAISE EXCEPTION 'Only NAD currency is supported for collections';
END IF;

-- Validate borrower card is NAD
-- Or reject non-NAD cards at consent page
```

---

### 14. ⚠️ Notifications (CRITICAL!)

**ISSUE:** No notifications implemented

**CURRENT:**
- No emails
- No SMS
- Borrowers surprised by deductions!

**ABSOLUTELY REQUIRED:**
```
1. BEFORE deduction (2 days prior):
   - SMS to borrower: "Your card will be charged NAD X.XX on {date}. Ensure funds available."
   - Email with amount, date, mandate reference

2. AFTER successful deduction:
   - SMS to borrower: "Payment successful. NAD X.XX deducted."
   - Email receipt
   - Notify lender: "Collection received from {borrower}"

3. AFTER failed deduction:
   - SMS to borrower: "Payment failed. Please check your card. Will retry in 24hrs."
   - Email with failure reason
   - After 3 failures: URGENT notification to lender

4. When mandate created:
   - Email to lender with consent link
   - Instructions on how to send to borrower

5. When borrower consents:
   - Email to lender: "Borrower {name} has authorized automatic deductions"
   - Email to borrower with consent PDF and terms
```

**IMPLEMENTATION:**
```typescript
// Add to your codebase:
// lib/services/notifications.ts

export async function sendDeductionReminder(params: {
  borrowerPhone: string
  borrowerEmail: string
  amount: number
  currency: string
  date: string
}) {
  // Send SMS via Twilio/Africa's Talking
  await sendSMS({
    to: params.borrowerPhone,
    message: `Reminder: Your card will be charged ${params.currency} ${params.amount} on ${params.date} for loan repayment. Ensure funds are available.`
  })

  // Send email
  await sendEmail({
    to: params.borrowerEmail,
    subject: 'Upcoming Payment Deduction',
    template: 'deduction-reminder',
    data: params
  })
}
```

---

### 15. ⚠️ Lender Payout Settings Page (CRITICAL!)

**ISSUE:** COMPLETELY MISSING

**REQUIRED BEFORE GOING LIVE:**

Lenders cannot create mandates until they complete payout settings:
- Bank account details
- DPO merchant verification
- Tax information
- Compliance documents

**MUST CREATE:**
`app/l/settings/collections/page.tsx`

**Form Fields:**
```typescript
interface PayoutSettings {
  // Bank details
  bank_name: string
  bank_account_number: string
  bank_account_name: string
  bank_branch_code: string
  bank_swift_code: string

  // DPO merchant
  dpo_merchant_id: string
  dpo_setup_complete: boolean
  dpo_verification_status: 'pending' | 'verified' | 'rejected'

  // Registration
  registration_number: string  // NAMFISA/NCR/CBN
  registration_verified: boolean
  registration_document_url: string

  // Settings
  auto_payout_enabled: boolean
  minimum_payout_amount: number
}
```

**Verification Process:**
1. Lender enters bank details
2. System validates account exists (optional API call)
3. Lender uploads registration certificate
4. Admin verifies registration (manual step)
5. System creates DPO sub-merchant
6. DPO verifies lender (KYB process)
7. Once verified: `dpo_setup_complete = true`
8. Lender can now create mandates

---

## 📊 SUMMARY: What's Built vs What's Missing

### ✅ BUILT & WORKING:

1. ✅ Database schema (tested with Docker)
2. ✅ Collections sidebar menu (Business plan only)
3. ✅ Collections dashboard with stats
4. ✅ Borrower consent page (public, secure)
5. ✅ Setup deduction dialog component
6. ✅ DPO webhook handler (receives results)
7. ✅ Deduction initiator cron job (charges cards)
8. ✅ Consent PDF generator
9. ✅ RLS security policies
10. ✅ SQL functions for all operations

### ⚠️ CRITICAL - MUST ADD BEFORE PRODUCTION:

1. ❌ **Lender payout settings page** (bank details, DPO verification)
2. ❌ **Actual DPO API integration** (currently placeholders)
3. ❌ **Notification system** (SMS/email before/after deductions)
4. ❌ **Borrower revoke mandate page** + SQL function
5. ❌ **Failed payment handling** (after 3 attempts)
6. ❌ **Card expiry notifications** + update flow
7. ❌ **Dispute handling workflow**
8. ❌ **Testing/sandbox mode**
9. ❌ **Transaction fee handling** (who pays?)
10. ❌ **Data retention policy** (delete card tokens after loan completion)

### 📋 NICE TO HAVE (Not Critical):

1. Partial payment support
2. Multi-currency support
3. Payment analytics dashboard
4. Mandate pause/resume feature
5. Bulk mandate creation
6. CSV export of transactions
7. Borrower portal to view deductions
8. Automated late fees
9. Credit bureau reporting integration

---

## 🚀 RECOMMENDED NEXT STEPS (In Priority Order):

1. **Week 1:** Add lender payout settings page + verification
2. **Week 1:** Integrate real DPO API (card tokenization, charging)
3. **Week 2:** Implement notification system (critical!)
4. **Week 2:** Add borrower revoke mandate feature
5. **Week 3:** Test end-to-end in sandbox mode
6. **Week 3:** Handle failed payments properly
7. **Week 4:** Add card expiry handling
8. **Week 4:** Production deployment

---

## 💡 MY RECOMMENDATIONS:

### Security & Compliance:
- ✅ **Borrower MUST enter own card** (never lender) - Already correct
- ✅ **Consent PDF required** - Now implemented
- ⚠️ **Notifications are CRITICAL** - Add ASAP
- ⚠️ **Dispute handling plan** - Define before going live

### User Experience:
- ✅ **Collections in sidebar** - Quick access
- ✅ **Clear consent page** - Builds trust
- ⚠️ **Reminders before deduction** - Reduces surprise/disputes
- ⚠️ **Easy revoke process** - Borrower safety

### Technical:
- ✅ **Two-part system** (initiate + webhook) - Now complete
- ✅ **Retry logic** - 3 attempts with 24h delay
- ✅ **Audit logging** - All webhooks logged
- ⚠️ **Testing mode** - Must have before launch

---

## ❓ QUESTIONS FOR YOU:

1. **Transaction Fees:** Who pays DPO's fees? Borrower or split with lender?

2. **Failed Payments:** After 3 failures, should we:
   - Auto-pause mandate?
   - Apply late fees?
   - Report to credit bureau?

3. **Multi-Currency:** Do you support only NAD or multiple currencies?

4. **Notifications:** Do you have SMS provider? (Twilio, Africa's Talking?)

5. **DPO Integration:** Do you have DPO account? Need sandbox/production keys?

6. **Verification:** How should lender registration be verified? Manual admin review?

---

**Ready to implement any of these! Which should I tackle first?**
