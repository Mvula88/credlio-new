import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string(),
  fullName: z.string().min(2, 'Full name is required'),
  country: z.string().length(2, 'Please select a country'),
  role: z.enum(['borrower', 'lender']),
  acceptTerms: z.boolean().refine(val => val === true, {
    message: 'You must accept the terms and conditions',
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

export const borrowerOnboardingSchema = z.object({
  fullName: z.string()
    .min(2, 'Full name is required')
    .regex(/^[a-zA-Z\s'-]+$/, 'Full name must contain only letters, spaces, hyphens, and apostrophes'),
  nationalId: z.string()
    .min(5, 'National ID is required')
    .max(30, 'National ID is too long'),
  phoneNumber: z.string()
    .regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number format'),
  dateOfBirth: z.string()
    .refine((date) => {
      const age = new Date().getFullYear() - new Date(date).getFullYear()
      return age >= 18 && age <= 120
    }, 'You must be at least 18 years old'),
  consent: z.boolean().refine(val => val === true, {
    message: 'You must consent to share your repayment history',
  }),
})

export const lenderBusinessSchema = z.object({
  businessName: z.string().min(2, 'Business name is required'),
  licenseNumber: z.string().optional(),
  phoneNumber: z.string()
    .regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number format'),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type BorrowerOnboardingInput = z.infer<typeof borrowerOnboardingSchema>
export type LenderBusinessInput = z.infer<typeof lenderBusinessSchema>