# Credlio API Documentation

## Base URL
```
Production: https://yourdomain.com/api
Development: http://localhost:3003/api
```

## Authentication
All API routes require authentication via Supabase Auth. Include the session cookie in requests.

```typescript
// Client-side authentication check
const { data: { user } } = await supabase.auth.getUser()
```

---

## Credit Score API

### Calculate Credit Score
Calculates or updates a borrower's credit score based on their loan history and payment behavior.

**Endpoint**: `POST /api/credit-score/calculate`

**Request Body**:
```json
{
  "borrowerId": "uuid" // Optional, defaults to current user's borrower ID
}
```

**Response**:
```json
{
  "creditScore": {
    "score": 720,
    "factors": {
      "payment_history": 35,
      "credit_utilization": 30,
      "credit_age": 15,
      "credit_mix": 10,
      "new_inquiries": 10
    }
  }
}
```

**Score Calculation**:
- **Payment History (35%)**: On-time vs late payments
- **Credit Utilization (30%)**: Current debt vs credit limit
- **Credit Age (15%)**: How long account has been active
- **Credit Mix (10%)**: Variety of loan types
- **New Inquiries (10%)**: Recent loan applications

**Score Range**: 300 - 850

### Get Credit Score
Retrieves the current credit score for the authenticated borrower.

**Endpoint**: `GET /api/credit-score/calculate`

**Response**: Same as POST response above

---

## KYC API

### Upload KYC Document
Upload identity verification documents (ID, proof of address, etc.)

**Endpoint**: `POST /api/kyc/upload`

**Content-Type**: `multipart/form-data`

**Request Body**:
```typescript
FormData {
  file: File // PDF, JPG, or PNG (max 5MB)
  documentType: 'national_id' | 'passport' | 'proof_of_address' | 'bank_statement'
  borrowerId: 'uuid' // Optional if user has borrower record
}
```

**Response**:
```json
{
  "success": true,
  "document": {
    "id": "uuid",
    "type": "national_id",
    "hash": "a3f2b1c5d8e9f0a1...", // Truncated SHA-256
    "uploadedAt": "2025-10-23T10:30:00Z"
  }
}
```

**Features**:
- Automatic SHA-256 hashing for deduplication
- File validation (type and size)
- Secure storage by country/borrower
- Updates borrower KYC status to 'pending'

### Get Uploaded Documents
Retrieve list of documents uploaded by current borrower.

**Endpoint**: `GET /api/kyc/upload`

**Response**:
```json
{
  "documents": [
    {
      "id": "uuid",
      "document_type": "national_id",
      "uploaded_at": "2025-10-23T10:30:00Z"
    }
  ]
}
```

### Verify KYC (Admin Only)
Approve or reject a borrower's KYC submission.

**Endpoint**: `POST /api/kyc/verify`

**Permissions**: Admin only

**Request Body**:
```json
{
  "borrowerId": "uuid",
  "action": "approve" | "reject",
  "notes": "Optional admin notes"
}
```

**Response**:
```json
{
  "success": true,
  "status": "verified" | "rejected"
}
```

### Get Pending KYC (Admin Only)
Retrieve all pending KYC verifications.

**Endpoint**: `GET /api/kyc/verify`

**Permissions**: Admin only

**Response**:
```json
{
  "pendingKYC": [
    {
      "id": "uuid",
      "full_name": "John Doe",
      "email": "john@example.com",
      "phone": "+1234567890",
      "created_at": "2025-10-20T15:00:00Z"
    }
  ]
}
```

---

## Loans API

### Create Loan
Create a new loan for a borrower (lender only).

**Endpoint**: `POST /api/loans/create`

**Permissions**: Lender only

**Request Body**:
```json
{
  "borrower_id": "uuid",
  "principal_amount": 5000,
  "interest_rate": 12.5,
  "term_months": 12,
  "currency": "USD",
  "purpose": "Business expansion"
}
```

