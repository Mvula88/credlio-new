'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4 py-12">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <CardTitle className="text-2xl">Authentication Error</CardTitle>
            <CardDescription>
              The link you clicked is invalid or has expired.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-gray-600">
            <p>This can happen if:</p>
            <ul className="mt-2 space-y-1 text-left list-disc list-inside">
              <li>The link has already been used</li>
              <li>The link has expired (links expire after 24 hours)</li>
              <li>The link was copied incorrectly</li>
            </ul>
          </CardContent>
          <CardFooter className="flex flex-col space-y-2">
            <Link href="/l/forgot-password" className="w-full">
              <Button className="w-full">Request New Reset Link (Lender)</Button>
            </Link>
            <Link href="/b/forgot-password" className="w-full">
              <Button variant="outline" className="w-full">Request New Reset Link (Borrower)</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
