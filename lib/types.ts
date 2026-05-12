// Shared TypeScript types for the Credlio application
// These match the Supabase database schema

export interface Profile {
  id: string
  user_id: string
  full_name: string | null
  email: string | null
  phone_e164: string | null
  country_code: string | null
  app_role: string | null
  avatar_url: string | null
  stripe_customer_id: string | null
  created_at: string
  updated_at: string | null
}

export interface Borrower {
  id: string
  user_id: string
  full_name: string | null
  national_id: string | null
  national_id_hash: string | null
  phone_e164: string | null
  email: string | null
  country_code: string | null
  date_of_birth: string | null
  employer: string | null
  monthly_income: number | null
  address: string | null
  city: string | null
  id_verified: boolean
  onboarding_complete: boolean
  borrower_self_verification_status?: string | null
  credit_limit?: number | null
  created_at: string
  updated_at: string | null
  borrower_scores?: CreditScore[]
}

export interface Lender {
  id: string
  user_id: string
  business_name: string | null
  phone_e164: string | null
  email: string | null
  country_code: string | null
  id_number: string | null
  id_type: string | null
  city: string | null
  physical_address: string | null
  lending_purpose: string | null
  profile_completed: boolean
  id_verified: boolean
  created_at: string
  updated_at: string | null
}

export interface Loan {
  id: string
  lender_id: string
  borrower_id: string
  amount: number
  principal_minor: number | null
  principal_amount?: number | null
  interest_rate: number
  term_months: number
  currency: string
  status: string
  outstanding_balance: number | null
  monthly_payment: number | null
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string | null
  borrowers?: Borrower | null
  lenders?: Lender | null
}

export interface CreditScore {
  id: string
  borrower_id: string
  score: number
  rating: string | null
  factors: Record<string, unknown> | null
  created_at: string
}

export interface Subscription {
  id: string
  user_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  sub_tier: string
  status: string
  current_period_start: string | null
  current_period_end: string | null
  subscription_period_end: string | null
  created_at: string
  updated_at: string | null
}

export interface RepaymentSchedule {
  id: string
  loan_id: string
  due_date: string
  amount: number
  status: string
  paid_date: string | null
  notes: string | null
  proof_url: string | null
  created_at: string
  updated_at?: string | null
}

export interface Report {
  id: string
  lender_id: string
  borrower_id: string
  loan_id: string | null
  type: string
  status: string
  amount: number | null
  description: string | null
  created_at: string
  updated_at: string | null
  borrower?: Borrower | null
}

export interface LoanAgreement {
  id: string
  loan_id: string
  agreement_url: string | null
  signed_at: string | null
  created_at: string
}

export interface Disbursement {
  id: string
  loan_id: string
  amount: number
  method: string | null
  proof_url: string | null
  status: string
  disbursed_at: string | null
  created_at: string
}

export interface Verification {
  id: string
  borrower_id: string
  lender_id: string | null
  status: string
  id_document_url: string | null
  selfie_url: string | null
  notes: string | null
  verified_at: string | null
  created_at: string
  borrowers?: Borrower | null
}

export interface RiskFlag {
  id: string
  borrower_id: string
  lender_id?: string | null
  flag_type: string
  type?: string
  severity: string
  description: string | null
  reason?: string | null
  origin?: string | null
  created_by?: string | null
  amount_at_issue_minor?: number | null
  proof_sha256?: string | null
  resolved: boolean
  resolved_at: string | null
  created_at: string
  borrowers?: Borrower | null
  lenders?: Lender | null
}

export interface MessageThread {
  id: string
  loan_id: string | null
  lender_id: string
  borrower_id: string
  subject: string | null
  last_message_at: string | null
  created_at: string
}

export interface LoanOffer {
  id: string
  loan_request_id: string
  lender_id: string
  amount: number
  amount_minor?: number
  interest_rate: number
  apr_bps?: number
  term_months: number
  status: string
  created_at: string
  lenders?: Lender | null
}

export interface LoanRequest {
  id: string
  borrower_id: string
  amount: number
  purpose: string | null
  status: string
  max_apr_bps?: number | null
  created_at: string
  loan_offers?: LoanOffer[]
}

export interface UsageStatus {
  reports_used: number
  reports_limit: number
  loans_used: number
  loans_limit: number
}

export interface PaymentStats {
  totalPaid: number
  totalDue: number
  nextPaymentDate: string | null
  nextPaymentAmount: number | null
}

export interface LoanStats {
  totalLoans: number
  activeLoans: number
  totalBorrowed: number
  totalRepaid: number
}

export interface EarlyPayoffInfo {
  remainingBalance: number
  discount: number
  payoffAmount: number
}

export interface LateFeeSummary {
  totalFees: number
  overduePayments: number
}

export interface Dispute {
  id: string
  report_id: string
  borrower_id: string
  reason: string | null
  status: string
  created_at: string
}

export interface RepaymentEvent {
  id: string
  schedule_id: string
  amount_paid_minor: number
  amount?: number
  paid_at: string | null
  method: string | null
  status?: string
  days_late?: number | null
  interest_amount?: number | null
  installment_no?: number
  created_at: string
}

// Extended types for Supabase queries with joins
export interface RepaymentScheduleWithEvents extends RepaymentSchedule {
  amount_due_minor?: number
  paid_amount_minor?: number
  principal_minor?: number
  principal_amount?: number
  interest_amount?: number
  interest_minor?: number
  installment_no?: number
  is_early_payment?: boolean
  paid_at?: string | null
  score?: number
  lender_notes?: string | null
  repayment_events?: RepaymentEvent[]
  loans?: Loan | null
}

export interface LoanWithRelations extends Loan {
  repayment_schedules?: RepaymentScheduleWithEvents[]
  repayment_events?: RepaymentEvent[]
  borrowers?: Borrower | null
  lenders?: Lender | null
  total_amount?: number
  total_repaid?: number
  total_repaid_minor?: number
  total_amount_minor?: number
  apr_bps?: number
  purpose?: string
  principal_amount?: number | null
  on_time_rate?: number
  total_loans?: number
  total_interest_percent?: number
  base_rate_percent?: number
  extra_rate_per_installment?: number
  num_installments?: number
  interest_amount_minor?: number
  risk_flags?: RiskFlag[]
  loan_offers?: LoanOffer[]
}

export interface BorrowerWithRelations extends Borrower {
  loans?: LoanWithRelations[]
  risk_flags?: RiskFlag[]
  borrower_scores?: CreditScore[]
  borrower_user_links?: { user_id: string }[]
  credit_scores?: CreditScore[]
  borrower_self_verification_status?: string | null
  credit_limit?: number | null
  paymentHealth?: number
  lenderCount?: number
}

export interface UserRole {
  id: string
  user_id: string
  role: string
}

export interface Notification {
  id: string
  user_id: string
  title: string
  message: string
  type: string
  read: boolean
  metadata?: Record<string, unknown>
  created_at: string
}

// Generic record type for dynamic/computed data
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DynamicRecord = Record<string, any>
