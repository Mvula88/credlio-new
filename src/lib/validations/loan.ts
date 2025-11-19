import { z } from 'zod'

export const borrowerRegistrationSchema = z.object({
  fullName: z.string()
    .min(2, 'Full name is required')
    .regex(/^[a-zA-Z\s'-]+$/, 'Invalid name format'),
  nationalId: z.string()
    .min(5, 'National ID is required')
    .max(30, 'National ID is too long'),
  phoneNumber: z.string()
    .regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number'),
  dateOfBirth: z.string()
    .refine((date) => {
      const age = new Date().getFullYear() - new Date(date).getFullYear()
      return age >= 18 && age <= 120
    }, 'Invalid date of birth'),
})

export const loanRequestSchema = z.object({
  amount: z.string()
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
      message: 'Amount must be a positive number',
    }),
  purpose: z.enum([
    'business_expansion',
    'working_capital',
    'equipment_purchase',
    'emergency',
    'education',
    'medical',
    'debt_consolidation',
    'other',
  ]),
  purposeDescription: z.string().min(10, 'Please provide more details'),
  termMonths: z.number()
    .min(1, 'Term must be at least 1 month')
    .max(60, 'Term cannot exceed 60 months'),
  maxApr: z.number().optional(),
})

export const loanOfferSchema = z.object({
  amount: z.string()
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
      message: 'Amount must be a positive number',
    }),
  apr: z.number()
    .min(0, 'APR cannot be negative')
    .max(360, 'APR cannot exceed 360%'),
  termMonths: z.number()
    .min(1, 'Term must be at least 1 month')
    .max(60, 'Term cannot exceed 60 months'),
  fees: z.string().optional(),
  conditions: z.string().optional(),
})

export const repaymentRecordSchema = z.object({
  scheduleId: z.string().uuid(),
  paidAt: z.string(),
  amount: z.string()
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
      message: 'Amount must be positive',
    }),
  method: z.enum(['cash', 'bank_transfer', 'mobile_money', 'other']),
  reference: z.string().optional(),
  evidenceUrl: z.string().url().optional(),
})

export const riskListingSchema = z.object({
  borrowerId: z.string().uuid(),
  type: z.enum(['LATE_1_7', 'LATE_8_30', 'LATE_31_60', 'DEFAULT']),
  reason: z.string().min(10, 'Please provide a detailed reason'),
  amountAtIssue: z.string()
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
      message: 'Amount must be positive',
    }),
  proofHash: z.string()
    .length(64, 'Invalid proof hash')
    .regex(/^[a-f0-9]{64}$/, 'Invalid SHA-256 hash'),
})

export const disputeSchema = z.object({
  type: z.enum(['incorrect_listing', 'payment_not_recorded', 'identity_theft', 'other']),
  description: z.string().min(20, 'Please provide more details'),
  evidenceHashes: z.array(z.string().length(64)).optional(),
})

export type BorrowerRegistrationInput = z.infer<typeof borrowerRegistrationSchema>
export type LoanRequestInput = z.infer<typeof loanRequestSchema>
export type LoanOfferInput = z.infer<typeof loanOfferSchema>
export type RepaymentRecordInput = z.infer<typeof repaymentRecordSchema>
export type RiskListingInput = z.infer<typeof riskListingSchema>
export type DisputeInput = z.infer<typeof disputeSchema>