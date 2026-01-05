# Collections / DeductPay Feature - Setup Guide

## Overview

The Collections feature allows **Business plan** lenders to set up automatic card deductions for loan repayments. Borrowers consent to recurring payments, and the platform handles:
- Automatic deductions on schedule (weekly, bi-weekly, or monthly)
- Split payments: Platform fee (2%) + Lender receives the rest
- Consent management with secure tokenized links
- Payment tracking and reporting

---

## ✅ Completed Components

### 1. Database Migration
**File:** `supabase/migrations/20260105180005_collections_deductpay_feature.sql`

**Tables Created:**
- `payment_mandates` - Borrower consent records for automatic deductions
- `payment_methods` - Tokenized card details (never stores full card numbers)
- `scheduled_deductions` - Upcoming scheduled payments
- `deduction_transactions` - History of all deduction attempts and results
- `payment_webhook_logs` - Audit log of all payment provider webhooks
- `lender_payout_settings` - Lender bank details and DPO merchant settings

**Functions Created:**
- `create_payment_mandate()` - Create a new payment mandate
- `get_mandate_for_consent()` - Get mandate details for borrower consent page (public)
- `submit_borrower_consent()` - Submit borrower consent and card details (public)
- `get_collection_stats()` - Get lender's collection statistics
- `cancel_mandate()` - Cancel a payment mandate

**Security:**
- Row Level Security (RLS) enabled on all tables
- Lenders can only view/manage their own mandates
- Public functions for borrower consent with token validation
- Card data is tokenized (never stores full card numbers or CVV)

### 2. UI Components

#### Collections Sidebar Menu
**File:** `app/l/layout.tsx`
- Added "Collections" menu item (Business plan only)
- Shows Crown icon for Business feature
- Hidden for FREE/PRO users
- Fetches user tier dynamically

#### Collections Dashboard
**File:** `app/l/collections/page.tsx`

**Features:**
- Stats cards (active mandates, collected this month, success rate, upcoming)
- List of all payment mandates with status badges
- Copy consent link button for pending mandates
- Upgrade prompt for non-Business users
- Business plan feature showcase

#### Borrower Consent Page
**File:** `app/consent/[token]/page.tsx`

**Public page** accessible at `/consent/{token}` - no login required

**Features:**
- Shows mandate details (lender, amount, frequency, start date)
- Secure card entry form (card number, holder, expiry, CVV)
- Card brand detection (Visa, Mastercard, Amex)
- Consent checkbox with clear terms
- Handles expired/invalid links gracefully
- Success confirmation screen

#### Setup Deduction Dialog
**File:** `components/SetupDeductionDialog.tsx`

**Reusable component** that can be added to loan pages

**Features:**
- Checks user tier (Business plan required)
- Checks payout settings completion
- Form to configure deductions (amount, frequency, day, start date)
- Creates payment mandate via RPC function
- Displays consent link to send to borrower
- Handles all validation and error states

### 3. API & Webhooks

#### API Endpoints
**Note:** API logic is handled by Supabase RPC functions in the migration. No separate API routes needed.

Available RPC functions:
```typescript
// Create mandate (lenders only)
supabase.rpc('create_payment_mandate', {
  p_loan_id: 'uuid',
  p_amount: 100.00,
  p_frequency: 'monthly',
  p_deduction_day: 1,
  p_start_date: '2026-02-01'
})

// Get mandate for consent (public)
supabase.rpc('get_mandate_for_consent', {
  p_token: 'consent_token'
})

// Submit consent (public)
supabase.rpc('submit_borrower_consent', {
  p_token: 'consent_token',
  p_card_token: 'tok_xxx',
  p_card_last_four: '1234',
  p_card_brand: 'Visa',
  p_card_expiry_month: 12,
  p_card_expiry_year: 2026,
  p_card_holder_name: 'JOHN DOE',
  p_ip_address: '127.0.0.1',
  p_user_agent: 'Mozilla/5.0...'
})

// Get stats (lenders only)
supabase.rpc('get_collection_stats', {
  p_user_id: 'uuid'
})

// Cancel mandate (lenders only)
supabase.rpc('cancel_mandate', {
  p_mandate_id: 'uuid'
})
```

