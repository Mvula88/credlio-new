'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Mail, CheckCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

function ConfirmEmailPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const email = searchParams.get('email')
  const [checking, setChecking] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  // Auto-check for email confirmation every 3 seconds
  useEffect(() => {
    if (!email) return

    const supabase = createClient()
    let interval: NodeJS.Timeout

    const checkConfirmation = async () => {
      setChecking(true)

      // Try to get session - if user confirmed from another device, session might exist
      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user?.email_confirmed_at) {
        setConfirmed(true)
        clearInterval(interval)
        // Redirect to onboarding after brief delay
        setTimeout(() => {
          router.push('/b/onboarding')
        }, 1500)
        return
      }

      // Also try signing in silently to check if email was confirmed
      // This won't work without password, but we can use getUser if there's a session
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email_confirmed_at) {
        setConfirmed(true)
        clearInterval(interval)
        setTimeout(() => {
          router.push('/b/onboarding')
        }, 1500)
        return
      }

      setChecking(false)
    }

    // Check immediately
    checkConfirmation()

    // Then check every 3 seconds
    interval = setInterval(checkConfirmation, 3000)

    return () => clearInterval(interval)
  }, [email, router])

  if (confirmed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 px-4 py-12">
        <div className="w-full max-w-md">
          <Card>
            <CardHeader className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <div>
                <CardTitle className="text-2xl">Email Confirmed!</CardTitle>
                <CardDescription className="mt-2">
                  Redirecting you to complete your profile...
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/borrower" className="inline-flex items-center space-x-2">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg" />
            <span className="text-2xl font-bold">Credlio</span>
          </Link>
        </div>

        <Card>
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <Mail className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <CardTitle className="text-2xl">Check Your Email</CardTitle>
              <CardDescription className="mt-2">
                We've sent a confirmation link to your email
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {email && (
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-600">Confirmation sent to:</p>
                <p className="font-medium text-gray-900">{email}</p>
              </div>
            )}

            {checking && (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Waiting for confirmation...</span>
              </div>
            )}

            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                <p>Click the link in your email to confirm your account</p>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                <p>This page will automatically redirect when confirmed</p>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                <p>The link expires in 1 hour</p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
              <p><strong>Didn't receive the email?</strong></p>
              <p className="mt-1">Check your spam folder or try registering again.</p>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-3">
            <Button asChild className="w-full">
              <Link href="/b/login">Go to Sign In</Link>
            </Button>
            <p className="text-sm text-center text-gray-500">
              Already confirmed?{' '}
              <Link href="/b/login" className="text-blue-600 hover:text-blue-700 font-medium">
                Sign in here
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}

export default function ConfirmEmailPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
      <ConfirmEmailPageContent />
    </Suspense>
  )
}
