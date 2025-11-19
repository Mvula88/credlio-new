'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  CreditCard,
  TrendingUp,
  Calendar,
  DollarSign,
  CheckCircle,
  Clock,
  Shield,
  FileText,
  BarChart3,
  Target,
  Award,
  AlertTriangle,
  XCircle
} from 'lucide-react'
import { format, differenceInDays, isPast } from 'date-fns'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadialBarChart,
  RadialBar
} from 'recharts'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { VerificationStatusBanner } from '@/components/verification-status-banner'
import { getCurrencyByCountry, formatCurrency as formatCurrencyUtil, type CurrencyInfo } from '@/lib/utils/currency'

export default function BorrowerOverviewPage() {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [borrower, setBorrower] = useState<any>(null)
  const [borrowerCurrency, setBorrowerCurrency] = useState<CurrencyInfo | null>(null)
  const [verificationStatus, setVerificationStatus] = useState<any>(null)
  const [activeLoan, setActiveLoan] = useState<any>(null)
  const [creditScore, setCreditScore] = useState<any>(null)
  const [nextPayment, setNextPayment] = useState<any>(null)
  const [recentPayments, setRecentPayments] = useState<any[]>([])
  const [authorized, setAuthorized] = useState(false)
  const [checking, setChecking] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  // Quick verification check on mount - redirect IMMEDIATELY if not verified
  useEffect(() => {
    const quickCheck = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/b/login')
        return
      }

      const { data: linkData } = await supabase
        .from('borrower_user_links')
        .select('borrower_id')
        .eq('user_id', user.id)
        .single()

      if (!linkData) {
        router.push('/b/onboarding')
        return
      }

      const { data: verifyStatus } = await supabase
        .from('borrower_self_verification_status')
        .select('verification_status')
        .eq('borrower_id', linkData.borrower_id)
        .single()

      if (!verifyStatus || verifyStatus.verification_status !== 'approved') {
        if (verifyStatus?.verification_status === 'pending') {
          router.push('/b/pending-verification')
        } else {
          router.push('/b/onboarding')
        }
        return
      }

      // Only if approved, allow loading the full dashboard
      setChecking(false)
      loadDashboardData()
    }

    quickCheck()
  }, [])

  useEffect(() => {
    // Empty dependency to prevent auto-load - quickCheck handles it
  }, [])

  const loadDashboardData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/b/login')
        return
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (!profileData) {
        router.push('/b/login')
        return
      }

      setProfile(profileData)

      if (!profileData.onboarding_completed) {
        router.push('/b/onboarding')
        return
      }

      const { data: linkData } = await supabase
        .from('borrower_user_links')
        .select('borrower_id')
        .eq('user_id', user.id)
        .single()

      if (linkData) {
        const { data: borrowerData } = await supabase
          .from('borrowers')
          .select(`
            *,
            borrower_scores(
              score,
              factors,
              updated_at
            )
          `)
          .eq('id', linkData.borrower_id)
          .single()

        if (borrowerData) {
          setBorrower(borrowerData)
          setCreditScore(borrowerData.borrower_scores?.[0])

          // Get borrower's currency
          const currency = getCurrencyByCountry(borrowerData.country_code)
          if (currency) {
            setBorrowerCurrency(currency)
          }

          // Load verification status
          const { data: verifyStatus } = await supabase
            .from('borrower_self_verification_status')
            .select('*')
            .eq('borrower_id', borrowerData.id)
            .single()

          setVerificationStatus(verifyStatus)

          // STRICT REDIRECT: Users MUST be approved to see overview
          if (!verifyStatus || verifyStatus.verification_status !== 'approved') {
            if (verifyStatus?.verification_status === 'pending') {
              router.push('/b/pending-verification')
            } else if (verifyStatus?.verification_status === 'rejected') {
              router.push('/b/onboarding')
            } else {
              router.push('/b/onboarding')
            }
            return
          }

          // If we reach here, user is fully verified
          setAuthorized(true)

          const { data: loanData } = await supabase
            .from('loans')
            .select(`
              *,
              lenders(
                business_name
              ),
              repayment_schedules(
                *
              )
            `)
            .eq('borrower_id', borrowerData.id)
            .eq('status', 'active')
            .single()

          if (loanData) {
            setActiveLoan(loanData)

            const pending = loanData.repayment_schedules
              ?.filter((s: any) => s.status === 'pending')
              ?.sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())

            if (pending && pending.length > 0) {
              setNextPayment(pending[0])
            }
          }

          const { data: payments } = await supabase
            .from('repayment_events')
            .select(`
              *,
              loans(
                currency
              )
            `)
            .eq('loans.borrower_id', borrowerData.id)
            .order('created_at', { ascending: false })
            .limit(6)

          setRecentPayments(payments || [])
        }
      }
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amountMinor: number) => {
    if (!borrowerCurrency) {
      // Fallback to USD if currency info not loaded yet
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
      }).format(amountMinor / 100)
    }
    return formatCurrencyUtil(amountMinor, borrowerCurrency)
  }

  const getCreditScoreColor = (score: number) => {
    if (score >= 700) return '#5b7fc7'  // Light navy for excellent
    if (score >= 550) return '#1e40af'  // Electric blue for good
    return '#0f3460'  // Navy for needs improvement
  }

  const getCreditScoreLabel = (score: number) => {
    if (score >= 750) return 'Excellent'
    if (score >= 700) return 'Good'
    if (score >= 650) return 'Fair'
    if (score >= 550) return 'Below Average'
    return 'Poor'
  }

  const calculateLoanProgress = () => {
    if (!activeLoan) return 0
    // Calculate total repaid from repayment events
    const totalPaid = recentPayments.reduce((sum, p) => sum + ((p.amount_minor || 0) / 100), 0)
    const totalDue = (activeLoan.total_minor || 0) / 100
    return totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0
  }

  const getPaymentAnalytics = () => {
    if (!activeLoan || !activeLoan.repayment_schedules) {
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

    const schedules = activeLoan.repayment_schedules
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

    // Health score: 100 if all on time, decrease for late/overdue payments
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

  const getRadialChartData = () => {
    const analytics = getPaymentAnalytics()

    return [
      {
        name: 'Loan Progress',
        value: analytics.progressPercentage,
        fill: analytics.paymentHealthScore >= 80 ? '#22c55e' :
              analytics.paymentHealthScore >= 60 ? '#eab308' : '#ef4444',
      },
    ]
  }

  // Score factors for chart
  const factorsData = creditScore?.factors ? Object.entries(creditScore.factors).map(([key, value]) => ({
    name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    value: value as number
  })) : []

  // Payment history chart data
  const paymentChartData = recentPayments.slice(0, 6).reverse().map((payment, idx) => ({
    date: format(new Date(payment.payment_date || payment.created_at), 'MMM dd'),
    amount: (payment.amount_minor || 0) / 100,
  }))

  // Show loading while doing initial verification check
  if (checking || loading || !authorized) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground font-medium">
            {checking ? 'Checking verification...' : 'Verifying access...'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      {/* Modern Tech Header */}
      <div className="tech-header p-8 mb-8 rounded-2xl shadow-lg">
        <div className="max-w-7xl mx-auto relative z-10">
          <h1 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">
            Credit Bureau Dashboard
          </h1>
          <p className="text-white/90 text-lg font-medium drop-shadow">
            {profile?.full_name} • Account Overview • {format(new Date(), 'MMMM dd, yyyy')}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6">
        {/* Identity Verification Warning */}
        {verificationStatus && verificationStatus.verification_status !== 'approved' && (
          <Alert className="border-orange-200 bg-orange-50">
            <Shield className="h-5 w-5 text-orange-600" />
            <AlertTitle className="text-orange-900 text-lg font-bold">Action Required: Complete Identity Verification</AlertTitle>
            <AlertDescription className="text-orange-800">
              <p className="mb-3">
                You must verify your identity before you can request loans. This protects both you and lenders from fraud.
              </p>
              <Button onClick={() => router.push('/b/verify')} className="bg-orange-600 hover:bg-orange-700">
                Complete Verification Now
              </Button>
              {verificationStatus.verification_status === 'rejected' && (
                <p className="mt-3 text-sm text-red-700 font-medium">
                  ❌ {verificationStatus.rejection_reason}
                </p>
              )}
              {verificationStatus.verification_status === 'banned' && (
                <p className="mt-3 text-sm text-red-800 font-bold">
                  🚫 {verificationStatus.rejection_reason}
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Verification Status Banner */}
        {borrower && (
          <VerificationStatusBanner
            emailVerified={borrower.email_verified}
            phoneVerified={borrower.phone_verified}
            idVerified={borrower.id_verified}
            profileCompleted={borrower.profile_completed && !!borrower.country_code}
            accountActivatedAt={borrower.account_activated_at}
            verificationPendingUntil={borrower.verification_pending_until}
            userType="borrower"
            verificationStatus={verificationStatus?.verification_status || 'incomplete'}
          />
        )}

        {/* Show limited dashboard if not verified */}
        {verificationStatus?.verification_status !== 'approved' && (
          <Card className="border-2 border-orange-200 bg-orange-50">
            <CardHeader>
              <CardTitle className="text-orange-900 flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Limited Access - Verification Required
              </CardTitle>
              <CardDescription className="text-orange-700">
                Some features are disabled until you complete identity verification
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="text-muted-foreground">Request new loans</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="text-muted-foreground">Accept loan offers</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-muted-foreground">View your credit score</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-muted-foreground">Browse platform features</span>
                </div>
              </div>
              <Button
                onClick={() => router.push('/b/verify')}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                size="lg"
              >
                <Shield className="h-4 w-4 mr-2" />
                Complete Identity Verification
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Credit Score */}
          <Card className="tech-card hover-lift">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Credit Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">{creditScore?.score || 500}</span>
                <span className="text-sm text-muted-foreground">/ 850</span>
              </div>
              <p className="text-sm mt-1 font-medium" style={{ color: getCreditScoreColor(creditScore?.score || 500) }}>
                {getCreditScoreLabel(creditScore?.score || 500)}
              </p>
            </CardContent>
          </Card>

          {/* Active Loan */}
          <Card className="tech-card hover-lift">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Active Loan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                {activeLoan ? formatCurrency(activeLoan.principal_minor || 0) : '$0'}
              </div>
              <p className="text-sm text-muted-foreground mt-1 font-medium">
                {activeLoan ? `${calculateLoanProgress()}% Repaid` : 'No Active Loans'}
              </p>
            </CardContent>
          </Card>

          {/* Next Payment */}
          <Card className="tech-card hover-lift">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Next Payment</CardTitle>
            </CardHeader>
            <CardContent>
              {nextPayment ? (
                <>
                  <div className="text-3xl font-bold text-accent">
                    {formatCurrency(nextPayment.amount_due_minor || 0)}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 font-medium">
                    Due {format(new Date(nextPayment.due_date), 'MMM dd')}
                  </p>
                </>
              ) : (
                <>
                  <div className="text-3xl font-bold text-muted-foreground">$0</div>
                  <p className="text-sm text-accent mt-1 font-medium">All Current</p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Total Repaid */}
          <Card className="tech-card hover-lift">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Total Repaid</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-accent">
                {activeLoan ? formatCurrency(recentPayments.reduce((sum, p) => sum + (p.amount_minor || 0), 0)) : '$0'}
              </div>
              <p className="text-sm text-muted-foreground mt-1 font-medium">
                Lifetime Payments
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Repayment Progress Visualization */}
        {activeLoan && (
          <Card className="tech-card">
            <CardHeader className="tech-accent">
              <CardTitle className="text-primary font-bold flex items-center gap-2">
                <Target className="h-5 w-5" />
                My Loan Progress
              </CardTitle>
              <CardDescription className="text-muted-foreground">Track your repayment journey and maintain your excellent credit</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Circular Progress Chart */}
                <div className="flex flex-col items-center justify-center">
                  <div className="relative w-full max-w-[300px] aspect-square">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadialBarChart
                        cx="50%"
                        cy="50%"
                        innerRadius="60%"
                        outerRadius="90%"
                        barSize={40}
                        data={getRadialChartData()}
                        startAngle={90}
                        endAngle={-270}
                      >
                        <RadialBar
                          background
                          dataKey="value"
                          cornerRadius={10}
                        />
                      </RadialBarChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="text-5xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                        {getPaymentAnalytics().progressPercentage}%
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">Complete</div>
                      <div className="mt-3 flex items-center gap-1">
                        <Award className={`h-5 w-5 ${
                          getPaymentAnalytics().paymentHealthScore >= 80 ? 'text-green-600' :
                          getPaymentAnalytics().paymentHealthScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                        }`} />
                        <span className={`text-sm font-semibold ${
                          getPaymentAnalytics().paymentHealthScore >= 80 ? 'text-green-600' :
                          getPaymentAnalytics().paymentHealthScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {getPaymentAnalytics().paymentHealthScore}% Health
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Payment Statistics */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold mb-4 text-foreground">Payment Statistics</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full bg-green-500" />
                          <span className="text-sm">On-Time Payments</span>
                        </div>
                        <span className="font-semibold">
                          {getPaymentAnalytics().onTimePayments} / {getPaymentAnalytics().paidPayments}
                        </span>
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full bg-yellow-500" />
                          <span className="text-sm">Late Payments</span>
                        </div>
                        <span className="font-semibold">{getPaymentAnalytics().latePayments}</span>
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full bg-blue-500" />
                          <span className="text-sm">Pending Payments</span>
                        </div>
                        <span className="font-semibold">{getPaymentAnalytics().pendingPayments}</span>
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full bg-red-500" />
                          <span className="text-sm">Overdue Payments</span>
                        </div>
                        <span className="font-semibold">{getPaymentAnalytics().overduePayments}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Payments Made</span>
                      <span className="text-sm font-semibold">
                        {getPaymentAnalytics().paidPayments} / {getPaymentAnalytics().totalPayments}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          getPaymentAnalytics().paymentHealthScore >= 80 ? 'bg-green-600' :
                          getPaymentAnalytics().paymentHealthScore >= 60 ? 'bg-yellow-600' : 'bg-red-600'
                        }`}
                        style={{ width: `${getPaymentAnalytics().progressPercentage}%` }}
                      />
                    </div>
                  </div>

                  {getPaymentAnalytics().paymentHealthScore >= 80 && (
                    <Alert className="bg-green-50 border-green-200">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-sm text-green-900">
                        Excellent payment record! Keep up the great work to maintain your strong credit score.
                      </AlertDescription>
                    </Alert>
                  )}

                  {getPaymentAnalytics().paymentHealthScore >= 60 && getPaymentAnalytics().paymentHealthScore < 80 && (
                    <Alert className="bg-yellow-50 border-yellow-200">
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      <AlertDescription className="text-sm text-yellow-900">
                        Good payment record. Try to make all payments on time to improve your credit score.
                      </AlertDescription>
                    </Alert>
                  )}

                  {getPaymentAnalytics().paymentHealthScore < 60 && (
                    <Alert className="bg-red-50 border-red-200">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <AlertDescription className="text-sm text-red-900">
                        Payment issues detected. Contact your lender if you're having difficulty with payments.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Credit Analysis Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Credit Score Breakdown */}
          <Card className="tech-card">
            <CardHeader className="tech-accent">
              <CardTitle className="text-primary font-bold flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Credit Score Analysis
              </CardTitle>
              <CardDescription className="text-muted-foreground">Factors affecting your creditworthiness</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {factorsData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={factorsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0f2fe" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#64748b' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e0f2fe',
                        borderRadius: '12px',
                        fontFamily: 'Merriweather, Georgia, serif',
                        boxShadow: '0 4px 12px rgba(15, 52, 96, 0.1)'
                      }}
                    />
                    <Bar dataKey="value" fill="url(#colorGradient)" radius={[8, 8, 0, 0]} />
                    <defs>
                      <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0f3460" />
                        <stop offset="100%" stopColor="#5b7fc7" />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                  No score factors available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment History */}
          <Card className="tech-card">
            <CardHeader className="tech-accent">
              <CardTitle className="text-primary font-bold flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Payment History
              </CardTitle>
              <CardDescription className="text-muted-foreground">Recent payment transactions</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {paymentChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={paymentChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0f2fe" />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis tick={{ fill: '#64748b' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e0f2fe',
                        borderRadius: '12px',
                        fontFamily: 'Merriweather, Georgia, serif',
                        boxShadow: '0 4px 12px rgba(15, 52, 96, 0.1)'
                      }}
                      formatter={(value: number) => `$${value.toFixed(2)}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="amount"
                      stroke="#5b7fc7"
                      strokeWidth={3}
                      dot={{ fill: '#5b7fc7', r: 5, strokeWidth: 2, stroke: '#ffffff' }}
                      activeDot={{ r: 7, fill: '#0f3460' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                  No payment history available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Loan Status Table */}
        {activeLoan && (
          <Card className="tech-card">
            <CardHeader className="tech-accent">
              <CardTitle className="text-primary font-bold flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Active Loan Details
              </CardTitle>
              <CardDescription className="text-muted-foreground">Current loan obligation summary</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div>
                  <p className="text-xs uppercase text-muted-foreground mb-1 tracking-wide font-semibold">Principal Amount</p>
                  <p className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                    {formatCurrency(activeLoan.principal_minor || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground mb-1 tracking-wide font-semibold">Amount Repaid</p>
                  <p className="text-2xl font-bold text-accent">
                    {formatCurrency(recentPayments.reduce((sum, p) => sum + (p.amount_minor || 0), 0))}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground mb-1 tracking-wide font-semibold">Outstanding Balance</p>
                  <p className="text-2xl font-bold text-secondary">
                    {formatCurrency((activeLoan.principal_minor || 0) - recentPayments.reduce((sum, p) => sum + (p.amount_minor || 0), 0))}
                  </p>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-semibold text-foreground">Repayment Progress</span>
                  <span className="text-sm font-bold text-primary">{calculateLoanProgress()}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-primary to-accent h-full transition-all duration-500 rounded-full"
                    style={{ width: `${calculateLoanProgress()}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Transactions Table */}
        {recentPayments.length > 0 && (
          <Card className="tech-card">
            <CardHeader className="tech-accent">
              <CardTitle className="text-primary font-bold flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Recent Transactions
              </CardTitle>
              <CardDescription className="text-muted-foreground">Latest payment activity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 text-xs uppercase tracking-wide text-muted-foreground font-semibold">Date</th>
                      <th className="text-left py-3 px-4 text-xs uppercase tracking-wide text-muted-foreground font-semibold">Amount</th>
                      <th className="text-left py-3 px-4 text-xs uppercase tracking-wide text-muted-foreground font-semibold">Status</th>
                      <th className="text-right py-3 px-4 text-xs uppercase tracking-wide text-muted-foreground font-semibold">Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPayments.map((payment) => (
                      <tr key={payment.id} className="border-b border-border last:border-0 hover:bg-primary/5 transition-colors">
                        <td className="py-3 px-4 text-sm text-foreground font-medium">
                          {format(new Date(payment.created_at), 'MMM dd, yyyy')}
                        </td>
                        <td className="py-3 px-4 text-sm font-bold text-primary">
                          {formatCurrency(payment.amount_minor || 0)}
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            className={`text-xs font-medium ${
                              payment.status === 'completed'
                                ? 'bg-accent/10 text-accent border-accent'
                                : 'bg-secondary/10 text-secondary border-secondary'
                            }`}
                          >
                            {payment.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-sm text-right text-muted-foreground font-medium">
                          #{payment.id.slice(0, 8)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Button
            className="btn-tech h-auto py-4 shadow-lg"
            onClick={() => router.push('/b/requests')}
            disabled={!!activeLoan}
          >
            <CreditCard className="mr-2 h-5 w-5" />
            <span className="font-bold">Request Loan</span>
          </Button>
          <Button
            variant="outline"
            className="border-2 border-primary text-primary hover:bg-primary hover:text-white h-auto py-4 font-bold transition-all duration-300 hover:shadow-lg"
            onClick={() => router.push('/b/credit')}
          >
            <TrendingUp className="mr-2 h-5 w-5" />
            <span>View Credit Report</span>
          </Button>
          <Button
            variant="outline"
            className="border-2 border-accent text-accent hover:bg-accent hover:text-white h-auto py-4 font-bold transition-all duration-300 hover:shadow-lg"
            onClick={() => router.push('/b/repayments')}
          >
            <FileText className="mr-2 h-5 w-5" />
            <span>Payment Schedule</span>
          </Button>
        </div>

        {/* Financial Advice */}
        <Card className="tech-card bg-gradient-to-br from-primary/5 via-secondary/5 to-accent/5">
          <CardHeader className="tech-accent">
            <CardTitle className="text-primary font-bold flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Credit Management Principles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex gap-3">
                <CheckCircle className="h-5 w-5 text-accent mt-1 flex-shrink-0" />
                <div>
                  <p className="font-bold text-foreground mb-1">Timely Payment History</p>
                  <p className="text-sm text-muted-foreground">
                    Consistent, on-time payments are the cornerstone of creditworthiness, comprising 35% of your credit score.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <CheckCircle className="h-5 w-5 text-accent mt-1 flex-shrink-0" />
                <div>
                  <p className="font-bold text-foreground mb-1">Credit Utilization Ratio</p>
                  <p className="text-sm text-muted-foreground">
                    Maintain credit utilization below 30% to demonstrate prudent debt management and financial discipline.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <CheckCircle className="h-5 w-5 text-accent mt-1 flex-shrink-0" />
                <div>
                  <p className="font-bold text-foreground mb-1">Credit History Length</p>
                  <p className="text-sm text-muted-foreground">
                    A longer credit history establishes reliability and provides lenders with comprehensive financial data.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <CheckCircle className="h-5 w-5 text-accent mt-1 flex-shrink-0" />
                <div>
                  <p className="font-bold text-foreground mb-1">Limited Credit Inquiries</p>
                  <p className="text-sm text-muted-foreground">
                    Minimize new credit applications to avoid multiple hard inquiries that may negatively impact your score.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
