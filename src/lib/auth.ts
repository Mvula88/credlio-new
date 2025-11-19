import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Database } from '@/types/database.types'

export type UserRole = Database['public']['Enums']['app_role']
export type SubscriptionTier = Database['public']['Enums']['sub_tier']

export interface AuthUser {
  id: string
  email: string
  role: UserRole
  country: string
  tier: SubscriptionTier
  onboardingCompleted: boolean
  profile?: Database['public']['Tables']['profiles']['Row']
}

export async function getUser(): Promise<AuthUser | null> {
  const supabase = await createServerSupabaseClient()
  
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    return null
  }

  // Get profile with subscription info
  const { data: profile } = await supabase
    .from('profiles')
    .select(`
      *,
      subscriptions (
        tier
      )
    `)
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    return null
  }

  return {
    id: user.id,
    email: user.email!,
    role: profile.app_role,
    country: profile.country_code,
    tier: (profile as any).subscriptions?.tier || 'PRO',
    onboardingCompleted: profile.onboarding_completed,
    profile
  }
}

export async function requireAuth(
  allowedRoles?: UserRole[],
  requireOnboarding = true
): Promise<AuthUser> {
  const user = await getUser()
  
  if (!user) {
    redirect('/login')
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    redirect('/unauthorized')
  }

  if (requireOnboarding && !user.onboardingCompleted && user.role === 'borrower') {
    redirect('/b/onboarding')
  }

  return user
}

export async function requireProPlus(): Promise<AuthUser> {
  const user = await requireAuth()
  
  if (user.tier !== 'PRO_PLUS') {
    redirect('/upgrade')
  }

  return user
}

export function hashNationalId(rawId: string): string {
  // This should match the SQL function logic
  const crypto = typeof window !== 'undefined' ? window.crypto : require('crypto')
  const encoder = new TextEncoder()
  const data = encoder.encode(rawId.toLowerCase().trim())
  
  if (typeof window !== 'undefined') {
    // Browser environment
    return crypto.subtle.digest('SHA-256', data).then(buffer => {
      return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    }) as any
  } else {
    // Node environment
    return require('crypto').createHash('sha256').update(rawId.toLowerCase().trim()).digest('hex')
  }
}

export async function hashNationalIdAsync(rawId: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(rawId.toLowerCase().trim())
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}