'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatMinorToMajor } from '@/lib/utils/currency'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
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
  RefreshCw,
  CreditCard,
  Wallet,
  Banknote,
  Search,
  Loader2,
  Mail,
  Phone
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

interface NamibianLender {
  user_id: string
  full_name: string
  email: string
  phone: string
  business_name: string
  id_number: string
  current_tier: string
  subscription_status: string
  subscription_end_date: string | null
  payment_method: string | null
  created_at: string
}

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

  // Manual subscription state (Namibia only)
  const [manualSubLenders, setManualSubLenders] = useState<NamibianLender[]>([])
  const [manualSubSearch, setManualSubSearch] = useState('')
  const [activateDialogOpen, setActivateDialogOpen] = useState(false)
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false)
  const [selectedLender, setSelectedLender] = useState<NamibianLender | null>(null)
  const [processing, setProcessing] = useState(false)
  const [activationForm, setActivationForm] = useState({
    tier: 'PRO',
    paymentMethod: 'cash',
    paymentReference: '',
    amountPaid: '',
    durationMonths: '1',
    notes: ''
  })
  const [deactivationReason, setDeactivationReason] = useState('')

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
        loadGrowthData(),
        // Load manual subscription lenders only for Namibia
        countryCode.toUpperCase() === 'NA' ? loadManualSubLenders() : Promise.resolve()
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

    const scores = borrowerScores?.map((b: any) => b.borrower_scores).flat().filter(Boolean) || []
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
    const activeLoans = loans?.filter((l: any) => l.status === 'active').length || 0
    const completedLoans = loans?.filter((l: any) => l.status === 'completed').length || 0
    const defaultedLoans = loans?.filter((l: any) => l.status === 'defaulted').length || 0
    const cancelledLoans = loans?.filter((l: any) => l.status === 'cancelled').length || 0
    const pendingLoans = loans?.filter((l: any) => l.status === 'pending' || l.status === 'offered').length || 0
    // Keep in MINOR units for consistent formatting
    const totalLoanVolume = loans?.reduce((sum: number, loan: any) => sum + (loan.principal_minor || 0), 0) || 0
    const avgLoanSize = totalLoans > 0 ? Math.round(totalLoanVolume / totalLoans) : 0
    const avgAPR = loans && loans.length > 0
      ? Math.round(loans.reduce((sum: number, l: any) => sum + l.apr_bps, 0) / loans.length / 100)
      : 0
    // Exclude cancelled loans from default rate calculation (they were never active)
    const processedLoans = totalLoans - cancelledLoans
    const defaultRate = processedLoans > 0 ? (defaultedLoans / processedLoans) * 100 : 0

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

    // PAYMENT METRICS - exclude cancelled loans from payment calculations
    const { data: schedules } = await supabase
      .from('repayment_schedules')
      .select(`
        id,
        due_date,
        amount_due_minor,
        loans!inner(country_code, status)
      `)
      .eq('loans.country_code', code)
      .neq('loans.status', 'cancelled')

    const overduePayments = schedules?.filter((s: any) => new Date(s.due_date) < new Date()).length || 0
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
      cancelledLoans,
      pendingLoans,
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
    const usersWithDisplay = (data || []).map((profile: any) => ({
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

  // ============ MANUAL SUBSCRIPTION FUNCTIONS (Namibia Only) ============
  const loadManualSubLenders = async () => {
    try {
      const { data, error } = await supabase.rpc('admin_get_namibian_lenders')
      if (error) throw error
      setManualSubLenders(data || [])
    } catch (error: any) {
      console.error('Error loading Namibian lenders:', error)
    }
  }

  const handleActivateSubscription = async () => {
    if (!selectedLender) return

    try {
      setProcessing(true)

      const { data, error } = await supabase.rpc('admin_activate_subscription', {
        p_lender_user_id: selectedLender.user_id,
        p_tier: activationForm.tier,
        p_payment_method: activationForm.paymentMethod,
        p_payment_reference: activationForm.paymentReference || null,
        p_amount_paid: activationForm.amountPaid ? parseFloat(activationForm.amountPaid) : null,
        p_duration_months: parseInt(activationForm.durationMonths),
        p_notes: activationForm.notes || null
      })

      if (error) throw error

      toast.success(`${activationForm.tier} subscription activated for ${selectedLender.full_name}`)
      setActivateDialogOpen(false)
      setSelectedLender(null)
      resetActivationForm()
      loadManualSubLenders()
    } catch (error: any) {
      console.error('Error activating subscription:', error)
      toast.error('Failed to activate: ' + error.message)
    } finally {
      setProcessing(false)
    }
  }

  const handleDeactivateSubscription = async () => {
    if (!selectedLender) return

    try {
      setProcessing(true)

      const { data, error } = await supabase.rpc('admin_deactivate_subscription', {
        p_lender_user_id: selectedLender.user_id,
        p_reason: deactivationReason || null
      })

      if (error) throw error

      toast.success(`Subscription deactivated for ${selectedLender.full_name}`)
      setDeactivateDialogOpen(false)
      setSelectedLender(null)
      setDeactivationReason('')
      loadManualSubLenders()
    } catch (error: any) {
      console.error('Error deactivating subscription:', error)
      toast.error('Failed to deactivate: ' + error.message)
    } finally {
      setProcessing(false)
    }
  }

  const resetActivationForm = () => {
    setActivationForm({
      tier: 'PRO',
      paymentMethod: 'cash',
      paymentReference: '',
      amountPaid: '',
      durationMonths: '1',
      notes: ''
    })
  }

  const openActivateDialog = (lender: NamibianLender) => {
    setSelectedLender(lender)
    resetActivationForm()
    setActivateDialogOpen(true)
  }

  const openDeactivateDialog = (lender: NamibianLender) => {
    setSelectedLender(lender)
    setDeactivationReason('')
    setDeactivateDialogOpen(true)
  }

  const filteredManualSubLenders = manualSubLenders.filter(lender =>
    lender.id_number?.toLowerCase().includes(manualSubSearch.toLowerCase())
  )

  const getTierBadge = (tier: string, status: string) => {
    if (status === 'none' || !tier) {
      return <Badge variant="outline" className="bg-gray-100">FREE</Badge>
    }
    if (status === 'cancelled') {
      return <Badge variant="outline" className="bg-red-100 text-red-700">Cancelled</Badge>
    }
    if (tier === 'BUSINESS') {
      return <Badge className="bg-purple-600">BUSINESS</Badge>
    }
    if (tier === 'PRO') {
      return <Badge className="bg-blue-600">PRO</Badge>
    }
    return <Badge variant="outline">{tier}</Badge>
  }

  const getPaymentMethodIcon = (method: string | null) => {
    switch (method) {
      case 'cash':
        return <Banknote className="h-4 w-4 text-green-600" />
      case 'ewallet':
        return <Wallet className="h-4 w-4 text-blue-600" />
      case 'bank_transfer':
        return <Building2 className="h-4 w-4 text-purple-600" />
      default:
        return <CreditCard className="h-4 w-4 text-gray-400" />
    }
  }
  // ============ END MANUAL SUBSCRIPTION FUNCTIONS ============

  // Use centralized currency utility - always converts from minor units
  const formatCurrency = (amountMinor: number) => {
    return formatMinorToMajor(amountMinor, country?.currencySymbol || '$')
  }

  const getStatusBadge = (status: string) => {
    const variants: any = {
      active: 'default',
      completed: 'secondary',
      defaulted: 'destructive',
      cancelled: 'outline',
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
    { name: 'Pending', value: stats.pendingLoans, color: '#eab308' },
    { name: 'Active', value: stats.activeLoans, color: '#3b82f6' },
    { name: 'Completed', value: stats.completedLoans, color: '#10b981' },
    { name: 'Defaulted', value: stats.defaultedLoans, color: '#ef4444' },
    { name: 'Cancelled', value: stats.cancelledLoans, color: '#9ca3af' }
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
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Total Accounts</CardTitle>
                <div className="p-2.5 bg-gradient-to-br from-blue-500/10 to-blue-500/5 rounded-xl">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
              </CardHeader>
              <CardContent>
                <span className="text-3xl font-bold text-blue-600">{stats.totalUsers}</span>
                <div className="mt-1.5 text-sm text-muted-foreground font-medium">
                  {stats.totalBorrowers} borrowers • {stats.totalLenders} lenders
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
                <div className="mt-1.5 text-xs text-muted-foreground font-medium">
                  {stats.pendingLoans > 0 && <><span className="text-yellow-600">{stats.pendingLoans} pending</span> • </>}
                  <span className="text-blue-600">{stats.activeLoans} active</span> •
                  <span className="text-green-600"> {stats.completedLoans} completed</span> •
                  <span className="text-gray-500"> {stats.cancelledLoans} cancelled</span>
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
        <TabsList className={`grid w-full ${countryCode.toUpperCase() === 'NA' ? 'grid-cols-5' : 'grid-cols-4'}`}>
          <TabsTrigger value="users">Recent Users</TabsTrigger>
          <TabsTrigger value="loans">Recent Loans</TabsTrigger>
          <TabsTrigger value="risks">Risk Flags</TabsTrigger>
          <TabsTrigger value="lenders">Lenders</TabsTrigger>
          {countryCode.toUpperCase() === 'NA' && (
            <TabsTrigger value="manual-subs" className="flex items-center gap-1">
              <CreditCard className="h-4 w-4" />
              Manual Subs
            </TabsTrigger>
          )}
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
                      <TableCell>{formatCurrency(loan.principal_minor)}</TableCell>
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

        {/* Manual Subscriptions Tab (Namibia Only) */}
        {countryCode.toUpperCase() === 'NA' && (
          <TabsContent value="manual-subs">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Manual Subscription Activation
                </CardTitle>
                <CardDescription>
                  Activate subscriptions for lenders who pay via cash or e-wallet
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Info Alert */}
                <Alert className="mb-4 bg-blue-50 border-blue-200">
                  <AlertTriangle className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800">
                    Use this to manually activate PRO or BUSINESS subscriptions for lenders who pay via cash, e-wallet, or bank transfer.
                  </AlertDescription>
                </Alert>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold">{manualSubLenders.length}</div>
                    <p className="text-sm text-muted-foreground">Total Lenders</p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {manualSubLenders.filter(l => l.subscription_status === 'active').length}
                    </div>
                    <p className="text-sm text-muted-foreground">Active Subs</p>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">
                      {manualSubLenders.filter(l => l.current_tier === 'PRO').length}
                    </div>
                    <p className="text-sm text-muted-foreground">PRO Users</p>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">
                      {manualSubLenders.filter(l => l.current_tier === 'BUSINESS').length}
                    </div>
                    <p className="text-sm text-muted-foreground">BUSINESS Users</p>
                  </div>
                </div>

                {/* Search */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by ID number..."
                    value={manualSubSearch}
                    onChange={(e) => setManualSubSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Table */}
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lender</TableHead>
                        <TableHead>ID Number</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Current Plan</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredManualSubLenders.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            {manualSubSearch ? 'No lenders match your search' : 'No Namibian lenders found'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredManualSubLenders.map((lender) => (
                          <TableRow key={lender.user_id}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{lender.full_name}</div>
                                {lender.business_name && (
                                  <div className="text-sm text-muted-foreground">{lender.business_name}</div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="font-mono text-sm">{lender.id_number || 'N/A'}</div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm space-y-1">
                                <div className="flex items-center gap-1">
                                  <Mail className="h-3 w-3 text-muted-foreground" />
                                  {lender.email}
                                </div>
                                {lender.phone && (
                                  <div className="flex items-center gap-1">
                                    <Phone className="h-3 w-3 text-muted-foreground" />
                                    {lender.phone}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {getTierBadge(lender.current_tier, lender.subscription_status)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getPaymentMethodIcon(lender.payment_method)}
                                <span className="text-sm capitalize">
                                  {lender.payment_method?.replace('_', ' ') || 'N/A'}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {lender.subscription_end_date ? (
                                <div className="flex items-center gap-1 text-sm">
                                  <Clock className="h-3 w-3 text-muted-foreground" />
                                  {format(new Date(lender.subscription_end_date), 'MMM dd, yyyy')}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button size="sm" onClick={() => openActivateDialog(lender)}>
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  Activate
                                </Button>
                                {lender.subscription_status === 'active' && (
                                  <Button size="sm" variant="destructive" onClick={() => openDeactivateDialog(lender)}>
                                    <XCircle className="h-4 w-4 mr-1" />
                                    Deactivate
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Activate Subscription Dialog */}
      <Dialog open={activateDialogOpen} onOpenChange={setActivateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Activate Subscription</DialogTitle>
            <DialogDescription>
              Manually activate a subscription for <strong>{selectedLender?.full_name}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Subscription Tier</Label>
              <Select
                value={activationForm.tier}
                onValueChange={(value) => setActivationForm(prev => ({ ...prev, tier: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRO">PRO - $9.99/month</SelectItem>
                  <SelectItem value="BUSINESS">BUSINESS - $17.99/month</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select
                value={activationForm.paymentMethod}
                onValueChange={(value) => setActivationForm(prev => ({ ...prev, paymentMethod: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="ewallet">E-Wallet (EasyWallet, etc.)</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Payment Reference (optional)</Label>
              <Input
                placeholder="e.g., receipt number, transfer ID"
                value={activationForm.paymentReference}
                onChange={(e) => setActivationForm(prev => ({ ...prev, paymentReference: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Amount Paid (NAD)</Label>
              <Input
                type="number"
                placeholder="e.g., 99.99"
                value={activationForm.amountPaid}
                onChange={(e) => setActivationForm(prev => ({ ...prev, amountPaid: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Duration (months)</Label>
              <Select
                value={activationForm.durationMonths}
                onValueChange={(value) => setActivationForm(prev => ({ ...prev, durationMonths: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 month</SelectItem>
                  <SelectItem value="3">3 months</SelectItem>
                  <SelectItem value="6">6 months</SelectItem>
                  <SelectItem value="12">12 months</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Any additional notes..."
                value={activationForm.notes}
                onChange={(e) => setActivationForm(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setActivateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleActivateSubscription} disabled={processing}>
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Activating...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Activate {activationForm.tier}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Subscription Dialog */}
      <Dialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate Subscription</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate the subscription for <strong>{selectedLender?.full_name}</strong>?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason for Deactivation (optional)</Label>
              <Textarea
                placeholder="e.g., refund requested, payment issue..."
                value={deactivationReason}
                onChange={(e) => setDeactivationReason(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeactivateSubscription} disabled={processing}>
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deactivating...
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-2" />
                  Deactivate
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