**Response**:
```json
{
  "loan": {
    "id": "uuid",
    "borrower_id": "uuid",
    "lender_id": "uuid",
    "principal_amount": 5000,
    "total_amount": 5625,
    "interest_rate": 12.5,
    "term_months": 12,
    "status": "pending",
    "created_at": "2025-10-23T10:30:00Z"
  }
}
```

### Approve Loan
Approve a pending loan (admin only).

**Endpoint**: `POST /api/loans/approve`

**Response**: Similar to create loan

### Record Repayment
Record a loan repayment.

**Endpoint**: `POST /api/loans/repay`

**Request Body**:
```json
{
  "loanId": "uuid",
  "amount": 500,
  "paymentMethod": "stripe" | "bank_transfer" | "cash"
}
```

---

## Notifications API

### Get Notifications
Retrieve notifications for the authenticated user.

**Endpoint**: `GET /api/notifications`

**Query Parameters**:
- `unreadOnly`: boolean (default: false)
- `limit`: number (default: 50, max: 100)

**Response**:
```json
{
  "notifications": [
    {
      "id": "uuid",
      "type": "loan_offer",
      "title": "New Loan Offer Received",
      "message": "ABC Lending has made you an offer for $5,000",
      "link": "/b/requests",
      "read": false,
      "created_at": "2025-10-23T10:30:00Z"
    }
  ],
  "unreadCount": 3
}
```

**Notification Types**:
- `loan_offer`: New loan offer received
- `loan_accepted`: Your offer was accepted
- `payment_due`: Payment reminder
- `payment_received`: Payment received from borrower
- `kyc_approved`: KYC verification approved
- `kyc_rejected`: KYC verification rejected
- `risk_flag`: Account risk flag added
- `system`: System announcements

### Create Notification (Admin Only)
Create a notification for a specific user.

**Endpoint**: `POST /api/notifications`

**Permissions**: Admin only

**Request Body**:
```json
{
  "targetUserId": "uuid",
  "type": "system",
  "title": "Platform Maintenance",
  "message": "Scheduled maintenance on Oct 25th",
  "link": "/announcements"
}
```

**Response**:
```json
{
  "notificationId": "uuid"
}
```

### Mark Notification as Read
Mark a single notification or all notifications as read.

**Endpoint**: `PATCH /api/notifications`

**Request Body** (single):
```json
{
  "notificationId": "uuid"
}
```

**Request Body** (all):
```json
{
  "markAllRead": true
}
```

**Response**:
```json
{
  "success": true,
  "message": "Notification marked as read"
}
```

---

## Borrower Reports API

### Get Reports
Fetch borrower reports based on user role.

**Endpoint**: `GET /api/reports`

**Query Parameters**:
- `borrowerId`: UUID (optional) - Filter by specific borrower
- `status`: string (optional) - Filter by status ('unpaid', 'paid', 'disputed', 'overdue')

**Permissions**:
- **Lenders**: See their own reports + premium lenders see all reports in their country
- **Borrowers**: See reports about themselves
- **Admins**: See all reports

**Response**:
```json
{
  "reports": [
    {
      "id": "uuid",
      "borrower_id": "uuid",
      "lender_id": "uuid",
      "country_code": "US",
      "currency": "USD",
      "amount_minor": 500000,
      "loan_date": "2025-10-01",
      "due_date": "2025-11-01",
      "status": "unpaid",
      "payment_date": null,
      "description": "Business loan not repaid",
      "evidence_urls": ["path/to/evidence.pdf"],
      "borrower_confirmed": false,
      "borrower_response": null,
      "created_at": "2025-10-23T10:30:00Z",
      "updated_at": "2025-10-23T10:30:00Z",
      "borrower": {
        "id": "uuid",
        "full_name": "John Doe",
        "phone_e164": "+1234567890",
        "country_code": "US"
      },
      "lender": {
        "user_id": "uuid",
        "business_name": "ABC Lending"
      }
    }
  ]
}
```

