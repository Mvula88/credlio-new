'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  UserCheck,
  Camera,
  ShieldCheck,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  X,
  Clock
} from 'lucide-react'
import Link from 'next/link'

interface ProfileStatus {
  onboardingComplete: boolean      // Basic profile info completed
  selfieUploaded: boolean          // Verification selfie uploaded
  verificationStatus: string       // 'incomplete', 'pending', 'approved', 'rejected', 'banned'
  loading: boolean
}

export default function BorrowerProfileCompletionBanner() {
  const [status, setStatus] = useState<ProfileStatus>({
    onboardingComplete: false,
    selfieUploaded: false,
    verificationStatus: 'incomplete',
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

      // Get profile data
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed, full_name')
        .eq('user_id', user.id)
        .single()

      // Get borrower data via borrower_user_links
      const { data: linkData } = await supabase
        .from('borrower_user_links')
        .select('borrower_id')
        .eq('user_id', user.id)
        .single()

      let borrower = null
      if (linkData) {
        const { data: borrowerData } = await supabase
          .from('borrowers')
          .select('id, full_name')
          .eq('id', linkData.borrower_id)
          .single()
        borrower = borrowerData
      }

      // Get verification status
      let verificationData = null
      if (borrower) {
        const { data } = await supabase
          .from('borrower_self_verification_status')
          .select('selfie_uploaded, verification_status')
          .eq('borrower_id', borrower.id)
          .single()
        verificationData = data
      }

      // Onboarding is complete if profile.onboarding_completed is true
      const onboardingComplete = !!profile?.onboarding_completed

      setStatus({
        onboardingComplete,
        selfieUploaded: verificationData?.selfie_uploaded || false,
        verificationStatus: verificationData?.verification_status || 'incomplete',
        loading: false
      })
    } catch (error) {
      console.error('Error checking profile status:', error)
      setStatus(prev => ({ ...prev, loading: false }))
    }
  }

  // Calculate completion percentage
  const completedSteps = [
    status.onboardingComplete,
    status.selfieUploaded
  ].filter(Boolean).length
  const totalSteps = 2
  const completionPercentage = Math.round((completedSteps / totalSteps) * 100)

  // Check if verification is approved
  const isVerified = status.verificationStatus === 'approved'

  // Don't show if loading or all complete and verified or dismissed
  if (status.loading || (status.onboardingComplete && status.selfieUploaded && isVerified) || dismissed) {
    return null
  }

  // Get status badge for verification
  const getVerificationBadge = () => {
    switch (status.verificationStatus) {
      case 'approved':
        return { color: 'bg-green-100 text-green-800', text: 'Verified', icon: CheckCircle }
      case 'pending':
        return { color: 'bg-blue-100 text-blue-800', text: 'Pending Review', icon: Clock }
      case 'rejected':
        return { color: 'bg-red-100 text-red-800', text: 'Rejected', icon: X }
      case 'banned':
        return { color: 'bg-red-100 text-red-800', text: 'Banned', icon: X }
      default:
        return { color: 'bg-gray-100 text-gray-800', text: 'Incomplete', icon: AlertCircle }
    }
  }

  const badge = getVerificationBadge()

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
            Complete verification to request loans from lenders. Verified borrowers get better loan offers.
          </AlertDescription>

          <div className="flex flex-wrap gap-3">
            {/* Step 1: Basic Profile */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
              status.onboardingComplete
                ? 'bg-green-100 text-green-800'
                : 'bg-white border border-amber-200 text-amber-900'
            }`}>
              {status.onboardingComplete ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <UserCheck className="h-4 w-4 text-amber-600" />
              )}
              <span>Basic Profile</span>
              {!status.onboardingComplete && (
                <Link href="/b/onboarding">
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-amber-700 hover:text-amber-900">
                    Complete <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              )}
            </div>

            {/* Step 2: ID Verification */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
              status.selfieUploaded
                ? 'bg-green-100 text-green-800'
                : 'bg-white border border-amber-200 text-amber-900'
            }`}>
              {status.selfieUploaded ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <Camera className="h-4 w-4 text-amber-600" />
              )}
              <span>ID Verification</span>
              {!status.selfieUploaded && status.onboardingComplete && (
                <Link href="/b/verify">
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-amber-700 hover:text-amber-900">
                    Verify <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              )}
              {!status.selfieUploaded && !status.onboardingComplete && (
                <span className="text-xs text-amber-500">(Complete Step 1 first)</span>
              )}
            </div>

            {/* Verification Status Badge */}
            {status.selfieUploaded && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${badge.color}`}>
                <badge.icon className="h-4 w-4" />
                <span>{badge.text}</span>
                {status.verificationStatus === 'rejected' && (
                  <Link href="/b/reupload-selfie">
                    <Button size="sm" variant="ghost" className="h-6 px-2">
                      Retry <ChevronRight className="h-3 w-3 ml-1" />
                    </Button>
                  </Link>
                )}
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
