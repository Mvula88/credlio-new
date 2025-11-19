import * as z from 'zod'

// Borrower onboarding schema
export const borrowerOnboardingSchema = z.object({
  fullName: z.string()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name is too long')
    .regex(/^[a-zA-Z\s'-]+$/, 'Full name contains invalid characters'),
  
  nationalId: z.string()
    .min(5, 'National ID is too short')
    .max(50, 'National ID is too long'),
  
  phoneNumber: z.string()
    .min(10, 'Phone number is too short')
    .max(20, 'Phone number is too long')
    .regex(/^\+?[0-9]+$/, 'Phone number must contain only numbers'),
  
  dateOfBirth: z.string()
    .refine((date) => {
      const dob = new Date(date)
      const today = new Date()
      const age = today.getFullYear() - dob.getFullYear()
      return age >= 18 && age <= 120
    }, 'You must be at least 18 years old'),
  
  consent: z.boolean()
    .refine((val) => val === true, 'You must consent to share your information'),
})

export type BorrowerOnboardingInput = z.infer<typeof borrowerOnboardingSchema>

// Simple registration schema (for initial signup - lender or borrower)
export const simpleRegistrationSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string(),
  acceptTerms: z.boolean().refine((val) => val === true, 'You must accept the terms'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
})

export type SimpleRegistrationInput = z.infer<typeof simpleRegistrationSchema>

// Lender profile completion schema (after signup)
export const lenderProfileSchema = z.object({
  // REQUIRED FIELDS - Personal Identity (blocks dashboard access)
  fullName: z.string()
    .min(2, 'Full name is required')
    .max(100, 'Full name is too long')
    .regex(/^[a-zA-Z\s'-]+$/, 'Full name contains invalid characters'),

  country: z.string().length(2, 'Please select a country'),

  phoneNumber: z.string()
    .min(10, 'Phone number is required')
    .max(20, 'Phone number is too long')
    .regex(/^\+?[0-9]+$/, 'Phone number must contain only numbers'),

  idNumber: z.string()
    .min(5, 'ID number is required')
    .max(50, 'ID number is too long'),

  idType: z.enum(['national_id', 'passport', 'business_registration', 'drivers_license'], {
    errorMap: () => ({ message: 'Please select an ID type' }),
  }),

  city: z.string()
    .min(2, 'City is required')
    .max(100, 'City name is too long'),

  lendingPurpose: z.enum(['personal', 'business', 'ngo', 'cooperative', 'microfinance', 'other'], {
    errorMap: () => ({ message: 'Please select your lending purpose' }),
  }),

  // ID PHOTO VERIFICATION - Handled separately via camera capture
  // Photo validation happens in the submit handler, not in the form schema
})

export type LenderProfileInput = z.infer<typeof lenderProfileSchema>

// Legacy - kept for compatibility
export const lenderRegistrationSchema = simpleRegistrationSchema
export type LenderRegistrationInput = SimpleRegistrationInput

// Borrower registration schema
export const borrowerRegistrationSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string(),
  country: z.string().length(2, 'Please select a country'),
  acceptTerms: z.boolean().refine((val) => val === true, 'You must accept the terms'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
})

export type BorrowerRegistrationInput = z.infer<typeof borrowerRegistrationSchema>

// Login schema
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export type LoginInput = z.infer<typeof loginSchema>

// Register schema (alias for lenderRegistrationSchema for compatibility)
export const registerSchema = lenderRegistrationSchema
export type RegisterInput = LenderRegistrationInput