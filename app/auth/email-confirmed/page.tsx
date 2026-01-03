'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, Laptop, Smartphone } from 'lucide-react'

function EmailConfirmedContent() {
  const searchParams = useSearchParams()
  const role = searchParams.get('role') || 'lender'
  const loginUrl = role === 'borrower' ? '/b/login' : '/l/login'
  const roleName = role === 'borrower' ? 'Borrower' : 'Lender'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center space-x-2">
            <div className="w-10 h-10 bg-gradient-to-br from-green-600 to-blue-600 rounded-lg" />
            <span className="text-2xl font-bold">Credlio</span>
          </Link>
        </div>

        <Card>
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <CardTitle className="text-2xl">Email Confirmed!</CardTitle>
              <CardDescription className="mt-2">
                Your email has been verified successfully
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="text-green-800 font-medium">
                You can now sign in from any device
              </p>
            </div>

            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex items-start gap-3">
                <Laptop className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                <p>If you signed up on a laptop, go back to your laptop and sign in there</p>
              </div>
              <div className="flex items-start gap-3">
                <Smartphone className="h-5 w-5 text-purple-500 mt-0.5 flex-shrink-0" />
                <p>Or continue on this device by clicking the button below</p>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-3">
            <Button asChild className="w-full">
              <Link href={loginUrl}>Sign In as {roleName}</Link>
            </Button>
            <p className="text-xs text-center text-gray-500">
              After signing in, you'll complete your profile setup
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}

export default function EmailConfirmedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    }>
      <EmailConfirmedContent />
    </Suspense>
  )
}
