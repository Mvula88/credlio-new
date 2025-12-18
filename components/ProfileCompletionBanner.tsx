'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  UserCheck,
  Building2,
  ShieldCheck,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  X
} from 'lucide-react'
import Link from 'next/link'

interface ProfileStatus {
  identityComplete: boolean      // Complete Profile page done (id_number, city, etc.)
  providerInfoComplete: boolean  // Provider Info page done (business details)
  idVerified: boolean           // Admin has verified the ID
  loading: boolean
}

export default function ProfileCompletionBanner() {
  const [status, setStatus] = useState<ProfileStatus>({
    identityComplete: false,
    providerInfoComplete: false,
    idVerified: false,
    loading: true
  })
  const [dismissed, setDismissed] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    checkProfileStatus()
  }, [])

  const checkProfileStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get profile and lender data
      const [profileRes, lenderRes] = await Promise.all([
        supabase.from('profiles').select('onboarding_completed').eq('user_id', user.id).single(),
        supabase.from('lenders').select('id_number, city, profile_completed, id_verified, business_name, physical_address').eq('user_id', user.id).single()
      ])

      const profile = profileRes.data
      const lender = lenderRes.data

      // Identity is complete if they have id_number and city filled
      const identityComplete = !!(lender?.id_number && lender?.city)

      // Provider info is complete if they have business_name and physical_address
      const providerInfoComplete = !!(lender?.business_name && lender?.physical_address && lender?.profile_completed)

      // ID verified by admin
      const idVerified = lender?.id_verified === true

      setStatus({
        identityComplete,
        providerInfoComplete,
        idVerified,
        loading: false
      })
    } catch (error) {
      console.error('Error checking profile status:', error)
      setStatus(prev => ({ ...prev, loading: false }))
    }
  }

  // Calculate completion percentage
  const completedSteps = [status.identityComplete, status.providerInfoComplete].filter(Boolean).length
  const totalSteps = 2
  const completionPercentage = Math.round((completedSteps / totalSteps) * 100)

  // Don't show if loading or all complete or dismissed
  if (status.loading || (status.identityComplete && status.providerInfoComplete) || dismissed) {
    return null
  }

  return (
    <Alert className="mb-6 border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50">
      <div className="flex items-start justify-between w-full">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            <span className="font-semibold text-amber-900">Complete Your Profile</span>
            <span className="text-sm text-amber-700">({completionPercentage}% complete)</span>
          </div>

          <Progress value={completionPercentage} className="h-2 mb-3 bg-amber-100" />

          <AlertDescription className="text-amber-800 mb-3">
            Complete all steps to unlock full platform features and build trust with borrowers.
          </AlertDescription>

          <div className="flex flex-wrap gap-3">
            {/* Step 1: Identity Verification */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
              status.identityComplete
                ? 'bg-green-100 text-green-800'
                : 'bg-white border border-amber-200 text-amber-900'
            }`}>
              {status.identityComplete ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <UserCheck className="h-4 w-4 text-amber-600" />
              )}
              <span>Identity Verification</span>
              {!status.identityComplete && (
                <Link href="/l/complete-profile">
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-amber-700 hover:text-amber-900">
                    Complete <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              )}
            </div>

            {/* Step 2: Business Profile */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
              status.providerInfoComplete
                ? 'bg-green-100 text-green-800'
                : 'bg-white border border-amber-200 text-amber-900'
            }`}>
              {status.providerInfoComplete ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <Building2 className="h-4 w-4 text-amber-600" />
              )}
              <span>Business Profile</span>
              {!status.providerInfoComplete && status.identityComplete && (
                <Link href="/l/provider-info">
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-amber-700 hover:text-amber-900">
                    Complete <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              )}
              {!status.providerInfoComplete && !status.identityComplete && (
                <span className="text-xs text-amber-500">(Complete Step 1 first)</span>
              )}
            </div>

            {/* ID Verification Status (by admin) */}
            {status.identityComplete && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                status.idVerified
                  ? 'bg-green-100 text-green-800'
                  : 'bg-blue-50 border border-blue-200 text-blue-800'
              }`}>
                <ShieldCheck className={`h-4 w-4 ${status.idVerified ? 'text-green-600' : 'text-blue-600'}`} />
                <span>{status.idVerified ? 'ID Verified' : 'ID Pending Review'}</span>
              </div>
            )}
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-amber-600 hover:text-amber-800"
          onClick={() => setDismissed(true)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </Alert>
  )
}
