'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { VerificationStatusBanner } from '@/components/verification-status-banner'
import { getCurrencyInfo, formatCurrency as formatCurrencyUtil, type CurrencyInfo } from '@/lib/utils/currency'
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
  ArrowDownRight
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
  })
  const [recentActivity, setRecentActivity] = useState<any[]>([])
  const [subscription, setSubscription] = useState<any>(null)
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

      console.log('Profile API response:', profileApiData)

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
        console.log('Currency set:', currencyData)
      } else {
        console.warn('No currency data found!')
      }

      // Get subscription
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .single()
      
      setSubscription(sub)

      // Get stats
      const [
        { count: borrowerCount },
        { data: allLoans },
        { data: repaymentEvents },
        { data: borrowerScores },
        { data: overdueSchedules },
      ] = await Promise.all([
        // Total borrowers registered by this lender
        supabase
          .from('borrowers')
          .select('*', { count: 'exact', head: true })
          .eq('created_by_lender', finalLender.user_id),

        // All loans
        supabase
          .from('loans')
          .select('id, status, principal_minor, total_minor, created_at, next_payment_date')
          .eq('lender_id', finalLender.user_id),

        // All repayment events
        supabase
          .from('repayment_events')
          .select('id, amount_minor, payment_date, created_at')
          .eq('loan_id', 'in.(select id from loans where lender_id = ' + finalLender.user_id + ')')
          .order('created_at', { ascending: false }),

        // Average borrower score
        supabase
          .from('borrower_scores')
          .select('score, borrower_id, borrowers!inner(created_by_lender)')
          .eq('borrowers.created_by_lender', finalLender.user_id),

        // Overdue schedules
        supabase
          .from('repayment_schedules')
          .select('id, amount_due_minor, due_date, status, loan_id, loans!inner(lender_id)')
          .eq('loans.lender_id', finalLender.user_id)
          .eq('status', 'pending')
          .lt('due_date', new Date().toISOString()),
      ])

      // Calculate metrics
      const activeLoans = allLoans?.filter(l => l.status === 'active') || []
      const completedLoans = allLoans?.filter(l => l.status === 'completed') || []
      const defaultedLoans = allLoans?.filter(l => l.status === 'defaulted') || []

      const totalDisbursed = (allLoans?.reduce((sum, loan) => sum + (loan.principal_minor || 0), 0) || 0) / 100
      const totalDue = (allLoans?.reduce((sum, loan) => sum + (loan.total_minor || 0), 0) || 0) / 100
      const totalRepaid = (repaymentEvents?.reduce((sum, event) => sum + (event.amount_minor || 0), 0) || 0) / 100
      const outstanding = totalDue - totalRepaid

      // Calculate overdue amount
      const overdueAmount = (overdueSchedules?.reduce((sum, sched) => sum + (sched.amount_due_minor || 0), 0) || 0) / 100

      // Average score
      const averageScore = borrowerScores && borrowerScores.length > 0
        ? Math.round(borrowerScores.reduce((sum, s) => sum + (s.score || 0), 0) / borrowerScores.length)
        : 0

      // Collections this month
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const collectionsThisMonth = (repaymentEvents
        ?.filter(e => new Date(e.payment_date) >= startOfMonth)
        ?.reduce((sum, e) => sum + (e.amount_minor || 0), 0) || 0) / 100

      // Calculate rates
      const repaymentRate = totalDue > 0 ? (totalRepaid / totalDue) * 100 : 0
      const totalLoans = allLoans?.length || 0
      const defaultRate = totalLoans > 0 ? (defaultedLoans.length / totalLoans) * 100 : 0
      const averageLoanSize = totalLoans > 0 ? totalDisbursed / totalLoans : 0

      // Get recent repayments with borrower info
      const recentPaymentIds = repaymentEvents?.slice(0, 5).map(e => e.id) || []
      const { data: recentRepayments } = await supabase
        .from('repayment_events')
        .select(`
          *,
          loans!inner(
            lender_id,
            borrower_id,
            borrowers(
              full_name
            )
          )
        `)
        .in('id', recentPaymentIds.length > 0 ? recentPaymentIds : ['00000000-0000-0000-0000-000000000000'])
        .order('created_at', { ascending: false })

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
      // Fallback to USD if currency info not loaded yet
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
      }).format(amountMinor / 100)
    }
    return formatCurrencyUtil(amountMinor, lenderCurrency)
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
          <Button className="btn-tech shadow-lg" onClick={() => router.push('/l/borrowers')}>
            <Users className="mr-2 h-4 w-4" />
            Register Borrower
          </Button>
        </div>
      </div>

      {/* Subscription information removed - all features are free */}

      {/* Verification Status Banner */}
      {lenderProfile && (
        <VerificationStatusBanner
          phoneVerified={lenderProfile.phone_verified}
          idVerified={lenderProfile.id_verified}
          profileCompleted={lenderProfile.profile_completed}
          userType="lender"
        />
      )}

      {/* Stats Grid */}
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
              Total collected
            </p>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Repayment Rate</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-blue-500/10 to-blue-500/5 rounded-xl">
              <TrendingUp className="h-5 w-5 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{stats.repaymentRate.toFixed(1)}%</div>
            <div className="flex items-center text-sm mt-1.5 font-medium">
              {stats.repaymentRate >= 90 ? (
                <span className="text-green-600 flex items-center">
                  <ArrowUpRight className="h-4 w-4 mr-1" />
                  Excellent
                </span>
              ) : stats.repaymentRate >= 70 ? (
                <span className="text-yellow-600 flex items-center">
                  <Clock className="h-4 w-4 mr-1" />
                  Good
                </span>
              ) : (
                <span className="text-destructive flex items-center">
                  <ArrowDownRight className="h-4 w-4 mr-1" />
                  Needs attention
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Default Rate</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-destructive/10 to-destructive/5 rounded-xl">
              <XCircle className="h-5 w-5 text-destructive" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">{stats.defaultRate.toFixed(1)}%</div>
            <p className="text-sm text-muted-foreground mt-1.5 font-medium">
              {stats.defaultedLoans} defaulted
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
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
              onClick={() => router.push('/l/loans')}
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
    </div>
  )
}