'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  User,
  Phone,
  Mail,
  Calendar,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Target,
  Shield,
  ArrowLeft,
  CreditCard,
  History,
  Award,
  Flag
} from 'lucide-react'
import { format, isPast } from 'date-fns'
import { RadialBarChart, RadialBar, ResponsiveContainer, Tooltip } from 'recharts'
import { getCurrencyByCountry, formatCurrency as formatCurrencyUtil } from '@/lib/utils/currency'

export default function AdminBorrowerProfilePage() {
  const params = useParams()
  const router = useRouter()
  const borrowerId = params.id as string
  const [borrower, setBorrower] = useState<any>(null)
  const [loans, setLoans] = useState<any[]>([])
  const [riskFlags, setRiskFlags] = useState<any[]>([])
  const [verificationStatus, setVerificationStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    loadBorrowerProfile()
  }, [borrowerId])

  const loadBorrowerProfile = async () => {
    try {
      // Verify admin
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/admin/login')
        return
      }

      // Get borrower info
      const { data: borrowerData, error: borrowerError } = await supabase
        .from('borrowers')
        .select(`
          *,
          borrower_scores(score)
        `)
        .eq('id', borrowerId)
        .single()

      if (borrowerError) {
        console.error('Error fetching borrower:', borrowerError)
        throw borrowerError
      }

      setBorrower(borrowerData)

      // Get ALL loans for this borrower
      const { data: loansData, error: loansError } = await supabase
        .from('loans')
        .select(`
          *,
          lenders(business_name, email),
          repayment_schedules(
            *,
            repayment_events(*)
          )
        `)
        .eq('borrower_id', borrowerId)
        .order('created_at', { ascending: false })

      if (loansError) {
        console.error('Error fetching loans:', loansError)
        throw loansError
      }

      setLoans(loansData || [])

      // Get risk flags
      const { data: flagsData, error: flagsError } = await supabase
        .from('risk_flags')
        .select('*')
        .eq('borrower_id', borrowerId)
        .order('created_at', { ascending: false })

      if (flagsError) {
        console.error('Error fetching risk flags:', flagsError)
        throw flagsError
      }

      setRiskFlags(flagsData || [])

      // Get verification status
      const { data: verificationData, error: verificationError } = await supabase
        .from('borrower_self_verification_status')
        .select('*')
        .eq('borrower_id', borrowerId)
        .single()

      if (verificationError && verificationError.code !== 'PGRST116') {
        console.error('Error fetching verification status:', verificationError)
      }

      setVerificationStatus(verificationData || null)
    } catch (error) {
      console.error('Error loading borrower profile:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      console.error('Error message:', error instanceof Error ? error.message : 'Unknown error')
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    } finally {
      setLoading(false)
    }
  }

  const getPaymentAnalytics = (loan: any) => {
    if (!loan || !loan.repayment_schedules) {
      return {
        totalPayments: 0,
        paidPayments: 0,
        onTimePayments: 0,
        latePayments: 0,
        pendingPayments: 0,
        overduePayments: 0,
        progressPercentage: 0,
        paymentHealthScore: 0,
      }
    }

    const schedules = loan.repayment_schedules
    const totalPayments = schedules.length
    const paidPayments = schedules.filter((s: any) => s.status === 'paid').length

    let onTimePayments = 0
    let latePayments = 0

    schedules.forEach((s: any) => {
      if (s.status === 'paid' && s.paid_at) {
        const dueDate = new Date(s.due_date)
        const paidDate = new Date(s.paid_at)
        if (paidDate <= dueDate) {
          onTimePayments++
        } else {
          latePayments++
        }
      }
    })

    const pendingPayments = schedules.filter((s: any) => s.status === 'pending').length
    const overduePayments = schedules.filter((s: any) => {
      if (s.status === 'paid') return false
      return isPast(new Date(s.due_date))
    }).length

    const progressPercentage = totalPayments > 0 ? Math.round((paidPayments / totalPayments) * 100) : 0

    let healthScore = 100
    if (paidPayments > 0) {
      healthScore = Math.round((onTimePayments / paidPayments) * 100)
    }
    if (overduePayments > 0) {
      healthScore = Math.max(0, healthScore - (overduePayments * 10))
    }

    return {
      totalPayments,
      paidPayments,
      onTimePayments,
      latePayments,
      pendingPayments,
      overduePayments,
      progressPercentage,
      paymentHealthScore: healthScore,
    }
  }

  const getOverallPaymentAnalytics = () => {
    if (loans.length === 0) {
      return {
        totalOnTime: 0,
        totalLate: 0,
        totalOverdue: 0,
        totalPaid: 0,
        onTimePaymentRate: 0,
        averageHealthScore: 0,
      }
    }

    let totalOnTime = 0
    let totalLate = 0
    let totalOverdue = 0
    let totalPaid = 0

    loans.forEach(loan => {
      const analytics = getPaymentAnalytics(loan)
      totalOnTime += analytics.onTimePayments
      totalLate += analytics.latePayments
      totalOverdue += analytics.overduePayments
      totalPaid += analytics.paidPayments
    })

    const onTimeRate = totalPaid > 0 ? Math.round((totalOnTime / totalPaid) * 100) : 0
    const healthScores = loans.map(l => getPaymentAnalytics(l).paymentHealthScore).filter(s => s > 0)
    const avgHealth = healthScores.length > 0 ? Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length) : 0

    return {
      totalOnTime,
      totalLate,
      totalOverdue,
      totalPaid,
      onTimePaymentRate: onTimeRate,
      averageHealthScore: avgHealth,
    }
  }

  const getRadialChartData = (percentage: number, healthScore: number) => {
    return [
      {
        name: 'Payment Performance',
        value: percentage,
        fill: healthScore >= 80 ? '#22c55e' :
              healthScore >= 60 ? '#eab308' : '#ef4444',
      },
    ]
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800">Active</Badge>
      case 'completed':
        return <Badge className="bg-blue-100 text-blue-800">Completed</Badge>
      case 'defaulted':
        return <Badge variant="destructive">Defaulted</Badge>
      case 'written_off':
        return <Badge variant="secondary">Written Off</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getRiskBadge = (type: string) => {
    const badges: Record<string, { label: string; variant: any }> = {
      'LATE_1_7': { label: 'Late 1-7 days', variant: 'secondary' },
      'LATE_8_30': { label: 'Late 8-30 days', variant: 'secondary' },
      'LATE_31_60': { label: 'Late 31-60 days', variant: 'destructive' },
      'DEFAULT': { label: 'Defaulted', variant: 'destructive' },
      'CLEARED': { label: 'Cleared', variant: 'outline' },
    }
    return badges[type] || { label: type, variant: 'outline' }
  }

  const formatCurrency = (amountMinor: number, countryCode?: string) => {
    if (countryCode) {
      const currency = getCurrencyByCountry(countryCode)
      if (currency) {
        return formatCurrencyUtil(amountMinor, currency)
      }
    }
    // USD fallback
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amountMinor / 100)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    )
  }

  if (!borrower) {
    return (
      <div className="container mx-auto py-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Borrower not found</AlertDescription>
        </Alert>
      </div>
    )
  }

  const overallAnalytics = getOverallPaymentAnalytics()
  const creditScore = borrower.borrower_scores?.[0]?.score || 500
  // Only count loans that have actually been disbursed (active, completed, defaulted, written_off)
  const disbursedStatuses = ['active', 'completed', 'defaulted', 'written_off']
  const totalDisbursed = loans
    .filter(l => disbursedStatuses.includes(l.status))
    .reduce((sum, l) => sum + (l.principal_minor || 0), 0)
  const activeLoans = loans.filter(l => l.status === 'active').length
  const activeRiskFlags = riskFlags.filter(f => !f.resolved_at).length

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button
        variant="ghost"
        onClick={() => router.push('/admin/borrowers')}
        className="mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to All Borrowers
      </Button>

      {/* Header - Borrower Info Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div className="space-y-4 flex-1">
              <div className="flex items-center gap-3">
                <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                  <User className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">{borrower.full_name}</h1>
                  <p className="text-gray-600">Complete Admin View - Payment History & Risk Profile</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-2 text-gray-700">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <span>{borrower.phone_e164}</span>
                </div>
                {borrower.email && (
                  <div className="flex items-center gap-2 text-gray-700">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <span>{borrower.email}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-gray-700">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span>Member since {format(new Date(borrower.created_at), 'MMM yyyy')}</span>
                </div>
              </div>

              {activeRiskFlags > 0 && (
                <Alert variant="destructive">
                  <Flag className="h-4 w-4" />
                  <AlertDescription>
                    <strong>{activeRiskFlags} Active Risk Flag{activeRiskFlags > 1 ? 's' : ''}</strong>
                    <br />
                    This borrower has unresolved risk flags. Review details below.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <div className="text-right">
              <div className="text-5xl font-bold">
                <span className={
                  creditScore >= 700 ? 'text-green-600' :
                  creditScore >= 600 ? 'text-yellow-600' :
                  creditScore >= 500 ? 'text-orange-600' : 'text-red-600'
                }>
                  {creditScore}
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1">Credit Score</p>
              <Badge className="mt-2" variant={creditScore >= 700 ? 'default' : 'secondary'}>
                <TrendingUp className="h-3 w-3 mr-1" />
                {creditScore >= 700 ? 'Excellent' : creditScore >= 600 ? 'Good' : 'Fair'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Verification Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle>Verification Status</CardTitle>
          </div>
          <CardDescription>Identity verification and KYC status</CardDescription>
        </CardHeader>
        <CardContent>
          {verificationStatus ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status</span>
                <Badge className={
                  verificationStatus.verification_status === 'approved' ? 'bg-green-100 text-green-800' :
                  verificationStatus.verification_status === 'pending' ? 'bg-blue-100 text-blue-800' :
                  verificationStatus.verification_status === 'rejected' ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-800'
                }>
                  {verificationStatus.verification_status === 'approved' && <CheckCircle className="h-3 w-3 mr-1" />}
                  {verificationStatus.verification_status === 'pending' && <AlertTriangle className="h-3 w-3 mr-1" />}
                  {verificationStatus.verification_status?.charAt(0).toUpperCase() + verificationStatus.verification_status?.slice(1) || 'Unknown'}
                </Badge>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">Selfie Uploaded</p>
                  <p className="font-semibold">{verificationStatus.selfie_uploaded ? 'Yes' : 'No'}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">Documents</p>
                  <p className="font-semibold">{verificationStatus.documents_uploaded || 0} / {verificationStatus.documents_required || 1}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">Risk Level</p>
                  <p className={`font-semibold ${
                    verificationStatus.overall_risk_level === 'low' ? 'text-green-600' :
                    verificationStatus.overall_risk_level === 'medium' ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {verificationStatus.overall_risk_level?.charAt(0).toUpperCase() + verificationStatus.overall_risk_level?.slice(1) || 'Unknown'}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">Risk Score</p>
                  <p className="font-semibold">{verificationStatus.overall_risk_score || 0}</p>
                </div>
              </div>

              {verificationStatus.duplicate_detected && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Duplicate Detected!</strong> This borrower may have another account in the system.
                  </AlertDescription>
                </Alert>
              )}

              {verificationStatus.rejection_reason && verificationStatus.verification_status === 'rejected' && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Rejection Reason:</strong> {verificationStatus.rejection_reason}
                  </AlertDescription>
                </Alert>
              )}

              {verificationStatus.rejection_reason && verificationStatus.verification_status === 'pending' && (
                <Alert className="bg-blue-50 border-blue-200">
                  <AlertTriangle className="h-4 w-4 text-blue-600" />
                  <AlertDescription>
                    <strong>Review Note:</strong> {verificationStatus.rejection_reason}
                  </AlertDescription>
                </Alert>
              )}

              {verificationStatus.admin_override && (
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Admin Override:</strong> Verification was manually overridden by an admin
                    {verificationStatus.admin_notes && <><br />Notes: {verificationStatus.admin_notes}</>}
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                {verificationStatus.started_at && (
                  <div>
                    <span className="text-gray-500">Started:</span>{' '}
                    {format(new Date(verificationStatus.started_at), 'MMM dd, yyyy HH:mm')}
                  </div>
                )}
                {verificationStatus.verified_at && (
                  <div>
                    <span className="text-gray-500">Verified:</span>{' '}
                    {format(new Date(verificationStatus.verified_at), 'MMM dd, yyyy HH:mm')}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-gray-500">
              <Shield className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              <p>No verification record found for this borrower</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Loans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loans.length}</div>
            <p className="text-xs text-gray-500">{activeLoans} active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Disbursed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalDisbursed, borrower.country_code)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Payment Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${
              overallAnalytics.averageHealthScore >= 80 ? 'text-green-600' :
              overallAnalytics.averageHealthScore >= 60 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {overallAnalytics.averageHealthScore}%
            </div>
            <p className="text-xs text-gray-500">Average score</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">On-Time Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${
              overallAnalytics.onTimePaymentRate >= 80 ? 'text-green-600' :
              overallAnalytics.onTimePaymentRate >= 60 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {overallAnalytics.onTimePaymentRate}%
            </div>
            <p className="text-xs text-gray-500">{overallAnalytics.totalOnTime} on-time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Risk Flags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${activeRiskFlags > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {activeRiskFlags}
            </div>
            <p className="text-xs text-gray-500">{riskFlags.length} total</p>
          </CardContent>
        </Card>
      </div>

      {/* Risk Flags Section */}
      {riskFlags.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Flag className="h-5 w-5 text-red-600" />
              <CardTitle>Risk Flags</CardTitle>
            </div>
            <CardDescription>All risk flags for this borrower</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {riskFlags.map((flag) => (
                <div key={flag.id} className={`p-4 rounded-lg border-2 ${
                  flag.resolved_at ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge {...getRiskBadge(flag.type)}>
                          {getRiskBadge(flag.type).label}
                        </Badge>
                        <Badge variant={flag.origin === 'LENDER_REPORTED' ? 'default' : 'secondary'}>
                          {flag.origin === 'LENDER_REPORTED' ? 'Lender Reported' : 'System Auto'}
                        </Badge>
                        {flag.resolved_at && (
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Resolved
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-700">{flag.reason}</p>
                      <p className="text-xs text-gray-500">
                        Created: {format(new Date(flag.created_at), 'MMM dd, yyyy')}
                        {flag.resolved_at && ` • Resolved: ${format(new Date(flag.resolved_at), 'MMM dd, yyyy')}`}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overall Payment History Summary */}
      {loans.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              <CardTitle>Complete Payment History</CardTitle>
            </div>
            <CardDescription>
              Permanent record across all loans - never deleted, automatically triggers risk flags
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Circular Chart */}
              <div className="flex flex-col items-center justify-center">
                <ResponsiveContainer width="100%" height={250}>
                  <RadialBarChart
                    cx="50%"
                    cy="50%"
                    innerRadius="60%"
                    outerRadius="100%"
                    data={getRadialChartData(overallAnalytics.onTimePaymentRate, overallAnalytics.averageHealthScore)}
                    startAngle={90}
                    endAngle={-270}
                  >
                    <RadialBar
                      minAngle={15}
                      background
                      clockWise
                      dataKey="value"
                      cornerRadius={10}
                    />
                    <Tooltip />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="text-center -mt-8">
                  <p className="text-4xl font-bold">
                    {overallAnalytics.onTimePaymentRate}%
                  </p>
                  <p className="text-sm text-gray-600 mt-1">On-Time Payment Rate</p>
                  <Badge className="mt-2" variant={
                    overallAnalytics.averageHealthScore >= 80 ? 'default' :
                    overallAnalytics.averageHealthScore >= 60 ? 'secondary' : 'destructive'
                  }>
                    <Award className="h-3 w-3 mr-1" />
                    Health Score: {overallAnalytics.averageHealthScore}%
                  </Badge>
                </div>
              </div>

              {/* Payment Statistics */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                    <div>
                      <p className="text-2xl font-bold text-green-900">{overallAnalytics.totalOnTime}</p>
                      <p className="text-sm text-green-700">On-Time Payments</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg">
                    <AlertTriangle className="h-8 w-8 text-yellow-600" />
                    <div>
                      <p className="text-2xl font-bold text-yellow-900">{overallAnalytics.totalLate}</p>
                      <p className="text-sm text-yellow-700">Late Payments</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
                    <AlertTriangle className="h-8 w-8 text-red-600" />
                    <div>
                      <p className="text-2xl font-bold text-red-900">{overallAnalytics.totalOverdue}</p>
                      <p className="text-sm text-red-700">Overdue</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                    <CreditCard className="h-8 w-8 text-blue-600" />
                    <div>
                      <p className="text-2xl font-bold text-blue-900">{overallAnalytics.totalPaid}</p>
                      <p className="text-sm text-blue-700">Total Paid</p>
                    </div>
                  </div>
                </div>

                <Alert className={
                  overallAnalytics.averageHealthScore >= 80 ? 'bg-green-50 border-green-200' :
                  overallAnalytics.averageHealthScore >= 60 ? 'bg-yellow-50 border-yellow-200' :
                  'bg-red-50 border-red-200'
                }>
                  <Shield className={`h-4 w-4 ${
                    overallAnalytics.averageHealthScore >= 80 ? 'text-green-600' :
                    overallAnalytics.averageHealthScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                  }`} />
                  <AlertDescription>
                    <strong>Admin Assessment:</strong>
                    <br />
                    {overallAnalytics.averageHealthScore >= 80 ? 'Excellent borrower with strong payment history. Low risk for system.' :
                     overallAnalytics.averageHealthScore >= 60 ? 'Decent borrower with acceptable payment history. Moderate risk.' :
                     'High-risk borrower with poor payment history. Monitor closely.'}
                  </AlertDescription>
                </Alert>

                <Alert className="bg-blue-50 border-blue-200">
                  <Shield className="h-4 w-4 text-blue-600" />
                  <AlertDescription>
                    <strong>System Note:</strong> Payment history is permanent and automatically triggers risk flags when performance deteriorates.
                  </AlertDescription>
                </Alert>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Loans */}
      <Card>
        <CardHeader>
          <CardTitle>All Loans ({loans.length})</CardTitle>
          <CardDescription>Complete loan history including active, completed, and past loans</CardDescription>
        </CardHeader>
        <CardContent>
          {loans.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No loans found for this borrower
            </div>
          ) : (
            <div className="space-y-6">
              {loans.map((loan) => {
                const analytics = getPaymentAnalytics(loan)
                return (
                  <Card key={loan.id} className="border-2">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">
                            {formatCurrency(loan.principal_minor || 0, loan.country_code)} Loan
                          </CardTitle>
                          <CardDescription>
                            {loan.term_months} months @ {((loan.apr_bps || 0) / 100).toFixed(2)}% APR
                            <br />
                            Lender: {loan.lenders?.business_name || 'Unknown'}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(loan.status)}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/admin/loans/${loan.id}`)}
                          >
                            View Details
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Small Circular Chart */}
                        <div className="flex flex-col items-center justify-center">
                          <ResponsiveContainer width="100%" height={180}>
                            <RadialBarChart
                              cx="50%"
                              cy="50%"
                              innerRadius="60%"
                              outerRadius="100%"
                              data={getRadialChartData(analytics.progressPercentage, analytics.paymentHealthScore)}
                              startAngle={90}
                              endAngle={-270}
                            >
                              <RadialBar
                                minAngle={15}
                                background
                                clockWise
                                dataKey="value"
                                cornerRadius={10}
                              />
                            </RadialBarChart>
                          </ResponsiveContainer>
                          <div className="text-center -mt-6">
                            <p className="text-2xl font-bold">{analytics.progressPercentage}%</p>
                            <p className="text-xs text-gray-600">Complete</p>
                            <Badge className="mt-1" variant={
                              analytics.paymentHealthScore >= 80 ? 'default' :
                              analytics.paymentHealthScore >= 60 ? 'secondary' : 'destructive'
                            }>
                              Health: {analytics.paymentHealthScore}%
                            </Badge>
                          </div>
                        </div>

                        {/* Payment Stats */}
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                              <CheckCircle className="h-4 w-4 text-green-600" />
                              <div>
                                <p className="text-lg font-bold">{analytics.onTimePayments}</p>
                                <p className="text-xs text-gray-600">On-Time</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                              <AlertTriangle className="h-4 w-4 text-yellow-600" />
                              <div>
                                <p className="text-lg font-bold">{analytics.latePayments}</p>
                                <p className="text-xs text-gray-600">Late</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                              <Target className="h-4 w-4 text-blue-600" />
                              <div>
                                <p className="text-lg font-bold">{analytics.pendingPayments}</p>
                                <p className="text-xs text-gray-600">Pending</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                              <AlertTriangle className="h-4 w-4 text-red-600" />
                              <div>
                                <p className="text-lg font-bold">{analytics.overduePayments}</p>
                                <p className="text-xs text-gray-600">Overdue</p>
                              </div>
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 mt-2">
                            Created: {format(new Date(loan.created_at), 'MMM dd, yyyy')}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
