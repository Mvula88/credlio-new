import { createClient } from '@/lib/supabase/client'

// Hash national ID using Web Crypto API (client-side)
export async function hashNationalIdAsync(nationalId: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(nationalId)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

// Get user session
export async function getSession() {
  const supabase = createClient()
  const { data: { session }, error } = await supabase.auth.getSession()
  
  if (error || !session) {
    return null
  }
  
  return session
}

// Get user profile with role and country
export async function getUserProfile() {
  const supabase = createClient()
  const session = await getSession()
  
  if (!session) {
    return null
  }
  
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*, lenders(*), subscriptions(*)')
    .eq('user_id', session.user.id)
    .single()
  
  if (error || !profile) {
    return null
  }
  
  return profile
}

// Check if user has Pro+ subscription
export async function hasProPlusAccess(): Promise<boolean> {
  const profile = await getUserProfile()
  return profile?.subscriptions?.tier === 'PRO_PLUS'
}

// Format phone number to E.164
export function formatPhoneE164(phone: string, countryCode: string): string {
  // Remove all non-numeric characters
  let cleaned = phone.replace(/\D/g, '')
  
  // If already has country code, return as is
  if (cleaned.startsWith(countryCode.substring(1))) {
    return `+${cleaned}`
  }
  
  // Add country code if missing
  const countryPrefixes: Record<string, string> = {
    'NG': '234',
    'KE': '254',
    'ZA': '27',
    'GH': '233',
    'TZ': '255',
    'UG': '256',
    'NA': '264',
    'ZM': '260',
    'MW': '265',
    'RW': '250',
    'CM': '237',
    'CI': '225',
  }
  
  const prefix = countryPrefixes[countryCode] || '264' // Default to Namibia
  
  // Remove leading 0 if present
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1)
  }
  
  return `+${prefix}${cleaned}`
}

// Format currency amount
export function formatCurrency(
  amountMinor: number,
  currencyCode: string,
  minorUnits: number = 2
): string {
  const amount = amountMinor / Math.pow(10, minorUnits)
  
  // Currency symbols
  const symbols: Record<string, string> = {
    'NGN': '₦',
    'KES': 'KSh',
    'ZAR': 'R',
    'GHS': '₵',
    'TZS': 'TSh',
    'UGX': 'USh',
    'NAD': 'N$',
    'ZMW': 'K',
    'MWK': 'MK',
    'RWF': 'RF',
    'XAF': 'FCFA',
    'XOF': 'CFA',
    'USD': '$',
  }
  
  const symbol = symbols[currencyCode] || currencyCode
  
  return `${symbol}${amount.toLocaleString('en-US', {
    minimumFractionDigits: minorUnits,
    maximumFractionDigits: minorUnits,
  })}`
}

// Calculate loan repayment
export function calculateLoanRepayment(
  principal: number,
  aprBps: number,
  termMonths: number
): {
  monthlyPayment: number
  totalInterest: number
  totalAmount: number
} {
  // Convert APR from basis points to decimal
  const monthlyRate = (aprBps / 10000) / 12
  
  // Calculate monthly payment using amortization formula
  const monthlyPayment = principal * 
    (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
    (Math.pow(1 + monthlyRate, termMonths) - 1)
  
  const totalAmount = monthlyPayment * termMonths
  const totalInterest = totalAmount - principal
  
  return {
    monthlyPayment: Math.round(monthlyPayment),
    totalInterest: Math.round(totalInterest),
    totalAmount: Math.round(totalAmount),
  }
}