#### DPO Webhook Handler
**File:** `app/api/webhooks/dpo/route.ts`

**Endpoint:** `POST /api/webhooks/dpo`

**Supported Events:**
- `payment.success` - Payment completed successfully
- `payment.failed` - Payment failed (schedules retry)
- `payment.refunded` - Payment was refunded
- `payment.disputed` - Payment disputed/chargeback

**Features:**
- Signature verification (placeholder - implement with real DPO secret)
- Webhook logging for audit trail
- Automatic transaction recording
- Scheduled deduction status updates
- Next deduction scheduling for successful payments
- Retry logic for failed payments (3 attempts, 24h intervals)
- Platform fee calculation (2%)

---

## 🔧 Setup Instructions

### 1. Environment Variables

Add to your `.env` file:

```bash
# DPO Payment Gateway
DPO_WEBHOOK_SECRET=your_dpo_webhook_secret_here
DPO_API_KEY=your_dpo_api_key_here
DPO_COMPANY_TOKEN=your_dpo_company_token_here
DPO_SERVICE_TYPE=your_dpo_service_type_here

# Supabase Service Role (for webhook handler)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### 2. Deploy Migration to Production

**IMPORTANT:** The migration has been tested locally with Docker ✅

To deploy to production:

```bash
# Link to your production project (if not already linked)
npx supabase link --project-ref YOUR_PROJECT_REF

# Push migrations to production
npx supabase db push
```

### 3. Configure DPO Webhook

In your DPO dashboard:
1. Go to Settings → Webhooks
2. Add webhook URL: `https://yourdomain.com/api/webhooks/dpo`
3. Select events: `payment.success`, `payment.failed`, `payment.refunded`, `payment.disputed`
4. Save webhook secret to your `.env` file

### 4. Add Setup Deduction Button to Loan Pages

In `app/l/loans/[id]/page.tsx`, add the dialog:

```typescript
import { SetupDeductionDialog } from '@/components/SetupDeductionDialog'

// Add state
const [setupDeductionOpen, setSetupDeductionOpen] = useState(false)

// Add button in your UI (near payment actions)
<Button onClick={() => setSetupDeductionOpen(true)}>
  <Landmark className="h-4 w-4 mr-2" />
  Setup Auto Deductions
</Button>

// Add dialog component
<SetupDeductionDialog
  open={setupDeductionOpen}
  onOpenChange={setSetupDeductionOpen}
  loanId={loan.id}
  loanAmount={loan.amount}
  outstandingBalance={loan.outstanding_balance}
  currency={loan.currency}
  borrowerName={loan.borrower.full_name}
  onSuccess={() => {
    // Refresh loan data
    loadLoanDetails()
  }}
/>
```

### 5. Implement Real Card Tokenization

The consent page currently has **placeholder card tokenization**.

**TODO:** Integrate with DPO's card tokenization API:

In `app/consent/[token]/page.tsx`, update the `handleSubmit` function:

```typescript
// Replace this placeholder code:
const cardToken = `tok_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

// With actual DPO tokenization:
const response = await fetch('https://api.dpo.com/tokenize', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.NEXT_PUBLIC_DPO_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    card_number: cardNumber.replace(/\s/g, ''),
    card_holder: cardHolder,
    expiry_month: expiryMonth,
    expiry_year: expiryYear,
    cvv: cvv
  })
})