### File Report on Borrower
File a new report on a borrower (lender only).

**Endpoint**: `POST /api/reports`

**Permissions**: Lender only

**Request Body**:
```json
{
  "borrowerId": "uuid",
  "amount": 5000,
  "loanDate": "2025-10-01",
  "dueDate": "2025-11-01",
  "status": "unpaid",
  "description": "Business loan not repaid as agreed",
  "evidenceUrls": ["path/to/evidence.pdf"]
}
```

**Valid Statuses**: `unpaid`, `paid`, `disputed`, `overdue`

**Response**:
```json
{
  "success": true,
  "report": {
    "id": "uuid",
    "borrower_id": "uuid",
    "lender_id": "uuid",
    "amount_minor": 500000,
    "loan_date": "2025-10-01",
    "due_date": "2025-11-01",
    "status": "unpaid",
    "created_at": "2025-10-23T10:30:00Z",
    "borrower": {
      "id": "uuid",
      "full_name": "John Doe",
      "phone_e164": "+1234567890"
    }
  }
}
```

**Side Effects**:
- Updates borrower credit score if status is 'unpaid' or 'overdue'
- Creates audit log entry
- May trigger notification to borrower (if registered)

### Update Report
Confirm payment or dispute a report (borrower only).

**Endpoint**: `PATCH /api/reports`

**Permissions**: Borrower only (for their own reports)

**Request Body (Confirm Payment)**:
```json
{
  "reportId": "uuid",
  "action": "confirm_payment",
  "paymentDate": "2025-10-15",
  "response": "Payment made via bank transfer"
}
```

**Request Body (Dispute)**:
```json
{
  "reportId": "uuid",
  "action": "dispute",
  "response": "This report is inaccurate. I never received this loan."
}
```

**Response**:
```json
{
  "success": true,
  "report": {
    "id": "uuid",
    "status": "paid",
    "payment_date": "2025-10-15",
    "borrower_confirmed": true,
    "borrower_response": "Payment made via bank transfer",
    "updated_at": "2025-10-23T11:00:00Z"
  }
}
```

**Side Effects (Confirm Payment)**:
- Sets status to 'paid'
- Updates borrower credit score
- May trigger notification to lender

**Side Effects (Dispute)**:
- Sets status to 'disputed'
- Flags report for admin review
- May trigger notification to lender and admin

### Invite Borrower to Platform
Invite an unregistered borrower to join the platform (lender only).

**Endpoint**: `POST /api/reports/invite`

**Permissions**: Lender only

**Request Body**:
```json
{
  "borrowerId": "uuid",
  "email": "borrower@example.com",
  "phone": "+1234567890"
}
```

**Note**: Either email or phone must be provided.

**Response**:
```json
{
  "success": true,
  "message": "Invitation sent successfully"
}
```

**Side Effects**:
- Updates borrower record with invitation timestamp
- Records which lender sent the invitation
- TODO: Sends invitation email/SMS (requires integration)

---

## Stripe API

### Create Checkout Session
Create a Stripe checkout session for subscription.

**Endpoint**: `POST /api/stripe/create-checkout`

**Request Body**:
```json
{
  "planId": "PRO" | "PRO_PLUS",
  "billingPeriod": "monthly" | "yearly",
  "userRole": "lender" | "borrower"
}
```

**Response**:
```json
{
  "sessionId": "cs_test_..."
}
```

**Usage**:
```typescript
const stripe = await loadStripe(publishableKey)
await stripe.redirectToCheckout({ sessionId })
```

### Create Portal Session
Create a Stripe customer portal session for subscription management.

**Endpoint**: `POST /api/stripe/create-portal`

**Request Body**:
```json
{
  "returnUrl": "https://yourdomain.com/billing"
}
```

**Response**:
```json
{
  "url": "https://billing.stripe.com/session/..."
}
```

**Usage**:
```typescript
window.location.href = data.url
```

### Webhook Handler
Handles Stripe webhook events for subscription lifecycle.

