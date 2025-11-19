'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Globe,
  ArrowLeft,
  Users,
  Building2,
  FileText,
  DollarSign,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  XCircle,
  Clock,
  UserCheck,
  Shield,
  Activity,
  BarChart3,
  PieChart as PieChartIcon,
  Calendar,
  Download,
  RefreshCw
} from 'lucide-react'
import { format, subDays, subMonths } from 'date-fns'
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
  AreaChart,
  Area
} from 'recharts'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

export default function CountryAdminPage() {
  const params = useParams()
  const countryCode = params?.code as string
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [country, setCountry] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [recentUsers, setRecentUsers] = useState<any[]>([])
  const [recentLoans, setRecentLoans] = useState<any[]>([])
  const [riskFlags, setRiskFlags] = useState<any[]>([])
  const [growthData, setGrowthData] = useState<any[]>([])

  useEffect(() => {
    if (countryCode) {
      loadCountryData()
    }
  }, [countryCode])

  const loadCountryData = async () => {
    try {
      // Get country info
      const { data: countryData } = await supabase
        .from('countries')
        .select('*')
        .eq('code', countryCode.toUpperCase())
        .single()

      if (!countryData) {
        router.push('/admin/countries')
        return
      }

      // Get currency info
      const { data: currencyData } = await supabase
        .from('country_currency_allowed')
        .select('*')
        .eq('country_code', countryCode.toUpperCase())
        .eq('is_default', true)
        .single()

      setCountry({
        ...countryData,
        currency: currencyData?.currency_code || 'USD',
        currencySymbol: currencyData?.currency_symbol || '$'
      })

      await Promise.all([
        loadStatistics(),
        loadRecentUsers(),
        loadRecentLoans(),
        loadRiskFlags(),
        loadGrowthData()
      ])
    } catch (error) {
      console.error('Error loading country data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadStatistics = async () => {
    const code = countryCode.toUpperCase()

    // USER METRICS
    const { count: totalUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('country_code', code)

    const { count: borrowerUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('country_code', code)
      .eq('app_role', 'borrower')

    const { count: lenderUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('country_code', code)
      .eq('app_role', 'lender')

    // BORROWER METRICS
    const { count: totalBorrowers } = await supabase
      .from('borrowers')
      .select('*', { count: 'exact', head: true })
      .eq('country_code', code)

    const { data: borrowerScores } = await supabase
      .from('borrowers')
      .select(`
        borrower_scores(score)
      `)
      .eq('country_code', code)

    const scores = borrowerScores?.map(b => b.borrower_scores).flat().filter(Boolean) || []
    const avgCreditScore = scores.length > 0
      ? Math.round(scores.reduce((sum: number, s: any) => sum + s.score, 0) / scores.length)
      : 0

    // LENDER METRICS
    // Join with profiles to get country_code since lenders table doesn't have it
    const { count: totalLenders } = await supabase
      .from('lenders')
      .select('user_id, profiles!inner(country_code)', { count: 'exact', head: true })
      .eq('profiles.country_code', code)

    const { count: verifiedLenders } = await supabase
      .from('lenders')
      .select('user_id, profiles!inner(country_code)', { count: 'exact', head: true })
      .eq('profiles.country_code', code)
      .eq('verification_status', 'verified')

    // LOAN METRICS
    const { data: loans } = await supabase
      .from('loans')
      .select('principal_minor, status, apr_bps, created_at')
      .eq('country_code', code)

    const totalLoans = loans?.length || 0
    const activeLoans = loans?.filter(l => l.status === 'active').length || 0
    const completedLoans = loans?.filter(l => l.status === 'completed').length || 0
    const defaultedLoans = loans?.filter(l => l.status === 'defaulted').length || 0
    const totalLoanVolume = loans?.reduce((sum, loan) => sum + (loan.principal_minor / 100), 0) || 0
    const avgLoanSize = totalLoans > 0 ? totalLoanVolume / totalLoans : 0
    const avgAPR = loans && loans.length > 0
      ? Math.round(loans.reduce((sum, l) => sum + l.apr_bps, 0) / loans.length / 100)
      : 0
    const defaultRate = totalLoans > 0 ? (defaultedLoans / totalLoans) * 100 : 0

    // RISK METRICS
    const { count: openRiskFlags } = await supabase
      .from('risk_flags')
      .select('*', { count: 'exact', head: true })
      .eq('country_code', code)
      .is('resolved_at', null)

    const { count: resolvedRiskFlags } = await supabase
      .from('risk_flags')
      .select('*', { count: 'exact', head: true })
      .eq('country_code', code)
      .not('resolved_at', 'is', null)

    // PAYMENT METRICS
    const { data: schedules } = await supabase
      .from('repayment_schedules')
      .select(`
        id,
        due_date,
        amount_due_minor,
        loans!inner(country_code)
      `)
      .eq('loans.country_code', code)

    const overduePayments = schedules?.filter(s => new Date(s.due_date) < new Date()).length || 0
    const totalScheduledPayments = schedules?.length || 0

    setStats({
      totalUsers: totalUsers || 0,
      borrowerUsers: borrowerUsers || 0,
      lenderUsers: lenderUsers || 0,
      totalBorrowers: totalBorrowers || 0,
      avgCreditScore,
      totalLenders: totalLenders || 0,
      verifiedLenders: verifiedLenders || 0,
      totalLoans,
      activeLoans,
      completedLoans,
      defaultedLoans,
      totalLoanVolume,
      avgLoanSize,
      avgAPR,
      defaultRate,
      openRiskFlags: openRiskFlags || 0,
      resolvedRiskFlags: resolvedRiskFlags || 0,
      overduePayments,
      totalScheduledPayments,
      paymentSuccessRate: totalScheduledPayments > 0
        ? ((totalScheduledPayments - overduePayments) / totalScheduledPayments * 100).toFixed(1)
        : 0
    })
  }

  const loadRecentUsers = async () => {
    // Note: Profiles table doesn't have email, it's in auth.users
    // For client-side, we'll show user_id instead of email for now
    const { data } = await supabase
      .from('profiles')
      .select('user_id, full_name, app_role, country_code, created_at, onboarding_completed')
      .eq('country_code', countryCode.toUpperCase())
      .order('created_at', { ascending: false })
      .limit(10)

    // Add a display field for the email column
    const usersWithDisplay = (data || []).map(profile => ({
      ...profile,
      email: profile.user_id.slice(0, 8) + '...' // Show part of user_id as placeholder
    }))

    setRecentUsers(usersWithDisplay)
  }

  const loadRecentLoans = async () => {
    const { data } = await supabase
      .from('loans')
      .select(`
        *,
        borrowers(full_name),
        lenders(business_name, profiles(full_name))
      `)
      .eq('country_code', countryCode.toUpperCase())
      .order('created_at', { ascending: false })
      .limit(10)

    setRecentLoans(data || [])
  }

  const loadRiskFlags = async () => {
    const { data } = await supabase
      .from('risk_flags')
      .select(`
        *,
        borrowers(full_name)
      `)
      .eq('country_code', countryCode.toUpperCase())
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(10)

    setRiskFlags(data || [])
  }

  const loadGrowthData = async () => {
    // Generate growth data for the last 6 months
    const months = []
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i)
      const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1)
      const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0)

      // Get users created in this month
      const { count: users } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('country_code', countryCode.toUpperCase())
        .gte('created_at', startOfMonth.toISOString())
        .lte('created_at', endOfMonth.toISOString())

      // Get loans created in this month
      const { count: loans } = await supabase
        .from('loans')
        .select('*', { count: 'exact', head: true })
        .eq('country_code', countryCode.toUpperCase())
        .gte('created_at', startOfMonth.toISOString())
        .lte('created_at', endOfMonth.toISOString())

      months.push({
        month: format(date, 'MMM yyyy'),
        users: users || 0,
        loans: loans || 0
      })
    }

    setGrowthData(months)
  }

  const formatCurrency = (amount: number) => {
    return `${country?.currencySymbol || '$'}${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  }

  const getStatusBadge = (status: string) => {
    const variants: any = {
      active: 'default',
      completed: 'secondary',
      defaulted: 'destructive',
      pending: 'outline'
    }
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>
  }

  if (loading || !country) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground font-medium">Loading country data...</p>
        </div>
      </div>
    )
  }

  const loanStatusData = [
    { name: 'Active', value: stats.activeLoans, color: '#3b82f6' },
    { name: 'Completed', value: stats.completedLoans, color: '#10b981' },
    { name: 'Defaulted', value: stats.defaultedLoans, color: '#ef4444' }
  ].filter(item => item.value > 0)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="tech-header p-8 rounded-2xl shadow-lg">
        <Button
          variant="ghost"
          onClick={() => router.push('/admin/countries')}
          className="mb-4 text-white hover:bg-white/20"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Countries
        </Button>

        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2 drop-shadow-lg flex items-center">
              <Globe className="h-10 w-10 mr-3" />
              {country.name} Admin
            </h1>
            <p className="text-white/90 text-lg font-medium drop-shadow flex items-center space-x-3">
              <Badge className="bg-white/20 text-white border-white/30">{country.code}</Badge>
              <span>•</span>
              <span>{country.phone_prefix}</span>
              <span>•</span>
              <span className="font-bold">{country.currency}</span>
              <span>•</span>
              <span>{format(new Date(), 'MMMM dd, yyyy')}</span>
            </p>
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" className="bg-white/90 hover:bg-white" onClick={() => loadCountryData()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" className="bg-white/90 hover:bg-white">
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      {stats && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="tech-card hover-lift border-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Total Users</CardTitle>
                <div className="p-2.5 bg-gradient-to-br from-blue-500/10 to-blue-500/5 rounded-xl">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
              </CardHeader>
              <CardContent>
                <span className="text-3xl font-bold text-blue-600">{stats.totalUsers}</span>
                <div className="mt-1.5 text-sm text-muted-foreground font-medium">
                  {stats.borrowerUsers} borrowers • {stats.lenderUsers} lenders
                </div>
              </CardContent>
            </Card>

            <Card className="tech-card hover-lift border-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Total Loans</CardTitle>
                <div className="p-2.5 bg-gradient-to-br from-green-500/10 to-green-500/5 rounded-xl">
                  <FileText className="h-5 w-5 text-green-600" />
                </div>
              </CardHeader>
              <CardContent>
                <span className="text-3xl font-bold text-green-600">{stats.totalLoans}</span>
                <div className="mt-1.5 text-sm text-muted-foreground font-medium">
                  {stats.activeLoans} active • {stats.completedLoans} completed
                </div>
              </CardContent>
            </Card>

            <Card className="tech-card hover-lift border-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Loan Volume</CardTitle>
                <div className="p-2.5 bg-gradient-to-br from-purple-500/10 to-purple-500/5 rounded-xl">
                  <DollarSign className="h-5 w-5 text-purple-600" />
                </div>
              </CardHeader>
              <CardContent>
                <span className="text-3xl font-bold text-purple-600">{formatCurrency(stats.totalLoanVolume)}</span>
                <div className="mt-1.5 text-sm text-muted-foreground font-medium">
                  Avg: {formatCurrency(stats.avgLoanSize)} • {stats.avgAPR}% APR
                </div>
              </CardContent>
            </Card>

            <Card className="tech-card hover-lift border-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Risk Flags</CardTitle>
                <div className="p-2.5 bg-gradient-to-br from-red-500/10 to-red-500/5 rounded-xl">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
              </CardHeader>
              <CardContent>
                <span className="text-3xl font-bold text-red-600">{stats.openRiskFlags}</span>
                <div className="mt-1.5 text-sm text-muted-foreground font-medium">
                  {stats.resolvedRiskFlags} resolved
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Secondary Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="tech-card border-none">
              <CardHeader>
                <CardTitle className="text-sm">Credit Score Average</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-primary">{stats.avgCreditScore}</span>
                  <Shield className="h-8 w-8 text-primary/20" />
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Based on {stats.totalBorrowers} borrowers
                </div>
              </CardContent>
            </Card>

            <Card className="tech-card border-none">
              <CardHeader>
                <CardTitle className="text-sm">Default Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-red-600">{stats.defaultRate.toFixed(1)}%</span>
                  <TrendingDown className="h-8 w-8 text-red-600/20" />
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {stats.defaultedLoans} defaulted loans
                </div>
              </CardContent>
            </Card>

            <Card className="tech-card border-none">
              <CardHeader>
                <CardTitle className="text-sm">Payment Success Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-green-600">{stats.paymentSuccessRate}%</span>
                  <TrendingUp className="h-8 w-8 text-green-600/20" />
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {stats.overduePayments} overdue of {stats.totalScheduledPayments}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Growth Chart */}
            <Card className="tech-card border-none">
              <CardHeader>
                <CardTitle>Growth Trends</CardTitle>
                <CardDescription>User and loan growth over last 6 months</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={growthData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="users" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
                    <Area type="monotone" dataKey="loans" stackId="2" stroke="#10b981" fill="#10b981" fillOpacity={0.6} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Loan Status Distribution */}
            <Card className="tech-card border-none">
              <CardHeader>
                <CardTitle>Loan Status Distribution</CardTitle>
                <CardDescription>Breakdown of loan statuses</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={loanStatusData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {loanStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Detailed Tabs */}
      <Tabs defaultValue="users" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="users">Recent Users</TabsTrigger>
          <TabsTrigger value="loans">Recent Loans</TabsTrigger>
          <TabsTrigger value="risks">Risk Flags</TabsTrigger>
          <TabsTrigger value="lenders">Lenders</TabsTrigger>
        </TabsList>

        {/* Recent Users Tab */}
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Recent Users</CardTitle>
              <CardDescription>Latest user registrations in {country.name}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentUsers.map((user) => (
                    <TableRow key={user.user_id}>
                      <TableCell className="font-medium">{user.full_name || 'Pending'}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Badge className="capitalize">{user.app_role || 'No role'}</Badge>
                      </TableCell>
                      <TableCell>{format(new Date(user.created_at), 'MMM dd, yyyy')}</TableCell>
                      <TableCell>
                        <Badge variant={user.onboarding_completed ? 'default' : 'secondary'}>
                          {user.onboarding_completed ? 'Active' : 'Onboarding'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {recentUsers.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No users found
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recent Loans Tab */}
        <TabsContent value="loans">
          <Card>
            <CardHeader>
              <CardTitle>Recent Loans</CardTitle>
              <CardDescription>Latest loan activity in {country.name}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Borrower</TableHead>
                    <TableHead>Lender</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>APR</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentLoans.map((loan) => (
                    <TableRow key={loan.id}>
                      <TableCell className="font-medium">{loan.borrowers?.full_name || 'N/A'}</TableCell>
                      <TableCell>{loan.lenders?.business_name || loan.lenders?.profiles?.full_name || 'N/A'}</TableCell>
                      <TableCell>{formatCurrency(loan.principal_minor / 100)}</TableCell>
                      <TableCell>{(loan.apr_bps / 100).toFixed(1)}%</TableCell>
                      <TableCell>{getStatusBadge(loan.status)}</TableCell>
                      <TableCell>{format(new Date(loan.created_at), 'MMM dd, yyyy')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {recentLoans.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No loans found
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Risk Flags Tab */}
        <TabsContent value="risks">
          <Card>
            <CardHeader>
              <CardTitle>Open Risk Flags</CardTitle>
              <CardDescription>Active risk alerts in {country.name}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Borrower</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Origin</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {riskFlags.map((flag) => (
                    <TableRow key={flag.id}>
                      <TableCell className="font-medium">{flag.borrowers?.full_name || 'N/A'}</TableCell>
                      <TableCell>
                        <Badge variant="destructive">{flag.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{flag.origin}</Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{flag.description || 'No description'}</TableCell>
                      <TableCell>{format(new Date(flag.created_at), 'MMM dd, yyyy')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {riskFlags.length === 0 && (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                  <p className="text-muted-foreground">No open risk flags</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Lenders Tab */}
        <TabsContent value="lenders">
          <Card>
            <CardHeader>
              <CardTitle>Lender Statistics</CardTitle>
              <CardDescription>Lender performance in {country.name}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl">
                  <div className="text-sm text-gray-600 mb-1">Total Lenders</div>
                  <div className="text-2xl font-bold text-blue-600">{stats?.totalLenders || 0}</div>
                </div>
                <div className="p-4 bg-gradient-to-br from-green-50 to-green-100/50 rounded-xl">
                  <div className="text-sm text-gray-600 mb-1">Verified</div>
                  <div className="text-2xl font-bold text-green-600">{stats?.verifiedLenders || 0}</div>
                </div>
                <div className="p-4 bg-gradient-to-br from-orange-50 to-orange-100/50 rounded-xl">
                  <div className="text-sm text-gray-600 mb-1">Pending</div>
                  <div className="text-2xl font-bold text-orange-600">
                    {(stats?.totalLenders || 0) - (stats?.verifiedLenders || 0)}
                  </div>
                </div>
              </div>
              <div className="text-center py-6 text-muted-foreground">
                Detailed lender metrics coming soon
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
