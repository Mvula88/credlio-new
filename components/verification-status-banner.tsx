'use client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Clock, CheckCircle, AlertTriangle, Shield } from 'lucide-react'
import { formatDistanceToNow, isPast } from 'date-fns'
import { useRouter } from 'next/navigation'

interface VerificationStatusBannerProps {
  emailVerified?: boolean
  phoneVerified?: boolean
  idVerified?: boolean
  profileCompleted?: boolean
  accountActivatedAt?: string | null
  verificationPendingUntil?: string | null
  userType?: 'borrower' | 'lender' // To know which profile page to link to
  // For borrower identity verification
  verificationStatus?: 'incomplete' | 'pending' | 'approved' | 'rejected' | 'banned' | null
}

export function VerificationStatusBanner({
  emailVerified = false,
  phoneVerified = false,
  idVerified = false,
  profileCompleted = false,
  accountActivatedAt,
  verificationPendingUntil,
  userType = 'borrower',
  verificationStatus = null,
}: VerificationStatusBannerProps) {
  const router = useRouter()

  // For borrowers: Check identity verification first (most important)
  if (userType === 'borrower' && verificationStatus) {
    if (verificationStatus === 'banned') {
      return (
        <Alert className="border-red-600 bg-red-100">
          <AlertTriangle className="h-4 w-4 text-red-800" />
          <AlertTitle className="text-red-900 font-bold">Account Suspended</AlertTitle>
          <AlertDescription className="text-red-800">
            Your account has been suspended. Please contact support for assistance.
          </AlertDescription>
        </Alert>
      )
    }

    if (verificationStatus === 'rejected') {
      return (
        <Alert className="border-orange-600 bg-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertTitle className="text-orange-900 font-bold">Verification Rejected</AlertTitle>
          <AlertDescription className="text-orange-800">
            <p className="mb-3">
              Your identity verification was not approved. Please review the feedback and resubmit your documents.
            </p>
            <Button
              onClick={() => router.push('/b/verify')}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Resubmit Verification
            </Button>
          </AlertDescription>
        </Alert>
      )
    }

    if (verificationStatus === 'pending') {
      return (
        <Alert className="border-blue-200 bg-blue-50">
          <Clock className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-900 font-bold">Verification Under Review</AlertTitle>
          <AlertDescription className="text-blue-800">
            <p className="mb-2">
              Your identity verification documents are being reviewed by our admin team.
              You'll be notified within 24 hours.
            </p>
            <p className="text-sm text-blue-700">
              You can browse the platform but cannot request loans until verified.
            </p>
          </AlertDescription>
        </Alert>
      )
    }

    if (verificationStatus === 'incomplete') {
      return (
        <Alert className="border-red-200 bg-red-50">
          <Shield className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-900 font-bold">Identity Verification Required</AlertTitle>
          <AlertDescription className="text-red-800">
            <p className="mb-3">
              You must complete identity verification before you can request loans.
              This is a one-time process that takes less than 5 minutes.
            </p>
            <Button
              onClick={() => router.push('/b/verify')}
              className="bg-red-600 hover:bg-red-700"
            >
              Complete Verification Now
            </Button>
          </AlertDescription>
        </Alert>
      )
    }

    // If approved, show success (only once, then hide)
    if (verificationStatus === 'approved') {
      return (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-900 font-bold">Identity Verified ✓</AlertTitle>
          <AlertDescription className="text-green-800">
            Your identity has been verified! You can now request loans and access all features.
          </AlertDescription>
        </Alert>
      )
    }
  }

  // If account is activated, don't show banner
  if (accountActivatedAt && isPast(new Date(accountActivatedAt))) {
    return null
  }

  // If verification is pending
  if (verificationPendingUntil && !isPast(new Date(verificationPendingUntil))) {
    return (
      <Alert className="border-yellow-200 bg-yellow-50">
        <Clock className="h-4 w-4 text-yellow-600" />
        <AlertTitle className="text-yellow-900">Verification in Progress</AlertTitle>
        <AlertDescription className="text-yellow-800">
          <p className="mb-2">
            Your account is in a 24-hour verification period. You can browse but cannot request loans yet.
          </p>
          <p className="text-sm">
            Account will be activated{' '}
            {formatDistanceToNow(new Date(verificationPendingUntil), { addSuffix: true })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge label="Email" verified={emailVerified} />
            <StatusBadge label="Phone" verified={phoneVerified} />
            <StatusBadge label="ID" verified={idVerified} />
            <StatusBadge label="Profile" verified={profileCompleted} />
          </div>
        </AlertDescription>
      </Alert>
    )
  }

  // If profile is not completed
  if (!profileCompleted) {
    const profileUrl = userType === 'lender' ? '/l/complete-profile' : '/b/onboarding'

    return (
      <Alert className="border-red-200 bg-red-50">
        <AlertTriangle className="h-4 w-4 text-red-600" />
        <AlertTitle className="text-red-900">Complete Your Profile</AlertTitle>
        <AlertDescription className="text-red-800">
          <p className="mb-3">
            Please complete your profile to start using the platform. This is required for verification.
          </p>
          <Button
            onClick={() => router.push(profileUrl)}
            className="bg-red-600 hover:bg-red-700"
          >
            Complete Profile Now
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  // If account is activated
  if (accountActivatedAt && isPast(new Date(accountActivatedAt))) {
    return (
      <Alert className="border-green-200 bg-green-50">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <AlertTitle className="text-green-900">Account Verified</AlertTitle>
        <AlertDescription className="text-green-800">
          Your account is fully verified and active. You can now request loans and access all features.
        </AlertDescription>
      </Alert>
    )
  }

  return null
}

function StatusBadge({ label, verified }: { label: string; verified: boolean }) {
  return (
    <Badge
      variant={verified ? 'default' : 'outline'}
      className={verified ? 'bg-green-100 text-green-800 border-green-300' : 'bg-gray-100 text-gray-600'}
    >
      {verified ? <CheckCircle className="h-3 w-3 mr-1" /> : <Clock className="h-3 w-3 mr-1" />}
      {label}
    </Badge>
  )
}