**Endpoint**: `POST /api/stripe/webhook`

**Headers**:
- `stripe-signature`: Webhook signature

**Events Handled**:
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

---

## PostgreSQL Functions (via Supabase RPC)

### Accept Loan Offer
Accept a loan offer from a lender. Creates loan, repayment schedule, and enforces single active loan rule.

**Function**: `accept_offer(p_offer_id UUID)`

**Usage**:
```typescript
const { data, error } = await supabase.rpc('accept_offer', {
  p_offer_id: offerId
})
```

**Returns**: UUID of created loan

**Enforcements**:
- Only borrower who created request can accept
- Offer must be in 'pending' status
- Borrower cannot have another active loan
- Automatically creates repayment schedule
- Declines all other pending offers for the request

### Link Borrower User
Links a user account to a borrower record after onboarding.

**Function**: `link_borrower_user(p_national_id TEXT, p_phone TEXT, p_date_of_birth DATE)`

**Usage**:
```typescript
const { data, error } = await supabase.rpc('link_borrower_user', {
  p_national_id: nationalId, // Raw ID, will be hashed
  p_phone: phoneE164,
  p_date_of_birth: '1990-01-15'
})
```

**Returns**: UUID of borrower

**Features**:
- Hashes national ID with SHA-256
- Creates or updates borrower record
- Initializes credit score (600 default)
- Adds to identity index for fraud prevention
- Logs action in audit ledger

### Search Borrower
Search for borrowers by ID, phone, or name (lenders and admins only).

**Function**: `search_borrower(p_national_id TEXT, p_phone TEXT, p_name TEXT, p_purpose TEXT)`

**Usage**:
```typescript
const { data, error } = await supabase.rpc('search_borrower', {
  p_national_id: idNumber,
  p_phone: null,
  p_name: null,
  p_purpose: 'loan_assessment'
})
```

**Returns**: Array of matching borrowers with credit info

```typescript
[
  {
    borrower_id: 'uuid',
    full_name: 'John Doe',
    phone_e164: '+1234567890',
    date_of_birth: '1990-01-15',
    credit_score: 720,
    active_loan: true,
    risk_flags_count: 0,
    listed_by_lenders: 0
  }
]
```

**Privacy**: Search is logged for audit purposes

### Register Borrower
Register a new borrower (lender only).

**Function**: `register_borrower(p_full_name TEXT, p_national_id TEXT, p_phone TEXT, p_date_of_birth DATE, p_country_code TEXT)`

**Returns**: UUID of created borrower

### List Borrower as Risky
Add a risk flag to a borrower (lender only, requires proof).

**Function**: `list_borrower_as_risky(p_borrower_id UUID, p_risk_type risk_type, p_reason TEXT, p_amount_minor BIGINT, p_proof_hash TEXT)`

**Risk Types**: `DEFAULT`, `FRAUD`, `IDENTITY_THEFT`, `MULTIPLE_DEFAULTS`, `CLEARED`

**Returns**: UUID of risk flag

### Resolve Risk Flag
Resolve a risk flag (lender or admin).

**Function**: `resolve_risk_flag(p_risk_id UUID, p_resolution_reason TEXT)`

### Create Notification
Create an in-app notification.

**Function**: `create_notification(p_user_id UUID, p_type TEXT, p_title TEXT, p_message TEXT, p_link TEXT)`

**Returns**: UUID of notification

### Mark Notification Read
Mark a notification as read.

**Function**: `mark_notification_read(p_notification_id UUID)`

### Mark All Notifications Read
Mark all user's notifications as read.

**Function**: `mark_all_notifications_read()`

---

## Database Schema Overview

### Key Tables

**profiles**
- user_id (FK to auth.users)
- email, full_name, phone_e164
- role: borrower | lender | admin
- country_code
- onboarding_completed
- stripe_customer_id

