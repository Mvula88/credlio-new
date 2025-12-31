'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Mail, CheckCircle } from 'lucide-react'

function ConfirmEmailPageContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email')

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

            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                <p>Click the link in your email to confirm your account</p>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                <p>After confirming, you can sign in and complete your profile</p>
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
