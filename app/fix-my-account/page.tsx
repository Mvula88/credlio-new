'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle, Loader2, AlertCircle, Info } from 'lucide-react'

export default function FixAccountPage() {
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [accountInfo, setAccountInfo] = useState<any>(null)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    checkAccount()
  }, [])

  const checkAccount = async () => {
    try {
      setChecking(true)
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setError('No user logged in')
        return
      }

      // Check account status
      const response = await fetch(`/api/check-account?userId=${user.id}`)
      const data = await response.json()

      if (response.ok) {
        setAccountInfo(data)
      }
    } catch (err: any) {
      console.error('Error checking account:', err)
    } finally {
      setChecking(false)
    }
  }

  const fixAccount = async () => {
    try {
      setLoading(true)
      setError(null)
      setResult(null)

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setError('No user logged in')
        return
      }

      // Call the fix API
      const response = await fetch('/api/fix-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user.id }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to fix account')
        return
      }

      setResult(data)
      // Refresh account info
      await checkAccount()
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Account Diagnostic & Fix</CardTitle>
          <CardDescription>
            Check and repair missing database records
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {checking ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : accountInfo && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium mb-3">Current Account Status:</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span>Profile:</span>
                      <span className={accountInfo.profile.error ? 'text-red-600' : 'text-green-600'}>
                        {accountInfo.profile.error ? `❌ ${accountInfo.profile.error}` : '✅ Exists'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Lender Record:</span>
                      <span className={accountInfo.lender.error ? 'text-red-600' : 'text-green-600'}>
                        {accountInfo.lender.error ? `❌ ${accountInfo.lender.error}` : '✅ Exists'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Subscription:</span>
                      <span className={accountInfo.subscription.error ? 'text-red-600' : 'text-green-600'}>
                        {accountInfo.subscription.error ? `❌ ${accountInfo.subscription.error}` : '✅ Exists'}
                      </span>
                    </div>
                  </div>
                  {accountInfo.lender && !accountInfo.lender.error && (
                    <div className="mt-4 p-2 bg-blue-50 rounded text-xs">
                      <p className="font-medium">Lender User ID: {accountInfo.lender.user_id}</p>
                      <p>User ID: {accountInfo.userId}</p>
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {result && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                <div className="space-y-2">
                  <p className="font-medium">{result.message}</p>
                  <ul className="text-sm space-y-1">
                    <li>Profile: {result.data?.profile}</li>
                    <li>Lender: {result.data?.lender}</li>
                    <li>Subscription: {result.data?.subscription}</li>
                  </ul>
                  <p className="mt-4">
                    <a href="/l/overview" className="text-green-600 hover:text-green-700 font-medium">
                      Go to Dashboard →
                    </a>
                  </p>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {accountInfo?.lender && !accountInfo.lender.error &&
           accountInfo?.subscription && !accountInfo.subscription.error ? (
            <div className="text-center py-4">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
              <p className="text-green-700 font-medium">All records exist!</p>
              <p className="text-sm text-gray-600 mt-2">Your account is properly configured.</p>
              <Button
                onClick={() => window.location.href = '/l/overview'}
                className="mt-4"
              >
                Go to Dashboard
              </Button>
            </div>
          ) : (
            <Button
              onClick={fixAccount}
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Fixing...
                </>
              ) : (
                'Fix Missing Records'
              )}
            </Button>
          )}

          <p className="text-xs text-gray-500 text-center">
            This tool creates any missing lender or subscription records for your account using admin privileges.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