**borrowers**
- id (PK)
- user_id (FK, optional - for app users)
- country_code
- full_name
- national_id_hash (SHA-256)
- phone_e164
- date_of_birth
- kyc_status: unverified | pending | verified | rejected
- created_by_lender (FK to lenders)

**lenders**
- user_id (PK, FK to auth.users)
- business_name
- license_number
- country_code
- verified: boolean

**loans**
- id (PK)
- borrower_id, lender_id, request_id
- country_code, currency
- principal_minor (in cents)
- apr_bps (basis points: 15% = 1500)
- fees_minor
- term_months
- start_date, end_date
- status: pending | active | completed | defaulted | cancelled
- total_repaid_minor

**loan_requests**
- id (PK)
- borrower_id, borrower_user_id
- country_code, currency
- amount_minor
- purpose, description
- term_months
- max_apr_bps
- status: open | accepted | cancelled | expired

**loan_offers**
- id (PK)
- request_id, lender_id
- amount_minor
- apr_bps
- term_months
- fees_minor
- conditions
- status: pending | accepted | declined | expired

**repayment_schedules**
- loan_id
- installment_no
- due_date
- amount_due_minor
- amount_paid_minor
- status: pending | paid | overdue

**notifications**
- id (PK)
- user_id
- type, title, message, link
- read: boolean
- created_at, read_at

---

## Error Handling

All API routes return consistent error responses:

```json
{
  "error": "Error message description"
}
```

**Common HTTP Status Codes**:
- `200` - Success
- `400` - Bad Request (validation error)
- `401` - Unauthorized (not authenticated)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

**Example Error Handling**:
```typescript
const response = await fetch('/api/loans/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(loanData)
})

const data = await response.json()

if (!response.ok) {
  console.error('Error:', data.error)
  // Handle error
  return
}

// Success
console.log('Loan created:', data.loan)
```

---

## Rate Limiting

**Current Implementation**: None (to be added)

**Recommended**:
- Credit score calculation: 10 requests/minute
- KYC upload: 5 uploads/hour
- Loan creation: 20 requests/hour
- Search: 100 requests/minute

---

## Webhooks

### Stripe Webhook
**URL**: `/api/stripe/webhook`
**Method**: POST
**Authentication**: Stripe signature verification

**Configure in Stripe Dashboard**:
1. Go to Developers → Webhooks
2. Add endpoint: `https://yourdomain.com/api/stripe/webhook`
3. Select events:
   - customer.subscription.created
   - customer.subscription.updated
   - customer.subscription.deleted
   - invoice.payment_succeeded
   - invoice.payment_failed
4. Copy signing secret to `STRIPE_WEBHOOK_SECRET` env var

---

## SDK / Client Libraries

### JavaScript/TypeScript

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// Example: Get credit score
const { data, error } = await supabase.rpc('calculate_credit_score', {
  borrower_id: userId
})

// Example: Create loan request
const { data: request, error: requestError } = await supabase
  .from('loan_requests')
  .insert({
    borrower_id: borrowerId,
    borrower_user_id: userId,
    country_code: 'US',
    currency: 'USD',
    amount_minor: 500000, // $5,000.00
    purpose: 'Business expansion',
    term_months: 12,
    max_apr_bps: 1500, // 15%
    status: 'open'
  })
  .select()
  .single()
```

---

## Testing

### Example API Test (Jest)
```typescript
describe('Credit Score API', () => {
  it('should calculate credit score', async () => {
    const response = await fetch('/api/credit-score/calculate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': authCookie
      },
      body: JSON.stringify({ borrowerId: testBorrowerId })
    })

    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.creditScore.score).toBeGreaterThanOrEqual(300)
    expect(data.creditScore.score).toBeLessThanOrEqual(850)
  })
})
```

---

## Support

For API support or questions:
- Email: support@credlio.com
- Documentation: https://docs.credlio.com
- GitHub Issues: https://github.com/credlio/platform/issues

---

**API Version**: 1.0.0
**Last Updated**: 2025-10-23
