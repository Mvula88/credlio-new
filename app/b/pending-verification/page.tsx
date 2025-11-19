'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Clock, CheckCircle, Shield, Loader2, RefreshCw, Camera, XCircle, AlertTriangle } from 'lucide-react'

export default function PendingVerificationPage() {
  const [loading, setLoading] = useState(true)
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null)
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkVerificationStatus()

    // Poll every 10 seconds to check if approved
    const interval = setInterval(checkVerificationStatus, 10000)
    return () => clearInterval(interval)
  }, [])

  const checkVerificationStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/b/login')
        return
      }

      // Get borrower ID
      const { data: linkData } = await supabase
        .from('borrower_user_links')
        .select('borrower_id')
        .eq('user_id', user.id)
        .single()

      if (!linkData) {
        router.push('/b/onboarding')
        return
      }

      // Check verification status
      const { data: verification } = await supabase
        .from('borrower_self_verification_status')
        .select('verification_status, started_at, verified_at, rejection_reason')
        .eq('borrower_id', linkData.borrower_id)
        .single()

      if (verification) {
        setVerificationStatus(verification.verification_status)
        setSubmittedAt(verification.started_at)
        setRejectionReason(verification.rejection_reason)

        // If approved, redirect to overview
        if (verification.verification_status === 'approved') {
          router.push('/b/overview')
        }

        // Don't auto-redirect on rejection - let them see the reason first
      }

      setLoading(false)
    } catch (error) {
      console.error('Error checking verification:', error)
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    )
  }

  // Show rejected state
  if (verificationStatus === 'rejected') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 px-4 py-12">
        <div className="w-full max-w-2xl">
          <Card className="border-2 border-red-200">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <XCircle className="h-10 w-10 text-red-600" />
              </div>
              <CardTitle className="text-3xl font-bold text-red-900">
                Verification Rejected
              </CardTitle>
              <CardDescription className="text-base">
                Your identity verification needs to be re-submitted
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              <Alert className="border-red-200 bg-red-50">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <AlertTitle className="text-red-900 font-bold">
                  Action Required
                </AlertTitle>
                <AlertDescription className="text-red-800 mt-2">
                  <p className="mb-3">
                    Your verification was rejected for the following reason:
                  </p>
                  <div className="bg-white rounded-lg p-4 border border-red-200">
                    <p className="font-medium text-red-900">
                      {rejectionReason || 'No reason provided'}
                    </p>
                  </div>
                </AlertDescription>
              </Alert>

              <div className="bg-white rounded-lg p-6 space-y-4">
                <h3 className="font-semibold text-lg">What should you do?</h3>
                <ol className="list-decimal list-inside space-y-3 text-sm text-gray-700">
                  <li>
                    Review the rejection reason above carefully
                  </li>
                  <li>
                    Click "Edit Profile & Re-submit" below to fix the issues
                  </li>
                  <li>
                    Make sure your selfie photo is clear and shows both your face and ID
                  </li>
                  <li>
                    Ensure the name in your profile matches your ID exactly
                  </li>
                  <li>
                    Re-submit for verification once you've made corrections
                  </li>
                </ol>
              </div>

              <Alert className="border-orange-200 bg-orange-50">
                <AlertDescription className="text-orange-900 text-sm">
                  <strong>Tips for a successful verification:</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Use good lighting when taking your selfie</li>
                    <li>Hold your ID clearly next to your face</li>
                    <li>Make sure all text on the ID is readable</li>
                    <li>Your face should match the photo on your ID</li>
                  </ul>
                </AlertDescription>
              </Alert>

              <div className="flex flex-col gap-3">
                <Button
                  onClick={() => router.push('/b/onboarding')}
                  className="w-full bg-red-600 hover:bg-red-700"
                >
                  Edit Profile & Re-submit
                </Button>
                <Button
                  onClick={() => router.push('/b/reupload-selfie')}
                  variant="outline"
                  className="w-full"
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Re-upload Selfie Only
                </Button>
              </div>

              {submittedAt && (
                <p className="text-center text-xs text-gray-500">
                  Originally submitted on {new Date(submittedAt).toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // Show pending state (default)
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 px-4 py-12">
      <div className="w-full max-w-2xl">
        <Card className="border-2 border-blue-200">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <Clock className="h-10 w-10 text-blue-600 animate-pulse" />
            </div>
            <CardTitle className="text-3xl font-bold text-blue-900">
              Verification Pending
            </CardTitle>
            <CardDescription className="text-base">
              Your identity verification is being reviewed
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <Alert className="border-blue-200 bg-blue-50">
              <Shield className="h-5 w-5 text-blue-600" />
              <AlertTitle className="text-blue-900 font-bold">
                Thank You for Completing Verification!
              </AlertTitle>
              <AlertDescription className="text-blue-800 mt-2">
                <p className="mb-3">
                  Your profile and identity documents have been successfully submitted.
                  Our admin team is now reviewing your verification.
                </p>
                <div className="bg-white rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">Profile completed</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">Identity photo uploaded</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium">Admin review in progress</span>
                  </div>
                </div>
              </AlertDescription>
            </Alert>

            <div className="bg-white rounded-lg p-6 space-y-4">
              <h3 className="font-semibold text-lg">What happens next?</h3>
              <ol className="list-decimal list-inside space-y-3 text-sm text-gray-700">
                <li>
                  Our admin team will review your submitted documents (typically within 24 hours)
                </li>
                <li>
                  We will verify that your photo matches your national ID information
                </li>
                <li>
                  Once approved, you'll receive an email notification
                </li>
                <li>
                  You'll then have full access to request loans and use all platform features
                </li>
              </ol>
            </div>

            <Alert className="border-orange-200 bg-orange-50">
              <AlertDescription className="text-orange-900 text-sm">
                <strong>Important:</strong> You cannot request loans or access most features until
                your identity verification is approved by our admin team. This is a one-time process
                to ensure platform security and prevent fraud.
              </AlertDescription>
            </Alert>

            <div className="flex flex-col gap-3">
              <Button
                onClick={() => router.push('/b/reupload-selfie')}
                className="w-full"
              >
                <Camera className="h-4 w-4 mr-2" />
                Re-upload Selfie Photo
              </Button>
              <div className="flex gap-3">
                <Button
                  onClick={checkVerificationStatus}
                  variant="outline"
                  className="w-full"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Check Status
                </Button>
                <Button
                  onClick={() => router.push('/b/settings')}
                  variant="outline"
                  className="w-full"
                >
                  View Settings
                </Button>
              </div>
            </div>

            {submittedAt && (
              <p className="text-center text-xs text-gray-500">
                Submitted on {new Date(submittedAt).toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-gray-500">
          This page will automatically refresh and redirect you once approved
        </p>
      </div>
    </div>
  )
}
