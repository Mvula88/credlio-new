'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { VerificationStatusBanner } from '@/components/verification-status-banner'
import { getCurrencyInfo, formatCurrency as formatCurrencyUtil, type CurrencyInfo } from '@/lib/utils/currency'
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
  RadialBar,
  AreaChart,
  Area
} from 'recharts'
import {
  Users,
  CreditCard,
  TrendingUp,
  DollarSign,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  Award,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  Shield,
  FileText,
  Calendar,
  Wallet,
  TrendingDown,
  AlertTriangle,
  Building2
} from 'lucide-react'

export default function LenderOverviewPage() {
  const [loading, setLoading] = useState(true)
  const [lenderProfile, setLenderProfile] = useState<any>(null)
  const [lenderCurrency, setLenderCurrency] = useState<CurrencyInfo | null>(null)
  const [stats, setStats] = useState({
    totalBorrowers: 0,
    activeLoans: 0,
    totalDisbursed: 0,
    totalRepaid: 0,
    outstanding: 0,
    overdueLoans: 0,
    overdueAmount: 0,
    completedLoans: 0,
    defaultedLoans: 0,
    averageScore: 0,
    repaymentRate: 0,
    defaultRate: 0,
    collectionsThisMonth: 0,
    averageLoanSize: 0,
    pendingLoans: 0,
    totalLoans: 0,
    onTimePayments: 0,
    latePayments: 0,
    totalPayments: 0,
  })
  const [recentActivity, setRecentActivity] = useState<any[]>([])
  const [subscription, setSubscription] = useState<any>(null)
  const [loansByStatus, setLoansByStatus] = useState<any[]>([])
  const [monthlyData, setMonthlyData] = useState<any[]>([])
  const [borrowerScoreDistribution, setBorrowerScoreDistribution] = useState<any[]>([])
  const [recentLoans, setRecentLoans] = useState<any[]>([])
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/l/login')
        return
      }

      // Get lender profile with error handling
      const { data: lender, error: lenderError } = await supabase
        .from('lenders')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      if (lenderError) {
        console.error('Error loading lender profile:', lenderError)
      }

      let finalLender = lender

      // If no lender profile exists, create one
      if (!lender && !lenderError) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('user_id', user.id)
          .maybeSingle()

        // Create lender record
        const { data: newLender, error: insertError } = await supabase
          .from('lenders')
          .insert({
            user_id: user.id,
            business_name: profile?.full_name || 'My Lending Business',
            phone: '',
            country: 'NA',
            license_number: '',
            verified: false
          })
          .select('*')
          .single()

        if (insertError) {
          console.error('Error creating lender profile:', insertError)
        } else {
          finalLender = newLender
        }
      }

      // If we still don't have a lender profile, there's a problem
      if (!finalLender) {
        console.error('Could not load or create lender profile')
        setLoading(false)
        return
      }

      // Fetch profile and currency from API route to avoid RLS issues
      const profileResponse = await fetch('/api/check-profile')
      const profileApiData = await profileResponse.json()

      const profileData = profileApiData.profile
      const currencyData = profileApiData.currency

      setLenderProfile({
        ...finalLender,
        profiles: profileData
      })

      // Set currency from API response
      if (currencyData) {
        setLenderCurrency({
          code: currencyData.currency_code,
          symbol: currencyData.currency_symbol,
          minorUnits: currencyData.minor_units,
          countryCode: profileData?.country_code
        })
      }

      // Get subscription
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .single()

      setSubscription(sub)

      // Get all loans for this lender with more details
      const { data: allLoans } = await supabase
        .from('loans')
        .select(`
          id,
          status,
          principal_minor,
          total_amount_minor,
          created_at,
          borrower_id,
          borrowers(full_name, country_code)
        `)
        .eq('lender_id', finalLender.user_id)

      // Set recent loans for table
      const sortedLoans = [...(allLoans || [])].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      setRecentLoans(sortedLoans.slice(0, 5))

      // Get borrower count
      const { count: borrowerCount } = await supabase
        .from('borrowers')
        .select('*', { count: 'exact', head: true })
        .eq('created_by_lender', finalLender.user_id)

      // Get loan IDs for related queries
      const loanIds = allLoans?.map((l: any) => l.id) || []

      // Get repayment data if there are loans
      let repaymentEvents: any[] = []
      let overdueSchedules: any[] = []
      let allSchedules: any[] = []

      if (loanIds.length > 0) {
        // Get repayment schedules for these loans
        const { data: schedules } = await supabase
          .from('repayment_schedules')
          .select('id, loan_id, amount_due_minor, due_date, installment_no, status, paid_at')
          .in('loan_id', loanIds)

        allSchedules = schedules || []

        // Get repayment events for these schedules
        const scheduleIds = schedules?.map((s: any) => s.id) || []
        if (scheduleIds.length > 0) {
          const { data: events } = await supabase
            .from('repayment_events')
            .select('id, schedule_id, amount_paid_minor, paid_at, created_at')
            .in('schedule_id', scheduleIds)
            .order('created_at', { ascending: false })

          repaymentEvents = events || []
        }

        // Calculate overdue schedules
        const paidScheduleIds = new Set(repaymentEvents.map((e: any) => e.schedule_id))
        overdueSchedules = (schedules || []).filter((s: any) =>
          !paidScheduleIds.has(s.id) && new Date(s.due_date) < new Date()
        )
      }

      // Get borrower scores
      let borrowerScores: any[] = []
      const { data: borrowerData } = await supabase
        .from('borrowers')
        .select('id')
        .eq('created_by_lender', finalLender.user_id)

      if (borrowerData && borrowerData.length > 0) {
        const borrowerIds = borrowerData.map((b: any) => b.id)
        const { data: scores } = await supabase
          .from('borrower_scores')
          .select('score, borrower_id')
          .in('borrower_id', borrowerIds)

        borrowerScores = scores || []

        // Calculate score distribution for chart
        const distribution = [
          { name: 'Excellent (750+)', value: 0, color: '#22c55e' },
          { name: 'Good (700-749)', value: 0, color: '#3b82f6' },
          { name: 'Fair (650-699)', value: 0, color: '#eab308' },
          { name: 'Poor (<650)', value: 0, color: '#ef4444' },
        ]

        borrowerScores.forEach((s: any) => {
          if (s.score >= 750) distribution[0].value++
          else if (s.score >= 700) distribution[1].value++
          else if (s.score >= 650) distribution[2].value++
          else distribution[3].value++
        })

        setBorrowerScoreDistribution(distribution.filter((d: any) => d.value > 0))
      }

      // Calculate metrics
      const activeLoans = allLoans?.filter((l: any) => l.status === 'active') || []
      const completedLoans = allLoans?.filter((l: any) => l.status === 'completed') || []
      const defaultedLoans = allLoans?.filter((l: any) => l.status === 'defaulted') || []
      const pendingLoans = allLoans?.filter((l: any) => l.status === 'pending' || l.status === 'offered') || []

      // Loans by status for pie chart
      const statusData = [
        { name: 'Active', value: activeLoans.length, color: '#3b82f6' },
        { name: 'Completed', value: completedLoans.length, color: '#22c55e' },
        { name: 'Pending', value: pendingLoans.length, color: '#eab308' },
        { name: 'Defaulted', value: defaultedLoans.length, color: '#ef4444' },
      ].filter((d: any) => d.value > 0)
      setLoansByStatus(statusData)

      // Keep values in MINOR units - only count actually disbursed loans
      const disbursedStatuses = ['active', 'completed', 'defaulted', 'written_off']
      const disbursedLoans = allLoans?.filter((loan: any) => disbursedStatuses.includes(loan.status)) || []
      const totalDisbursed = disbursedLoans.reduce((sum: number, loan: any) => sum + (loan.principal_minor || 0), 0)
      const totalDue = disbursedLoans.reduce((sum: number, loan: any) => sum + (loan.total_amount_minor || loan.principal_minor || 0), 0)
      const totalRepaid = repaymentEvents?.reduce((sum: number, event: any) => sum + (event.amount_paid_minor || 0), 0) || 0
      const outstanding = totalDue - totalRepaid
      const overdueAmount = overdueSchedules?.reduce((sum: number, sched: any) => sum + (sched.amount_due_minor || 0), 0) || 0

      // Calculate payment metrics
      let onTimePayments = 0
      let latePayments = 0
      allSchedules.forEach((schedule: any) => {
        if (schedule.status === 'paid' && schedule.paid_at) {
          const dueDate = new Date(schedule.due_date)
          const paidDate = new Date(schedule.paid_at)
          if (paidDate <= dueDate) {
            onTimePayments++
          } else {
            latePayments++
          }
        }
      })

      // Average score
      const averageScore = borrowerScores && borrowerScores.length > 0
        ? Math.round(borrowerScores.reduce((sum, s) => sum + (s.score || 0), 0) / borrowerScores.length)
        : 0

      // Collections this month
      const startOfCurrentMonth = new Date()
      startOfCurrentMonth.setDate(1)
      startOfCurrentMonth.setHours(0, 0, 0, 0)

      const collectionsThisMonth = repaymentEvents
        ?.filter(e => new Date(e.paid_at) >= startOfCurrentMonth)
        ?.reduce((sum, e) => sum + (e.amount_paid_minor || 0), 0) || 0

      // Calculate rates
      const repaymentRate = totalDue > 0 ? (totalRepaid / totalDue) * 100 : 0
      const totalLoansCount = allLoans?.length || 0
      const defaultRate = totalLoansCount > 0 ? (defaultedLoans.length / totalLoansCount) * 100 : 0
      const averageLoanSize = totalLoansCount > 0 ? Math.round(totalDisbursed / totalLoansCount) : 0

      // Generate monthly data for charts (last 6 months)
      const monthlyStats: any[] = []
      for (let i = 5; i >= 0; i--) {
        const monthDate = subMonths(new Date(), i)
        const monthStart = startOfMonth(monthDate)
        const monthEnd = endOfMonth(monthDate)

        const monthLoans = allLoans?.filter((l: any) => {
          const created = new Date(l.created_at)
          return created >= monthStart && created <= monthEnd
        }) || []

        const monthDisbursed = monthLoans.reduce((sum: number, l: any) => sum + (l.principal_minor || 0), 0)

        const monthRepayments = repaymentEvents?.filter((e: any) => {
          const paid = new Date(e.paid_at)
          return paid >= monthStart && paid <= monthEnd
        }) || []

        const monthCollected = monthRepayments.reduce((sum: number, e: any) => sum + (e.amount_paid_minor || 0), 0)

        monthlyStats.push({
          month: format(monthDate, 'MMM'),
          disbursed: monthDisbursed / 100,
          collected: monthCollected / 100,
          loans: monthLoans.length,
        })
      }
      setMonthlyData(monthlyStats)

      // Get recent repayments with borrower info
      let recentRepayments: any[] = []
      if (repaymentEvents.length > 0) {
        const recentScheduleIds = repaymentEvents.slice(0, 5).map((e: any) => e.schedule_id)

        const { data: schedulesWithLoans } = await supabase
          .from('repayment_schedules')
          .select('id, loan_id')
          .in('id', recentScheduleIds)

        const recentLoanIds = [...new Set(schedulesWithLoans?.map((s: any) => s.loan_id) || [])]

        const { data: loansWithBorrowers } = await supabase
          .from('loans')
          .select('id, borrower_id, borrowers(full_name)')
          .in('id', recentLoanIds)

        const loanMap = new Map(loansWithBorrowers?.map((l: any) => [l.id, l]) || [])
        const scheduleToLoanMap = new Map(schedulesWithLoans?.map((s: any) => [s.id, s.loan_id]) || [])

        recentRepayments = repaymentEvents.slice(0, 5).map((event: any) => {
          const loanId = scheduleToLoanMap.get(event.schedule_id)
          const loan = loanId ? loanMap.get(loanId) : null
          return {
            ...event,
            amount_minor: event.amount_paid_minor,
            payment_date: event.paid_at,
            loans: loan ? { borrowers: loan.borrowers } : null
          }
        })
      }

      setStats({
        totalBorrowers: borrowerCount || 0,
        activeLoans: activeLoans.length,
        totalDisbursed,
        totalRepaid,
        outstanding,
        overdueLoans: overdueSchedules?.length || 0,
        overdueAmount,
        completedLoans: completedLoans.length,
        defaultedLoans: defaultedLoans.length,
        averageScore,
        repaymentRate,
        defaultRate,
        collectionsThisMonth,
        averageLoanSize,
        pendingLoans: pendingLoans.length,
        totalLoans: totalLoansCount,
        onTimePayments,
        latePayments,
        totalPayments: onTimePayments + latePayments,
      })

      setRecentActivity(recentRepayments || [])
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amountMinor: number) => {
    if (!lenderCurrency) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
      }).format(amountMinor / 100)
    }
    return formatCurrencyUtil(amountMinor, lenderCurrency)
  }

  const getPortfolioHealthScore = () => {
    // Calculate a portfolio health score based on various factors
    let score = 100

    // Deduct for default rate
    score -= stats.defaultRate * 2

    // Deduct for overdue loans
    if (stats.totalLoans > 0) {
      const overdueRate = (stats.overdueLoans / stats.totalLoans) * 100
      score -= overdueRate
    }

    // Bonus for high repayment rate
    if (stats.repaymentRate >= 90) score += 5
    else if (stats.repaymentRate >= 80) score += 2

    return Math.max(0, Math.min(100, Math.round(score)))
  }

  const getHealthColor = (score: number) => {
    if (score >= 80) return '#22c55e'
    if (score >= 60) return '#eab308'
    return '#ef4444'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground font-medium">Loading your lending dashboard...</p>
        </div>
      </div>
    )
  }

  const portfolioHealth = getPortfolioHealthScore()

  return (
    <div className="p-6 space-y-6">
      {/* Modern Tech Header */}
      <div className="tech-header p-8 rounded-2xl shadow-lg">
        <div className="flex justify-between items-start">
          <div className="relative z-10">
            <h1 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">Lender Dashboard</h1>
            <p className="text-white/90 text-lg font-medium drop-shadow">
              {lenderProfile?.business_name || lenderProfile?.profiles?.full_name || 'Lender'} • Overview • {format(new Date(), 'MMMM dd, yyyy')}
            </p>
          </div>
          <Button className="btn-tech shadow-lg" onClick={() => router.push('/l/loans/new')}>
            <CreditCard className="mr-2 h-4 w-4" />
            Create New Loan
          </Button>
        </div>
      </div>

      {/* Verification Status Banner */}
      {lenderProfile && (
        <VerificationStatusBanner
          phoneVerified={lenderProfile.phone_verified}
          idVerified={lenderProfile.id_verified}
          profileCompleted={lenderProfile.profile_completed}
          userType="lender"
        />
      )}

      {/* Key Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Total Borrowers</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl">
              <Users className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">{stats.totalBorrowers}</div>
            <p className="text-sm text-muted-foreground mt-1.5 font-medium">
              Avg Score: <span className="font-bold">{stats.averageScore || 'N/A'}</span>
            </p>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Active Loans</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-secondary/10 to-secondary/5 rounded-xl">
              <CreditCard className="h-5 w-5 text-secondary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-secondary">{stats.activeLoans}</div>
            <p className="text-sm text-muted-foreground mt-1.5 font-medium">
              <span className="text-destructive font-bold">{stats.overdueLoans}</span> overdue • <span className="text-green-600 font-bold">{stats.completedLoans}</span> completed
            </p>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Total Disbursed</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-accent/10 to-accent/5 rounded-xl">
              <DollarSign className="h-5 w-5 text-accent" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-accent">{formatCurrency(stats.totalDisbursed)}</div>
            <p className="text-sm text-muted-foreground mt-1.5 font-medium">
              Avg: {formatCurrency(stats.averageLoanSize)}
            </p>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Outstanding</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-orange-500/10 to-orange-500/5 rounded-xl">
              <AlertCircle className="h-5 w-5 text-orange-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{formatCurrency(stats.outstanding)}</div>
            <p className="text-sm text-muted-foreground mt-1.5 font-medium">
              Overdue: {formatCurrency(stats.overdueAmount)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Portfolio Health & Loan Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Portfolio Health Score */}
        <Card className="tech-card border-none">
          <CardHeader className="border-b border-border/50 pb-4">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              <CardTitle className="text-foreground font-bold text-lg">Portfolio Health</CardTitle>
            </div>
            <CardDescription className="text-muted-foreground mt-1">Overall lending portfolio performance</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex items-center gap-8">
              <div className="relative w-48 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart
                    cx="50%"
                    cy="50%"
                    innerRadius="60%"
                    outerRadius="90%"
                    barSize={20}
                    data={[{ name: 'Health', value: portfolioHealth, fill: getHealthColor(portfolioHealth) }]}
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
                  <div className="text-4xl font-bold" style={{ color: getHealthColor(portfolioHealth) }}>
                    {portfolioHealth}%
                  </div>
                  <div className="text-sm text-muted-foreground">Health Score</div>
                </div>
              </div>

              <div className="flex-1 space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-200">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium">Repayment Rate</span>
                    </div>
                    <span className="text-lg font-bold text-green-600">{stats.repaymentRate.toFixed(1)}%</span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-200">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-600" />
                      <span className="text-sm font-medium">Default Rate</span>
                    </div>
                    <span className="text-lg font-bold text-red-600">{stats.defaultRate.toFixed(1)}%</span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium">On-Time Payments</span>
                    </div>
                    <span className="text-lg font-bold text-blue-600">
                      {stats.totalPayments > 0 ? Math.round((stats.onTimePayments / stats.totalPayments) * 100) : 0}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Loan Status Distribution */}
        <Card className="tech-card border-none">
          <CardHeader className="border-b border-border/50 pb-4">
            <div className="flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-primary" />
              <CardTitle className="text-foreground font-bold text-lg">Loan Distribution</CardTitle>
            </div>
            <CardDescription className="text-muted-foreground mt-1">Current loan status breakdown</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {loansByStatus.length > 0 ? (
              <div className="flex items-center gap-8">
                <div className="w-48 h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={loansByStatus}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {loansByStatus.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-3">
                  {loansByStatus.map((status, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: status.color }} />
                        <span className="text-sm font-medium">{status.name}</span>
                      </div>
                      <span className="text-lg font-bold">{status.value}</span>
                    </div>
                  ))}
                  <div className="pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">Total Loans</span>
                      <span className="text-lg font-bold text-primary">{stats.totalLoans}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <CreditCard className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No loans yet</p>
                  <Button variant="link" onClick={() => router.push('/l/loans/new')}>
                    Create your first loan
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Performance Chart */}
      <Card className="tech-card border-none">
        <CardHeader className="border-b border-border/50 pb-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <CardTitle className="text-foreground font-bold text-lg">Monthly Performance</CardTitle>
          </div>
          <CardDescription className="text-muted-foreground mt-1">Disbursements vs Collections over the last 6 months</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {monthlyData.some(d => d.disbursed > 0 || d.collected > 0) ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={monthlyData}>
                <defs>
                  <linearGradient id="colorDisbursed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="colorCollected" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => formatCurrency(value * 100)}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="disbursed"
                  name="Disbursed"
                  stroke="#3b82f6"
                  fill="url(#colorDisbursed)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="collected"
                  name="Collected"
                  stroke="#22c55e"
                  fill="url(#colorCollected)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No activity data yet</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Additional Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Collections This Month</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-green-500/10 to-green-500/5 rounded-xl">
              <TrendingUp className="h-5 w-5 text-green-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{formatCurrency(stats.collectionsThisMonth)}</div>
            <p className="text-sm text-muted-foreground mt-1.5 font-medium">
              {format(new Date(), 'MMMM yyyy')}
            </p>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Total Repaid</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl">
              <CheckCircle className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{formatCurrency(stats.totalRepaid)}</div>
            <p className="text-sm text-muted-foreground mt-1.5 font-medium">
              Lifetime collections
            </p>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Pending Loans</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 rounded-xl">
              <Clock className="h-5 w-5 text-yellow-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">{stats.pendingLoans}</div>
            <p className="text-sm text-muted-foreground mt-1.5 font-medium">
              Awaiting action
            </p>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Defaulted Loans</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-red-500/10 to-red-500/5 rounded-xl">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{stats.defaultedLoans}</div>
            <p className="text-sm text-muted-foreground mt-1.5 font-medium">
              {stats.defaultRate.toFixed(1)}% default rate
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Repayments */}
        <Card className="tech-card border-none">
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="text-foreground font-bold text-lg">Recent Repayments</CardTitle>
            <CardDescription className="text-muted-foreground mt-1">Latest payment activity from your borrowers</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {recentActivity.length === 0 ? (
              <div className="text-center py-12">
                <div className="mx-auto w-16 h-16 bg-muted/30 rounded-full flex items-center justify-center mb-4">
                  <DollarSign className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground font-medium">No recent activity</p>
                <p className="text-xs text-muted-foreground mt-1">Payment activity will appear here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentActivity.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between p-4 rounded-xl border border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-all duration-200 group">
                    <div className="flex items-center space-x-4">
                      <div className="p-2.5 bg-gradient-to-br from-green-500/10 to-green-500/5 rounded-xl group-hover:from-green-500/20 group-hover:to-green-500/10 transition-colors">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">
                          {payment.loans?.borrowers?.full_name || 'Unknown'}
                        </p>
                        <p className="text-xs text-muted-foreground font-medium mt-0.5">
                          {format(new Date(payment.payment_date), 'MMM dd, yyyy')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-green-600">{formatCurrency(payment.amount_minor || 0)}</p>
                      <p className="text-xs text-muted-foreground font-medium mt-0.5">
                        {payment.notes || 'Payment'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="tech-card border-none">
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="text-foreground font-bold text-lg">Quick Actions</CardTitle>
            <CardDescription className="text-muted-foreground mt-1">Common tasks and workflows</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-6">
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-4 border-2 border-primary/20 hover:bg-gradient-to-r hover:from-primary hover:to-secondary hover:text-white hover:border-primary transition-all duration-300 font-semibold group shadow-sm hover:shadow-md"
              onClick={() => router.push('/l/borrowers')}
            >
              <div className="p-2 bg-gradient-to-br from-primary/10 to-primary/5 group-hover:bg-white/20 rounded-xl mr-3 transition-colors">
                <Users className="h-5 w-5 text-primary group-hover:text-white transition-colors" />
              </div>
              <span className="text-left">Search or Register Borrower</span>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-4 border-2 border-secondary/20 hover:bg-gradient-to-r hover:from-secondary hover:to-primary hover:text-white hover:border-secondary transition-all duration-300 font-semibold group shadow-sm hover:shadow-md"
              onClick={() => router.push('/l/loans/new')}
            >
              <div className="p-2 bg-gradient-to-br from-secondary/10 to-secondary/5 group-hover:bg-white/20 rounded-xl mr-3 transition-colors">
                <CreditCard className="h-5 w-5 text-secondary group-hover:text-white transition-colors" />
              </div>
              <span className="text-left">Create New Loan</span>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-4 border-2 border-accent/20 hover:bg-gradient-to-r hover:from-accent hover:to-secondary hover:text-white hover:border-accent transition-all duration-300 font-semibold group shadow-sm hover:shadow-md"
              onClick={() => router.push('/l/repayments')}
            >
              <div className="p-2 bg-gradient-to-br from-accent/10 to-accent/5 group-hover:bg-white/20 rounded-xl mr-3 transition-colors">
                <DollarSign className="h-5 w-5 text-accent group-hover:text-white transition-colors" />
              </div>
              <span className="text-left">Record Payment</span>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-4 border-2 border-primary/20 hover:bg-gradient-to-r hover:from-primary hover:to-accent hover:text-white hover:border-primary transition-all duration-300 font-semibold group shadow-sm hover:shadow-md"
              onClick={() => router.push('/l/marketplace')}
            >
              <div className="p-2 bg-gradient-to-br from-primary/10 to-primary/5 group-hover:bg-white/20 rounded-xl mr-3 transition-colors">
                <TrendingUp className="h-5 w-5 text-primary group-hover:text-white transition-colors" />
              </div>
              <span className="text-left">Browse Marketplace</span>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent Loans Table */}
      {recentLoans.length > 0 && (
        <Card className="tech-card border-none">
          <CardHeader className="border-b border-border/50 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-foreground font-bold text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Recent Loans
                </CardTitle>
                <CardDescription className="text-muted-foreground mt-1">Your latest loan activity</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => router.push('/l/loans')}>
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-wide text-muted-foreground font-semibold">Borrower</th>
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-wide text-muted-foreground font-semibold">Amount</th>
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-wide text-muted-foreground font-semibold">Status</th>
                    <th className="text-right py-3 px-4 text-xs uppercase tracking-wide text-muted-foreground font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLoans.map((loan) => (
                    <tr key={loan.id} className="border-b border-border last:border-0 hover:bg-primary/5 transition-colors cursor-pointer" onClick={() => router.push(`/l/loans/${loan.id}`)}>
                      <td className="py-3 px-4 text-sm font-medium text-foreground">
                        {loan.borrowers?.full_name || 'Unknown'}
                      </td>
                      <td className="py-3 px-4 text-sm font-bold text-primary">
                        {formatCurrency(loan.principal_minor || 0)}
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          className={`text-xs font-medium ${
                            loan.status === 'active'
                              ? 'bg-blue-100 text-blue-800 border-blue-300'
                              : loan.status === 'completed'
                              ? 'bg-green-100 text-green-800 border-green-300'
                              : loan.status === 'pending' || loan.status === 'offered'
                              ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                              : 'bg-red-100 text-red-800 border-red-300'
                          }`}
                        >
                          {loan.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-sm text-right text-muted-foreground">
                        {format(new Date(loan.created_at), 'MMM dd, yyyy')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lending Tips */}
      <Card className="tech-card bg-gradient-to-br from-primary/5 via-secondary/5 to-accent/5 border-none">
        <CardHeader className="tech-accent">
          <CardTitle className="text-primary font-bold flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Best Practices for Lenders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex gap-3">
              <CheckCircle className="h-5 w-5 text-accent mt-1 flex-shrink-0" />
              <div>
                <p className="font-bold text-foreground mb-1">Verify Borrower Identity</p>
                <p className="text-sm text-muted-foreground">
                  Always verify borrower documents before approving loans to minimize fraud risk.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <CheckCircle className="h-5 w-5 text-accent mt-1 flex-shrink-0" />
              <div>
                <p className="font-bold text-foreground mb-1">Set Appropriate Interest Rates</p>
                <p className="text-sm text-muted-foreground">
                  Use the platform's interest rate calculator to set competitive yet sustainable rates.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <CheckCircle className="h-5 w-5 text-accent mt-1 flex-shrink-0" />
              <div>
                <p className="font-bold text-foreground mb-1">Monitor Repayment Schedules</p>
                <p className="text-sm text-muted-foreground">
                  Regularly check your repayment dashboard and follow up on overdue payments promptly.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <CheckCircle className="h-5 w-5 text-accent mt-1 flex-shrink-0" />
              <div>
                <p className="font-bold text-foreground mb-1">Diversify Your Portfolio</p>
                <p className="text-sm text-muted-foreground">
                  Spread your lending across multiple borrowers to reduce concentration risk.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
