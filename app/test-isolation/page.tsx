'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, AlertCircle, Shield, Globe, Users } from 'lucide-react'

export default function IsolationTestPage() {
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [allRequests, setAllRequests] = useState<any[]>([])
  const [visibleRequests, setVisibleRequests] = useState<any[]>([])
  const [isolationTest, setIsolationTest] = useState<any>(null)
  const supabase = createClient()

  useEffect(() => {
    runIsolationTest()
  }, [])

  const runIsolationTest = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setLoading(false)
        return
      }

      // Get user profile with country
      const { data: profile } = await supabase
        .from('profiles')
        .select('country_code, app_role')
        .eq('user_id', user.id)
        .single()

      setCurrentUser({
        email: user.email,
        country: profile?.country_code,
        role: profile?.app_role
      })

      // TEST 1: Try to get ALL loan requests (without country filter)
      // This simulates what would happen without proper isolation
      const { data: allRequestsData, error: allError } = await supabase
        .from('loan_requests')
        .select(`
          id,
          country_code,
          currency,
          amount_minor,
          status,
          borrowers(full_name, country_code)
        `)
        .eq('status', 'open')

      console.log('All requests query result:', allRequestsData)
      console.log('All requests error:', allError)

      // TEST 2: Get only visible requests (what marketplace shows)
      const { data: visibleRequestsData } = await supabase
        .from('loan_requests')
        .select(`
          id,
          country_code,
          currency,
          amount_minor,
          status,
          borrowers(full_name, country_code)
        `)
        .eq('status', 'open')
        .eq('country_code', profile?.country_code)

      setAllRequests(allRequestsData || [])
      setVisibleRequests(visibleRequestsData || [])

      // Run isolation analysis
      const analysis = analyzeIsolation(
        profile?.country_code,
        allRequestsData || [],
        visibleRequestsData || []
      )
      setIsolationTest(analysis)

    } catch (error) {
      console.error('Error running isolation test:', error)
    } finally {
      setLoading(false)
    }
  }

  const analyzeIsolation = (
    userCountry: string,
    allRequests: any[],
    visibleRequests: any[]
  ) => {
    const requestsByCountry = allRequests.reduce((acc, req) => {
      const country = req.country_code
      if (!acc[country]) acc[country] = []
      acc[country].push(req)
      return acc
    }, {} as Record<string, any[]>)

    const crossCountryRequests = allRequests.filter(
      req => req.country_code !== userCountry
    )

    const sameCountryRequests = allRequests.filter(
      req => req.country_code === userCountry
    )

    // Check if RLS is working (should only see same country)
    const rlsWorking = allRequests.length === sameCountryRequests.length

    // Check if app filter is working
    const appFilterWorking = visibleRequests.every(
      req => req.country_code === userCountry
    )

    return {
      userCountry,
      totalRequestsInDatabase: allRequests.length,
      sameCountryCount: sameCountryRequests.length,
      crossCountryCount: crossCountryRequests.length,
      visibleRequestsCount: visibleRequests.length,
      requestsByCountry,
      crossCountryRequests,
      rlsWorking,
      appFilterWorking,
      isolationStatus: rlsWorking ? 'PROTECTED' : 'VULNERABLE',
      canSeeCrossCountry: crossCountryRequests.length > 0
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!currentUser) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertCircle className="h-5 w-5 text-yellow-600" />
          <AlertTitle>Authentication Required</AlertTitle>
          <AlertDescription>
            Please log in to test country isolation. You need either a borrower or lender account.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Country Isolation Test</h1>
        <p className="text-gray-600 mt-1">Verify that data is properly isolated by country</p>
      </div>

      {/* Current User Info */}
      <Card className="border-2 border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5 text-blue-600" />
            <span>Your Account</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-600">Email</p>
              <p className="font-medium">{currentUser.email}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Country</p>
              <p className="font-medium text-lg">{currentUser.country}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Role</p>
              <p className="font-medium capitalize">{currentUser.role}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Isolation Status */}
      {isolationTest && (
        <Card className={`border-2 ${
          isolationTest.isolationStatus === 'PROTECTED'
            ? 'border-green-200 bg-green-50'
            : 'border-red-200 bg-red-50'
        }`}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center space-x-2">
                <Shield className={`h-5 w-5 ${
                  isolationTest.isolationStatus === 'PROTECTED'
                    ? 'text-green-600'
                    : 'text-red-600'
                }`} />
                <span>Isolation Status</span>
              </span>
              <Badge className={
                isolationTest.isolationStatus === 'PROTECTED'
                  ? 'bg-green-600'
                  : 'bg-red-600'
              }>
                {isolationTest.isolationStatus}
              </Badge>
            </CardTitle>
            <CardDescription>
              {isolationTest.isolationStatus === 'PROTECTED'
                ? 'Country isolation is working correctly'
                : 'WARNING: Cross-country data is visible'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-white rounded-lg">
                <p className="text-2xl font-bold text-blue-600">
                  {isolationTest.totalRequestsInDatabase}
                </p>
                <p className="text-xs text-gray-600">Total in DB</p>
              </div>
              <div className="text-center p-3 bg-white rounded-lg">
                <p className="text-2xl font-bold text-green-600">
                  {isolationTest.sameCountryCount}
                </p>
                <p className="text-xs text-gray-600">Your Country ({isolationTest.userCountry})</p>
              </div>
              <div className="text-center p-3 bg-white rounded-lg">
                <p className="text-2xl font-bold text-orange-600">
                  {isolationTest.crossCountryCount}
                </p>
                <p className="text-xs text-gray-600">Other Countries</p>
              </div>
              <div className="text-center p-3 bg-white rounded-lg">
                <p className="text-2xl font-bold text-purple-600">
                  {isolationTest.visibleRequestsCount}
                </p>
                <p className="text-xs text-gray-600">Visible to You</p>
              </div>
            </div>

            {/* Protection Checks */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                {isolationTest.rlsWorking ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                <span className="text-sm">
                  Database RLS (Row Level Security): {isolationTest.rlsWorking ? 'Working' : 'Failed'}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                {isolationTest.appFilterWorking ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                <span className="text-sm">
                  Application Filter: {isolationTest.appFilterWorking ? 'Working' : 'Failed'}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                {!isolationTest.canSeeCrossCountry ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                <span className="text-sm">
                  Cross-Country Blocking: {!isolationTest.canSeeCrossCountry ? 'Working' : 'Failed'}
                </span>
              </div>
            </div>

            {/* Interpretation */}
            {isolationTest.isolationStatus === 'PROTECTED' ? (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-900">✅ Perfect Isolation</AlertTitle>
                <AlertDescription className="text-green-800">
                  You can only see loan requests from <strong>{isolationTest.userCountry}</strong>.
                  {isolationTest.crossCountryCount > 0 && (
                    <span> There are {isolationTest.crossCountryCount} requests from other countries that are hidden from you.</span>
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="border-red-200 bg-red-50">
                <XCircle className="h-4 w-4 text-red-600" />
                <AlertTitle className="text-red-900">⚠️ Isolation Issue Detected</AlertTitle>
                <AlertDescription className="text-red-800">
                  You can see {isolationTest.crossCountryCount} loan requests from other countries!
                  This should not happen. Check RLS policies.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Requests by Country */}
      {isolationTest && Object.keys(isolationTest.requestsByCountry).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Globe className="h-5 w-5" />
              <span>Loan Requests by Country</span>
            </CardTitle>
            <CardDescription>
              Distribution of all loan requests in the database
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(isolationTest.requestsByCountry).map(([country, requests]: [string, any]) => {
                const isYourCountry = country === isolationTest.userCountry
                return (
                  <div
                    key={country}
                    className={`p-4 rounded-lg border-2 ${
                      isYourCountry
                        ? 'border-green-200 bg-green-50'
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="text-2xl font-bold">{country}</div>
                        {isYourCountry && (
                          <Badge className="bg-green-600">Your Country</Badge>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold">{requests.length}</p>
                        <p className="text-xs text-gray-600">loan requests</p>
                      </div>
                    </div>
                    {isYourCountry && (
                      <p className="text-sm text-green-700 mt-2">
                        ✅ You CAN see these {requests.length} request(s)
                      </p>
                    )}
                    {!isYourCountry && (
                      <p className="text-sm text-gray-600 mt-2">
                        🔒 You CANNOT see these {requests.length} request(s) (correctly blocked)
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Visible Requests Details */}
      {visibleRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Loan Requests You Can See</CardTitle>
            <CardDescription>
              These are the {visibleRequests.length} request(s) visible in your marketplace
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {visibleRequests.map((request) => (
                <div
                  key={request.id}
                  className="p-3 border rounded-lg bg-gray-50"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">
                        {request.borrowers?.full_name || 'Anonymous'}
                      </p>
                      <p className="text-sm text-gray-600">
                        {request.currency} {(request.amount_minor / 100).toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge>{request.country_code}</Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {visibleRequests.length === 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No Loan Requests</AlertTitle>
          <AlertDescription>
            There are no loan requests from borrowers in {currentUser.country}.
            Create a borrower account in {currentUser.country} and submit a loan request to test.
          </AlertDescription>
        </Alert>
      )}

      {/* Refresh Button */}
      <div className="flex justify-center">
        <Button onClick={runIsolationTest} size="lg">
          Refresh Test
        </Button>
      </div>
    </div>
  )
}