const { card_token } = await response.json()
```

### 6. Implement Lender Payout Settings Page

Create a settings page where lenders can:
- Add bank account details
- Complete DPO merchant verification
- Configure payout preferences

**File to create:** `app/l/settings/collections/page.tsx`

This is required before lenders can create mandates (checked in `create_payment_mandate` function).

---

## 📊 User Flow

### For Lenders (Business Plan):

1. **Setup Payout Settings** (one-time)
   - Add bank account details
   - Complete DPO merchant verification

2. **Create Payment Mandate**
   - Go to loan detail page
   - Click "Setup Auto Deductions"
   - Configure amount, frequency, start date
   - Receive consent link

3. **Send Consent Link to Borrower**
   - Copy link from dialog
   - Send via SMS/Email/WhatsApp

4. **Monitor Collections**
   - View active mandates in Collections dashboard
   - See stats (collected this month, success rate, upcoming)
   - View transaction history

### For Borrowers:

1. **Receive Consent Link**
   - Lender sends link via SMS/Email

2. **Review and Consent**
   - Open link (no login required)
   - Review mandate details
   - Enter card details securely
   - Check consent checkbox
   - Submit

3. **Automatic Deductions**
   - First deduction on start date
   - Recurring deductions based on frequency
   - Receive notifications before each deduction

---

## 🔐 Security Features

- **RLS Policies:** Lenders can only access their own mandates
- **Token-Based Consent:** Time-limited tokens (7 days expiry)
- **Card Tokenization:** Full card numbers never stored
- **Webhook Verification:** Signature validation for all webhooks
- **Audit Logging:** All webhooks logged to database
- **HTTPS Only:** All sensitive data transmitted over TLS
- **IP Tracking:** Consent IP addresses recorded

---

## 🎯 Business Rules

- **Business Plan Only:** Collections feature requires Business subscription
- **Payout Settings Required:** Lenders must complete DPO merchant setup
- **Platform Fee:** 2% of gross amount
- **Retry Logic:** Failed payments retry 3 times (24h intervals)
- **Consent Expiry:** Consent links expire after 7 days
- **Borrower Can Revoke:** Borrowers can cancel mandate anytime (contact lender)

---

## 🧪 Testing

### Local Testing (Docker):

```bash
# Start Supabase
npx supabase start

# Reset database with new migration
npx supabase db reset

# Test in development
npm run dev
```

### Test Webhook Locally:

Use ngrok or similar to expose local webhook:

```bash
# Terminal 1: Start app
npm run dev

# Terminal 2: Expose webhook
ngrok http 3000

# Configure DPO webhook with ngrok URL
# https://xxxx.ngrok.io/api/webhooks/dpo
```

Send test webhook:

```bash
curl -X POST http://localhost:3000/api/webhooks/dpo \
  -H "Content-Type: application/json" \
  -H "x-dpo-signature: test_signature" \
  -d '{
    "event_type": "payment.success",
    "transaction_id": "dpo_123456",
    "transaction_reference": "MND-ABCD1234",
    "amount": "100.00",
    "currency": "NAD",
    "scheduled_deduction_id": "uuid-here"
  }'
```

---

## 📝 Next Steps / TODO

1. **Integrate Real DPO API:**
   - Card tokenization in consent page
   - Actual deduction processing
   - Webhook signature verification

2. **Build Lender Payout Settings Page:**
   - Bank account form
   - DPO merchant verification
   - Settings page UI

3. **Implement Payout Logic:**
   - Transfer lender_amount to lender bank account
   - Track payout status in deduction_transactions

4. **Add Notifications:**
   - Email/SMS to borrower before deductions
   - Email to lender on successful collection
   - Email to lender on failed payment

5. **Build Scheduled Deduction Processor:**
   - Cron job to process due deductions daily
   - Call DPO API to charge cards
   - Handle responses and update database

6. **Add Mandate Management:**
   - Pause/resume mandate
   - Update deduction amount
   - View transaction history per mandate

7. **Reporting & Analytics:**
   - Collection success rate trends
   - Revenue from collections
   - Failed payment analysis

---

## 🚀 Production Checklist

Before going live:

- [ ] Test migration on staging database
- [ ] Configure DPO production API keys
- [ ] Set up DPO webhook with production URL
- [ ] Implement real card tokenization
- [ ] Implement webhook signature verification
- [ ] Add lender payout settings page
- [ ] Implement actual payout processing
- [ ] Set up cron job for scheduled deductions
- [ ] Add email/SMS notifications
- [ ] Test full flow end-to-end
- [ ] Update terms of service for automatic deductions
- [ ] Train customer support on Collections feature

---

## 📞 Support

For issues or questions:
- Check webhook logs: Query `payment_webhook_logs` table
- Check mandate status: Query `payment_mandates` table
- Check transaction history: Query `deduction_transactions` table
- Enable debug logging in webhook handler

---

**Generated with Claude Code**
