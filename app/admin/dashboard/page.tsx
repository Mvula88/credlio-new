'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { getCurrencyByCountry, fromMinorUnits } from '@/lib/utils/currency'
import {
  Users,
  Shield,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Activity,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  Filter,
  Download,
  Eye,
  UserCheck,
  UserX,
  Settings,
  BarChart3,
  PieChart,
  CreditCard,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  Database,
  Lock,
  Unlock,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  MoreVertical,
  Mail,
  Phone,
  Calendar,
  MapPin,
  Briefcase,
  Building2,
  BadgeAlert,
  BadgeCheck,
  FileSearch,
  UserCog,
  Banknote,
  Receipt,
  Calculator,
  Target,
  TrendingDown,
  Info,
  ArrowUpRight,
  ArrowDownRight,
  MessageSquare,
  Scale,
  Award
} from 'lucide-react'
import { format, subDays } from 'date-fns'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
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
  ComposedChart
} from 'recharts'

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true)
  const [adminProfile, setAdminProfile] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [pendingKYC, setPendingKYC] = useState<any[]>([])
  const [riskAlerts, setRiskAlerts] = useState<any[]>([])
  const [recentActivity, setRecentActivity] = useState<any[]>([])
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [showKYCDialog, setShowKYCDialog] = useState(false)
  const [showRiskDialog, setShowRiskDialog] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')
  const [dateRange, setDateRange] = useState('7days')
  const [countryStats, setCountryStats] = useState<any[]>([])
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadAdminData()
  }, [])

  const loadAdminData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/admin/login')
        return
      }

      // Check admin role - support both multi-role and single-role systems
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      // If no profile, check user_roles table
      let isAdmin = false

      if (profile && profile.app_role === 'admin') {
        isAdmin = true
      } else {
        // Check multi-role system
        const { data: userRoles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)

        const roles = userRoles?.map((r: any) => r.role) || []
        isAdmin = roles.includes('admin')
      }

      if (!isAdmin) {
        console.log('User is not an admin, redirecting...')
        router.push('/')
        return
      }

      setAdminProfile(profile)

      // Load statistics
      await loadStatistics()
      await loadCountryStatistics()
      await loadPendingKYC()
      await loadRiskAlerts()
      await loadRecentActivity()
    } catch (error) {
      console.error('Error loading admin data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadStatistics = async () => {
    try {
      console.log('Loading statistics...')

      // USER METRICS
      const { count: totalUsers, error: usersError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })

      if (usersError) {
        console.error('Error loading users:', usersError)
      }

    // BORROWER METRICS
    const { count: totalBorrowers } = await supabase
      .from('borrowers')
      .select('*', { count: 'exact', head: true })

    const { count: borrowersWithAccounts } = await supabase
      .from('borrower_user_links')
      .select('*', { count: 'exact', head: true })

    const borrowersWithoutAccounts = (totalBorrowers || 0) - (borrowersWithAccounts || 0)

    const { data: borrowerScores } = await supabase
      .from('borrower_scores')
      .select('score')

    const avgCreditScore = borrowerScores && borrowerScores.length > 0
      ? Math.round(borrowerScores.reduce((sum: number, b: any) => sum + b.score, 0) / borrowerScores.length)
      : 0

    const { count: borrowersWithActiveLoans } = await supabase
      .from('loans')
      .select('borrower_id', { count: 'exact', head: true })
      .eq('status', 'active')

    const { count: openRiskFlags } = await supabase
      .from('risk_flags')
      .select('*', { count: 'exact', head: true })
      .is('resolved_at', null)

    // LENDER METRICS
    const { count: totalLenders } = await supabase
      .from('lenders')
      .select('*', { count: 'exact', head: true })

    const { count: verifiedLenders } = await supabase
      .from('lenders')
      .select('*', { count: 'exact', head: true })
      .eq('verification_status', 'verified')

    const { data: lenderScores } = await supabase
      .from('lender_scores')
      .select('on_time_rate, evidence_rate, total_loans, total_reports')

    const avgOnTimeRate = lenderScores && lenderScores.length > 0
      ? Math.round(lenderScores.reduce((sum: number, l: any) => sum + parseFloat(l.on_time_rate), 0) / lenderScores.length)
      : 0

    const totalLoansOriginated = lenderScores?.reduce((sum: number, l: any) => sum + l.total_loans, 0) || 0

    // LOAN METRICS
    const { data: loans } = await supabase
      .from('loans')
      .select('principal_minor, status, apr_bps, term_months')

    // Keep in MINOR units for consistent formatting
    const totalLoanVolume = loans?.reduce((sum: number, loan: any) => sum + (loan.principal_minor || 0), 0) || 0
    const activeLoans = loans?.filter((l: any) => l.status === 'active').length || 0
    const completedLoans = loans?.filter((l: any) => l.status === 'completed').length || 0
    const defaultedLoans = loans?.filter((l: any) => l.status === 'defaulted').length || 0
    const cancelledLoans = loans?.filter((l: any) => l.status === 'cancelled').length || 0
    const totalLoans = loans?.length || 0
    // Exclude cancelled loans from default rate calculation (they were never active)
    const processedLoans = totalLoans - cancelledLoans
    const defaultRate = processedLoans > 0 ? (defaultedLoans / processedLoans) * 100 : 0

    // avgLoanSize in minor units
    const avgLoanSize = totalLoans > 0 ? Math.round(totalLoanVolume / totalLoans) : 0
    const avgAPR = loans && loans.length > 0
      ? Math.round(loans.reduce((sum: number, l: any) => sum + l.apr_bps, 0) / loans.length / 100)
      : 0

    // PAYMENT METRICS
    const { data: schedules } = await supabase
      .from('repayment_schedules')
      .select('id, due_date, amount_due_minor')

    const overduePayments = schedules?.filter((s: any) => new Date(s.due_date) < new Date()).length || 0

    const { count: totalRepayments } = await supabase
      .from('repayment_events')
      .select('*', { count: 'exact', head: true })

    // PAYMENT HEALTH ANALYTICS - NEW
    const { data: allSchedules } = await supabase
      .from('repayment_schedules')
      .select('id, status, due_date, paid_at, borrower_id:loans!inner(borrower_id)')

    let totalOnTimePayments = 0
    let totalLatePayments = 0
    let totalPaidPayments = 0
    let totalOverduePayments = 0

    allSchedules?.forEach((schedule: any) => {
      if (schedule.status === 'paid' && schedule.paid_at) {
        totalPaidPayments++
        const dueDate = new Date(schedule.due_date)
        const paidDate = new Date(schedule.paid_at)
        if (paidDate <= dueDate) {
          totalOnTimePayments++
        } else {
          totalLatePayments++
        }
      } else if (schedule.status !== 'paid' && new Date(schedule.due_date) < new Date()) {
        totalOverduePayments++
      }
    })

    const systemOnTimeRate = totalPaidPayments > 0 ? Math.round((totalOnTimePayments / totalPaidPayments) * 100) : 0
    const systemPaymentHealthScore = totalPaidPayments > 0 ? Math.round((totalOnTimePayments / totalPaidPayments) * 100) : 0

    // Calculate per-borrower payment health
    const { data: allLoansWithSchedules } = await supabase
      .from('loans')
      .select(`
        borrower_id,
        repayment_schedules(id, status, due_date, paid_at)
      `)

    const borrowerPaymentHealth: { [key: string]: { onTime: number, late: number, overdue: number, total: number } } = {}

    allLoansWithSchedules?.forEach((loan: any) => {
      if (!borrowerPaymentHealth[loan.borrower_id]) {
        borrowerPaymentHealth[loan.borrower_id] = { onTime: 0, late: 0, overdue: 0, total: 0 }
      }

      loan.repayment_schedules?.forEach((schedule: any) => {
        if (schedule.status === 'paid' && schedule.paid_at) {
          borrowerPaymentHealth[loan.borrower_id].total++
          const dueDate = new Date(schedule.due_date)
          const paidDate = new Date(schedule.paid_at)
          if (paidDate <= dueDate) {
            borrowerPaymentHealth[loan.borrower_id].onTime++
          } else {
            borrowerPaymentHealth[loan.borrower_id].late++
          }
        } else if (schedule.status !== 'paid' && new Date(schedule.due_date) < new Date()) {
          borrowerPaymentHealth[loan.borrower_id].overdue++
        }
      })
    })

    let excellentBorrowers = 0
    let goodBorrowers = 0
    let poorBorrowers = 0

    Object.values(borrowerPaymentHealth).forEach((health: any) => {
      if (health.total > 0) {
        const score = Math.round((health.onTime / health.total) * 100)
        if (score >= 80) excellentBorrowers++
        else if (score >= 60) goodBorrowers++
        else poorBorrowers++
      }
    })

    // RISK FLAGS BY TYPE
    const { data: riskFlagsByType } = await supabase
      .from('risk_flags')
      .select('type')
      .is('resolved_at', null)

    const riskFlagsCount = {
      payment_default: riskFlagsByType?.filter((r: any) => r.type === 'PAYMENT_DEFAULT').length || 0,
      fraud_suspected: riskFlagsByType?.filter((r: any) => r.type === 'FRAUD_SUSPECTED').length || 0,
      identity_mismatch: riskFlagsByType?.filter((r: any) => r.type === 'IDENTITY_MISMATCH').length || 0,
      duplicate_account: riskFlagsByType?.filter((r: any) => r.type === 'DUPLICATE_ACCOUNT').length || 0,
    }

    // SUSPICIOUS ACTIVITY METRICS
    const { count: fraudSignalsCount } = await supabase
      .from('fraud_signals')
      .select('*', { count: 'exact', head: true })
      .gte('score', 70)

    const { count: flaggedMessagesCount } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('flagged_as_spam', true)

    const { count: criticalFraudCount } = await supabase
      .from('fraud_signals')
      .select('*', { count: 'exact', head: true })
      .gte('score', 90)

    const { count: activeDisputesCount } = await supabase
      .from('disputes')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'under_review', 'awaiting_evidence', 'escalated'])

    setStats({
      // User metrics
      totalUsers: totalUsers || 0,

      // Borrower metrics
      totalBorrowers: totalBorrowers || 0,
      borrowersWithAccounts: borrowersWithAccounts || 0,
      borrowersWithoutAccounts,
      avgCreditScore,
      borrowersWithActiveLoans: borrowersWithActiveLoans || 0,
      openRiskFlags: openRiskFlags || 0,

      // Lender metrics
      totalLenders: totalLenders || 0,
      verifiedLenders: verifiedLenders || 0,
      pendingLenders: (totalLenders || 0) - (verifiedLenders || 0),
      avgOnTimeRate,
      totalLoansOriginated,

      // Loan metrics
      totalLoans,
      activeLoans,
      completedLoans,
      defaultedLoans,
      cancelledLoans,
      totalLoanVolume,
      avgLoanSize,
      avgAPR,
      defaultRate,

      // Payment metrics
      overduePayments,
      totalRepayments: totalRepayments || 0,

      // Payment Health Analytics - NEW
      totalOnTimePayments,
      totalLatePayments,
      totalOverduePayments,
      systemOnTimeRate,
      systemPaymentHealthScore,
      excellentBorrowers,
      goodBorrowers,
      poorBorrowers,
      totalBorrowersWithPayments: Object.keys(borrowerPaymentHealth).length,

      // Risk metrics
      riskFlagsCount,
      kycCompletionRate: 0, // KYC is handled separately in borrower onboarding

      // Suspicious Activity metrics
      fraudSignalsCount: fraudSignalsCount || 0,
      flaggedMessagesCount: flaggedMessagesCount || 0,
      criticalFraudCount: criticalFraudCount || 0,
      activeDisputesCount: activeDisputesCount || 0
    })

    console.log('Statistics loaded successfully')
    } catch (error) {
      console.error('Error in loadStatistics:', error)
      // Set default stats so page doesn't hang
      setStats({
        totalUsers: 0,
        totalBorrowers: 0,
        totalLenders: 0,
        totalLoans: 0,
        totalLoanVolume: 0,
        activeLoans: 0,
        defaultRate: 0,
        avgCreditScore: 0,
        avgOnTimeRate: 0,
        overduePayments: 0,
        totalRepayments: 0,
        systemOnTimeRate: 0,
        systemPaymentHealthScore: 0
      })
    }
  }

  const loadCountryStatistics = async () => {
    try {
      console.log('Loading country statistics...')
    // Get all countries
    const { data: countries } = await supabase
      .from('countries')
      .select('code, name, phone_prefix')
      .order('name')

    if (!countries) return

    // Get statistics for each country
    const countryData = await Promise.all(
      countries.map(async (country: any) => {
        // Get users by country
        const { count: totalUsers } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('country_code', country.code)

        // Get borrowers by country
        const { count: totalBorrowers } = await supabase
          .from('borrowers')
          .select('*', { count: 'exact', head: true })
          .eq('country_code', country.code)

        // Get lenders by country
        const { count: totalLenders } = await supabase
          .from('lenders')
          .select('*', { count: 'exact', head: true })
          .eq('country', country.code)

        // Get loans by country
        const { data: loans } = await supabase
          .from('loans')
          .select('principal_minor, status')
          .eq('country_code', country.code)

        const totalLoans = loans?.length || 0
        const activeLoans = loans?.filter((l: any) => l.status === 'active').length || 0
        // Keep in MINOR units for consistent formatting
        const totalLoanVolume = loans?.reduce((sum: number, loan: any) => sum + (loan.principal_minor || 0), 0) || 0

        // Get risk flags by country
        const { count: openRiskFlags } = await supabase
          .from('risk_flags')
          .select('*', { count: 'exact', head: true })
          .eq('country_code', country.code)
          .is('resolved_at', null)

        return {
          code: country.code,
          name: country.name,
          phonePrefix: country.phone_prefix,
          totalUsers: totalUsers || 0,
          totalBorrowers: totalBorrowers || 0,
          totalLenders: totalLenders || 0,
          totalLoans,
          activeLoans,
          totalLoanVolume,
          openRiskFlags: openRiskFlags || 0
        }
      })
    )

    setCountryStats(countryData)
    console.log('Country statistics loaded')
    } catch (error) {
      console.error('Error loading country statistics:', error)
      setCountryStats([])
    }
  }

  const loadPendingKYC = async () => {
    try {
    // Get borrowers without linked user accounts (pending account creation)
    const { data } = await supabase
      .from('borrowers')
      .select(`
        id,
        full_name,
        phone_e164,
        created_at,
        created_by_lender
      `)
      .not('id', 'in', supabase
        .from('borrower_user_links')
        .select('borrower_id')
      )
      .order('created_at', { ascending: false })
      .limit(10)

    setPendingKYC(data || [])
    } catch (error) {
      console.error('Error loading pending KYC:', error)
      setPendingKYC([])
    }
  }

  const loadRiskAlerts = async () => {
    try {
      const alerts: any[] = []

      // 1. Get fraud signals
      const { data: fraudSignals } = await supabase
        .from('fraud_signals')
        .select(`
          *,
          borrowers(full_name, phone_e164),
          lenders(business_name)
        `)
        .gte('score', 70) // High severity fraud signals
        .order('created_at', { ascending: false })
        .limit(10)

      fraudSignals?.forEach((signal: any) => {
        alerts.push({
          id: signal.id,
          type: 'fraud_signal',
          severity: signal.score >= 90 ? 'critical' : 'high',
          title: `Fraud Signal: ${signal.signal_type}`,
          description: `Score: ${signal.score}/100${signal.borrower_id ? ` - Borrower: ${signal.borrowers?.full_name}` : ''}${signal.lender_id ? ` - Lender: ${signal.lenders?.business_name}` : ''}`,
          timestamp: signal.created_at,
          details: signal.details
        })
      })

      // 2. Get flagged messages
      const { data: flaggedMessages } = await supabase
        .from('messages')
        .select(`
          *,
          message_threads(
            lender_id,
            borrower_id
          )
        `)
        .eq('flagged_as_spam', true)
        .order('created_at', { ascending: false })
        .limit(10)

      // Enrich flagged messages with sender info
      const enrichedMessages = await Promise.all(
        (flaggedMessages || []).map(async (msg: any) => {
          let senderName = 'Unknown'

          if (msg.sender_type === 'borrower' && msg.message_threads?.borrower_id) {
            const { data: borrower } = await supabase
              .from('borrowers')
              .select('full_name')
              .eq('id', msg.message_threads.borrower_id)
              .single()
            senderName = borrower?.full_name || 'Unknown Borrower'
          } else if (msg.sender_type === 'lender' && msg.message_threads?.lender_id) {
            const { data: lender } = await supabase
              .from('lenders')
              .select('business_name')
              .eq('user_id', msg.message_threads.lender_id)
              .single()
            senderName = lender?.business_name || 'Unknown Lender'
          }

          return {
            id: msg.id,
            type: 'flagged_message',
            severity: 'medium',
            title: `Suspicious Message Detected`,
            description: `From ${senderName} (${msg.sender_type}) - Message: "${msg.message.substring(0, 50)}${msg.message.length > 50 ? '...' : ''}"`,
            timestamp: msg.created_at,
            details: { message: msg.message, sender_type: msg.sender_type }
          }
        })
      )

      alerts.push(...enrichedMessages)

      // 3. Get unresolved risk flags
      const { data: riskFlags } = await supabase
        .from('risk_flags')
        .select(`
          *,
          borrowers(full_name, phone_e164),
          lenders(business_name)
        `)
        .is('resolved_at', null)
        .order('created_at', { ascending: false })
        .limit(10)

      riskFlags?.forEach((flag: any) => {
        let severity = 'low'
        if (flag.severity === 'critical') severity = 'critical'
        else if (flag.severity === 'high') severity = 'high'
        else if (flag.severity === 'medium') severity = 'medium'

        alerts.push({
          id: flag.id,
          type: 'risk_flag',
          severity,
          title: `Risk Flag: ${flag.flag_type}`,
          description: `${flag.reason}${flag.borrower_id ? ` - Borrower: ${flag.borrowers?.full_name}` : ''}${flag.lender_id ? ` - Lender: ${flag.lenders?.business_name}` : ''}`,
          timestamp: flag.created_at,
          details: flag
        })
      })

      // 4. Get high-risk loan requests (multiple requests from same borrower in short time)
      const { data: recentRequests } = await supabase
        .from('loan_requests')
        .select('borrower_id, created_at, amount_minor, purpose')
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days
        .order('created_at', { ascending: false })

      // Group by borrower_id
      const requestsByBorrower: { [key: string]: any[] } = {}
      recentRequests?.forEach((req: any) => {
        if (!requestsByBorrower[req.borrower_id]) {
          requestsByBorrower[req.borrower_id] = []
        }
        requestsByBorrower[req.borrower_id].push(req)
      })

      // Find borrowers with multiple requests
      for (const [borrowerId, requests] of Object.entries(requestsByBorrower)) {
        if (requests.length >= 3) {
          const { data: borrower } = await supabase
            .from('borrowers')
            .select('full_name')
            .eq('id', borrowerId)
            .single()

          alerts.push({
            id: `multiple-requests-${borrowerId}`,
            type: 'suspicious_pattern',
            severity: 'medium',
            title: 'Multiple Loan Requests',
            description: `${borrower?.full_name || 'Unknown'} has submitted ${requests.length} loan requests in the last 7 days`,
            timestamp: requests[0].created_at,
            details: { borrower_id: borrowerId, request_count: requests.length }
          })
        }
      }

      // Sort by severity and timestamp
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
      alerts.sort((a, b) => {
        const severityDiff = severityOrder[a.severity as keyof typeof severityOrder] - severityOrder[b.severity as keyof typeof severityOrder]
        if (severityDiff !== 0) return severityDiff
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      })

      setRiskAlerts(alerts.slice(0, 20)) // Top 20 alerts
    } catch (error) {
      console.error('Error loading risk alerts:', error)
      setRiskAlerts([])
    }
  }

  const loadRecentActivity = async () => {
    try {
    // Get recent signups
    const { data: recentUsers } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)

    // Get recent loans
    const { data: recentLoans } = await supabase
      .from('loans')
      .select(`
        *,
        borrowers(
          profiles(full_name)
        ),
        lenders(
          business_name
        )
      `)
      .order('created_at', { ascending: false })
      .limit(5)

    const activities = [
      ...(recentUsers?.map((u: any) => ({
        type: 'user_signup',
        description: `New ${u.role} registered: ${u.full_name}`,
        timestamp: u.created_at,
        icon: Users
      })) || []),
      ...(recentLoans?.map((l: any) => ({
        type: 'loan_created',
        description: `Loan approved: $${l.principal_amount}`,
        timestamp: l.created_at,
        icon: CreditCard
      })) || [])
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    setRecentActivity(activities.slice(0, 10))
    } catch (error) {
      console.error('Error loading recent activity:', error)
      setRecentActivity([])
    }
  }

  const handleKYCReview = async (borrowerId: string, action: 'approve' | 'reject') => {
    try {
      const status = action === 'approve' ? 'verified' : 'rejected'
      
      const { error } = await supabase
        .from('borrowers')
        .update({ 
          kyc_status: status,
          kyc_verified_at: action === 'approve' ? new Date().toISOString() : null
        })
        .eq('id', borrowerId)

      if (!error) {
        await loadPendingKYC()
        await loadStatistics()
        setShowKYCDialog(false)
      }
    } catch (error) {
      console.error('Error updating KYC status:', error)
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-600 bg-red-100'
      case 'medium': return 'text-yellow-600 bg-yellow-100'
      case 'low': return 'text-blue-600 bg-blue-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const formatCurrency = (amountMinor: number, countryCode?: string) => {
    // For admin viewing all countries, use country-specific currency if provided
    if (countryCode) {
      const currency = getCurrencyByCountry(countryCode)
      if (currency) {
        const majorAmount = fromMinorUnits(amountMinor, currency.minorUnits)
        const formatted = majorAmount.toLocaleString('en-US', {
          minimumFractionDigits: 0,
          maximumFractionDigits: currency.minorUnits,
        })
        return `${currency.symbol}${formatted}`
      }
    }

    // Fallback to USD if no country code provided (shouldn't happen in production)
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amountMinor / 100)
  }

  // Real data will be generated from actual database records when implemented
  const generateUserGrowthData = () => {
    return []
  }

  const generateRiskDistribution = (): { name: string; value: number; color: string }[] => []

  const generateLoanMetrics = () => {
    return []
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground font-medium">Loading admin dashboard...</p>
        </div>
      </div>
    )
  }

  const userGrowthData = generateUserGrowthData()
  const riskDistributionData = generateRiskDistribution()
  const loanMetricsData = generateLoanMetrics()

  return (
    <div className="p-6 space-y-6">
      {/* Modern Tech Header */}
      <div className="tech-header p-8 rounded-2xl shadow-lg">
        <div className="flex justify-between items-start">
          <div className="relative z-10">
            <h1 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">Admin Dashboard</h1>
            <p className="text-white/90 text-lg font-medium drop-shadow">
              {adminProfile?.full_name || 'Administrator'} • Platform Control • {format(new Date(), 'MMMM dd, yyyy')}
            </p>
          </div>
          <div className="flex space-x-2 relative z-10">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-32 bg-white/90 backdrop-blur-sm border-white/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="7days">7 Days</SelectItem>
                <SelectItem value="30days">30 Days</SelectItem>
                <SelectItem value="90days">90 Days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="bg-white/90 backdrop-blur-sm border-white/50 hover:bg-white">
              <Download className="mr-2 h-4 w-4" />
              Export Report
            </Button>
            <Button variant="outline" className="bg-white/90 backdrop-blur-sm border-white/50 hover:bg-white">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Critical Alerts */}
      {riskAlerts.filter(a => a.severity === 'high').length > 0 && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-900">Critical Risk Alerts</AlertTitle>
          <AlertDescription>
            <div className="mt-2 space-y-2">
              {riskAlerts
                .filter(a => a.severity === 'high')
                .map(alert => (
                  <div key={alert.id} className="flex justify-between items-center">
                    <span>{alert.message}</span>
                    <Button size="sm" variant="destructive">
                      Investigate
                    </Button>
                  </div>
                ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Platform Overview */}
      {stats && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="tech-card hover-lift border-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Total Users</CardTitle>
                <div className="p-2.5 bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl">
                  <Users className="h-5 w-5 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <span className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">{stats.totalUsers}</span>
                <div className="mt-1.5 text-sm text-muted-foreground font-medium">
                  Platform accounts
                </div>
              </CardContent>
            </Card>

            <Card className="tech-card hover-lift border-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Total Loans</CardTitle>
                <div className="p-2.5 bg-gradient-to-br from-blue-500/10 to-blue-500/5 rounded-xl">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
              </CardHeader>
              <CardContent>
                <span className="text-3xl font-bold text-blue-600">{stats.totalLoans}</span>
                <div className="mt-1.5 text-sm text-muted-foreground font-medium">
                  {stats.activeLoans} active • {stats.completedLoans} completed • {stats.cancelledLoans} cancelled
                </div>
              </CardContent>
            </Card>

            <Card className="tech-card hover-lift border-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Loan Volume</CardTitle>
                <div className="p-2.5 bg-gradient-to-br from-accent/10 to-accent/5 rounded-xl">
                  <DollarSign className="h-5 w-5 text-accent" />
                </div>
              </CardHeader>
              <CardContent>
                <span className="text-3xl font-bold text-accent">{stats.totalLoans} loans</span>
                <div className="mt-1.5 text-sm text-muted-foreground font-medium">
                  {stats.avgAPR}% avg APR •{' '}
                  <button
                    onClick={() => document.getElementById('country-dashboard')?.scrollIntoView({ behavior: 'smooth' })}
                    className="text-primary hover:underline cursor-pointer"
                  >
                    View by country ↓
                  </button>
                </div>
              </CardContent>
            </Card>

            <Card className="tech-card hover-lift border-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Default Rate</CardTitle>
                <div className="p-2.5 bg-gradient-to-br from-red-500/10 to-red-500/5 rounded-xl">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
              </CardHeader>
              <CardContent>
                <span className="text-3xl font-bold text-red-600">{stats.defaultRate.toFixed(1)}%</span>
                <div className="mt-1.5 text-sm text-muted-foreground font-medium">
                  {stats.defaultedLoans} defaulted loans
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Borrower Metrics */}
          <Card className="tech-card border-none">
            <CardHeader>
              <CardTitle className="text-lg">Borrower Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl">
                  <div className="text-sm text-gray-600 mb-1">Total Borrowers</div>
                  <div className="text-2xl font-bold text-blue-600">{stats.totalBorrowers}</div>
                </div>
                <div className="p-4 bg-gradient-to-br from-green-50 to-green-100/50 rounded-xl">
                  <div className="text-sm text-gray-600 mb-1">With Accounts</div>
                  <div className="text-2xl font-bold text-green-600">{stats.borrowersWithAccounts}</div>
                </div>
                <div className="p-4 bg-gradient-to-br from-orange-50 to-orange-100/50 rounded-xl">
                  <div className="text-sm text-gray-600 mb-1">Lender-Created</div>
                  <div className="text-2xl font-bold text-orange-600">{stats.borrowersWithoutAccounts}</div>
                </div>
                <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-xl">
                  <div className="text-sm text-gray-600 mb-1">Avg Credit Score</div>
                  <div className="text-2xl font-bold text-purple-600">{stats.avgCreditScore}</div>
                </div>
                <div className="p-4 bg-gradient-to-br from-indigo-50 to-indigo-100/50 rounded-xl">
                  <div className="text-sm text-gray-600 mb-1">With Active Loans</div>
                  <div className="text-2xl font-bold text-indigo-600">{stats.borrowersWithActiveLoans}</div>
                </div>
                <div className="p-4 bg-gradient-to-br from-red-50 to-red-100/50 rounded-xl">
                  <div className="text-sm text-gray-600 mb-1">Open Risk Flags</div>
                  <div className="text-2xl font-bold text-red-600">{stats.openRiskFlags}</div>
                </div>
                <div className="p-4 bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl">
                  <div className="text-sm text-gray-600 mb-1">Payment Defaults</div>
                  <div className="text-2xl font-bold text-gray-600">{stats.riskFlagsCount.payment_default}</div>
                </div>
                <div className="p-4 bg-gradient-to-br from-yellow-50 to-yellow-100/50 rounded-xl">
                  <div className="text-sm text-gray-600 mb-1">Fraud Suspected</div>
                  <div className="text-2xl font-bold text-yellow-600">{stats.riskFlagsCount.fraud_suspected}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Suspicious Activity Metrics */}
          <Card className="tech-card border-none border-red-200 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-red-50 to-orange-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ShieldAlert className="h-5 w-5 text-red-600" />
                  <CardTitle className="text-lg text-red-900">Suspicious Activity</CardTitle>
                </div>
                <Badge variant="destructive" className="bg-red-600">
                  {(stats.fraudSignalsCount || 0) + (stats.flaggedMessagesCount || 0) + (stats.activeDisputesCount || 0)} Active
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 bg-gradient-to-br from-red-50 to-red-100/50 rounded-xl border-2 border-red-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm text-gray-600">Fraud Signals</div>
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                  </div>
                  <div className="text-2xl font-bold text-red-600">{stats.fraudSignalsCount || 0}</div>
                  <div className="text-xs text-red-500 mt-1">High severity (70+ score)</div>
                </div>
                <div className="p-4 bg-gradient-to-br from-orange-50 to-orange-100/50 rounded-xl border-2 border-orange-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm text-gray-600">Critical Fraud</div>
                    <ShieldAlert className="h-4 w-4 text-orange-600" />
                  </div>
                  <div className="text-2xl font-bold text-orange-600">{stats.criticalFraudCount || 0}</div>
                  <div className="text-xs text-orange-500 mt-1">Critical severity (90+ score)</div>
                </div>
                <div className="p-4 bg-gradient-to-br from-yellow-50 to-yellow-100/50 rounded-xl border-2 border-yellow-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm text-gray-600">Flagged Messages</div>
                    <MessageSquare className="h-4 w-4 text-yellow-600" />
                  </div>
                  <div className="text-2xl font-bold text-yellow-600">{stats.flaggedMessagesCount || 0}</div>
                  <div className="text-xs text-yellow-500 mt-1">Suspicious keywords detected</div>
                </div>
                <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-xl border-2 border-purple-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm text-gray-600">Active Disputes</div>
                    <Scale className="h-4 w-4 text-purple-600" />
                  </div>
                  <div className="text-2xl font-bold text-purple-600">{stats.activeDisputesCount || 0}</div>
                  <div className="text-xs text-purple-500 mt-1">Pending resolution</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lender Metrics */}
          <Card className="tech-card border-none">
            <CardHeader>
              <CardTitle className="text-lg">Lender Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl">
                  <div className="text-sm text-gray-600 mb-1">Total Lenders</div>
                  <div className="text-2xl font-bold text-blue-600">{stats.totalLenders}</div>
                </div>
                <div className="p-4 bg-gradient-to-br from-green-50 to-green-100/50 rounded-xl">
                  <div className="text-sm text-gray-600 mb-1">Verified</div>
                  <div className="text-2xl font-bold text-green-600">{stats.verifiedLenders}</div>
                </div>
                <div className="p-4 bg-gradient-to-br from-yellow-50 to-yellow-100/50 rounded-xl">
                  <div className="text-sm text-gray-600 mb-1">Pending</div>
                  <div className="text-2xl font-bold text-yellow-600">{stats.pendingLenders}</div>
                </div>
                <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-xl">
                  <div className="text-sm text-gray-600 mb-1">Avg On-Time Rate</div>
                  <div className="text-2xl font-bold text-purple-600">{stats.avgOnTimeRate}%</div>
                </div>
                <div className="p-4 bg-gradient-to-br from-indigo-50 to-indigo-100/50 rounded-xl">
                  <div className="text-sm text-gray-600 mb-1">Loans Originated</div>
                  <div className="text-2xl font-bold text-indigo-600">{stats.totalLoansOriginated}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Health Analytics - NEW */}
          <Card className="tech-card border-none">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">System-Wide Payment Health</CardTitle>
              </div>
              <CardDescription>
                Permanent payment history across all borrowers - used for automatic risk flagging
              </CardDescription>
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
                        data={[{
                          name: 'System Health',
                          value: stats.systemOnTimeRate,
                          fill: stats.systemPaymentHealthScore >= 80 ? '#22c55e' :
                                stats.systemPaymentHealthScore >= 60 ? '#eab308' : '#ef4444',
                        }]}
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
                        {stats.systemOnTimeRate}%
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">On-Time Rate</div>
                      <div className="mt-3 flex items-center gap-1">
                        <Award className={`h-5 w-5 ${
                          stats.systemPaymentHealthScore >= 80 ? 'text-green-600' :
                          stats.systemPaymentHealthScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                        }`} />
                        <span className={`text-sm font-semibold ${
                          stats.systemPaymentHealthScore >= 80 ? 'text-green-600' :
                          stats.systemPaymentHealthScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {stats.systemPaymentHealthScore}% Health
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Payment Statistics */}
                <div className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-200">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        <span className="text-sm font-medium">On-Time Payments</span>
                      </div>
                      <span className="text-xl font-bold text-green-600">{stats.totalOnTimePayments}</span>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                      <div className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-yellow-600" />
                        <span className="text-sm font-medium">Late Payments</span>
                      </div>
                      <span className="text-xl font-bold text-yellow-600">{stats.totalLatePayments}</span>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-200">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                        <span className="text-sm font-medium">Overdue Payments</span>
                      </div>
                      <span className="text-xl font-bold text-red-600">{stats.totalOverduePayments}</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t mt-4">
                    <h4 className="text-sm font-semibold mb-3">Borrower Distribution</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full bg-green-500" />
                          <span className="text-sm">Excellent (80%+)</span>
                        </div>
                        <span className="font-semibold">{stats.excellentBorrowers}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full bg-yellow-500" />
                          <span className="text-sm">Good (60-79%)</span>
                        </div>
                        <span className="font-semibold">{stats.goodBorrowers}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full bg-red-500" />
                          <span className="text-sm">Poor (&lt;60%)</span>
                        </div>
                        <span className="font-semibold">{stats.poorBorrowers}</span>
                      </div>
                    </div>
                  </div>

                  <Alert className="bg-blue-50 border-blue-200 mt-4">
                    <Shield className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-xs text-blue-900">
                      <strong>Permanent Record:</strong> Payment history is never deleted and automatically triggers risk flags for poor performance.
                    </AlertDescription>
                  </Alert>

                  {stats.systemPaymentHealthScore >= 80 && (
                    <Alert className="bg-green-50 border-green-200">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-xs text-green-900">
                        Excellent system health! Most borrowers are paying on time.
                      </AlertDescription>
                    </Alert>
                  )}

                  {stats.systemPaymentHealthScore < 60 && (
                    <Alert className="bg-red-50 border-red-200">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <AlertDescription className="text-xs text-red-900">
                        System payment health needs attention. Review high-risk borrowers.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Metrics */}
          <Card className="tech-card border-none">
            <CardHeader>
              <CardTitle className="text-lg">Payment Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-gradient-to-br from-green-50 to-green-100/50 rounded-xl">
                  <div className="text-sm text-gray-600 mb-1">Total Repayments</div>
                  <div className="text-2xl font-bold text-green-600">{stats.totalRepayments}</div>
                </div>
                <div className="p-4 bg-gradient-to-br from-red-50 to-red-100/50 rounded-xl">
                  <div className="text-sm text-gray-600 mb-1">Overdue Payments</div>
                  <div className="text-2xl font-bold text-red-600">{stats.overduePayments}</div>
                </div>
                <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl">
                  <div className="text-sm text-gray-600 mb-1">Payment Success Rate</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {stats.totalRepayments > 0 ? ((stats.totalRepayments - stats.overduePayments) / stats.totalRepayments * 100).toFixed(1) : 0}%
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Country Dashboard */}
          <Card id="country-dashboard" className="tech-card border-none">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Country Dashboard</CardTitle>
                  <CardDescription>Platform metrics across all 12 African countries</CardDescription>
                </div>
                <div className="p-2.5 bg-gradient-to-br from-green-500/10 to-green-500/5 rounded-xl">
                  <MapPin className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {countryStats.length === 0 ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
                  <p className="text-sm text-muted-foreground">Loading country data...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {countryStats.map((country) => (
                    <div key={country.code} className="p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-xl border border-slate-200 hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="text-lg font-bold text-slate-900">{country.name}</div>
                          <div className="text-xs text-slate-500">{country.code} • {country.phonePrefix}</div>
                        </div>
                        {country.totalUsers > 0 && (
                          <div className="p-1.5 bg-green-100 rounded-full">
                            <CheckCircle className="h-3 w-3 text-green-600" />
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-600 flex items-center">
                            <Users className="h-3 w-3 mr-1" />
                            Users
                          </span>
                          <span className="text-sm font-semibold text-slate-900">{country.totalUsers}</span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-600 flex items-center">
                            <UserCheck className="h-3 w-3 mr-1" />
                            Borrowers
                          </span>
                          <span className="text-sm font-semibold text-blue-600">{country.totalBorrowers}</span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-600 flex items-center">
                            <Building2 className="h-3 w-3 mr-1" />
                            Lenders
                          </span>
                          <span className="text-sm font-semibold text-purple-600">{country.totalLenders}</span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-600 flex items-center">
                            <FileText className="h-3 w-3 mr-1" />
                            Loans
                          </span>
                          <span className="text-sm font-semibold text-green-600">
                            {country.totalLoans} {country.activeLoans > 0 && `(${country.activeLoans} active)`}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-600 flex items-center">
                            <DollarSign className="h-3 w-3 mr-1" />
                            Volume
                          </span>
                          <span className="text-sm font-semibold text-amber-600">
                            {formatCurrency(country.totalLoanVolume, country.code)}
                          </span>
                        </div>

                        {country.openRiskFlags > 0 && (
                          <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                            <span className="text-xs text-red-600 flex items-center">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Risk Flags
                            </span>
                            <span className="text-sm font-semibold text-red-600">{country.openRiskFlags}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Tabs defaultValue="kyc" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="kyc">KYC Management</TabsTrigger>
          <TabsTrigger value="risk">Risk Assessment</TabsTrigger>
          <TabsTrigger value="users">User Management</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* KYC Management Tab */}
        <TabsContent value="kyc" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Borrowers Pending Account Creation</CardTitle>
                  <CardDescription>
                    Borrowers created by lenders who haven't created user accounts yet
                  </CardDescription>
                </div>
                <Button variant="outline">
                  <Filter className="mr-2 h-4 w-4" />
                  Filter
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {pendingKYC.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-gray-600">All borrowers have created accounts</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Borrower</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingKYC.map((borrower) => (
                      <TableRow key={borrower.id}>
                        <TableCell>
                          <div className="flex items-center space-x-3">
                            <Avatar>
                              <AvatarFallback>
                                {borrower.full_name?.charAt(0) || 'B'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{borrower.full_name}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{borrower.phone_e164}</TableCell>
                        <TableCell>
                          {format(new Date(borrower.created_at), 'MMM dd, yyyy')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">No Account</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Borrower Account Statistics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Borrower Account Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={[
                          { name: 'With Accounts', value: stats?.borrowersWithAccounts || 0, color: '#10b981' },
                          { name: 'Without Accounts', value: stats?.borrowersWithoutAccounts || 0, color: '#f59e0b' }
                        ]}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={(entry) => `${entry.name}: ${entry.value}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {[
                          { name: 'With Accounts', value: stats?.borrowersWithAccounts || 0, color: '#10b981' },
                          { name: 'Without Accounts', value: stats?.borrowersWithoutAccounts || 0, color: '#f59e0b' }
                        ].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Borrower Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">Total Borrowers</p>
                      <p className="text-sm text-gray-600">All borrowers in system</p>
                    </div>
                    <span className="text-2xl font-bold">{stats?.totalBorrowers || 0}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">With User Accounts</p>
                      <p className="text-sm text-gray-600">Borrowers who created accounts</p>
                    </div>
                    <span className="text-2xl font-bold text-green-600">{stats?.borrowersWithAccounts || 0}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">Lender-Created Only</p>
                      <p className="text-sm text-gray-600">No user account yet</p>
                    </div>
                    <span className="text-2xl font-bold text-yellow-600">{stats?.borrowersWithoutAccounts || 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Risk Assessment Tab */}
        <TabsContent value="risk" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Risk Monitoring Dashboard</CardTitle>
              <CardDescription>
                Real-time risk assessment and fraud detection
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Risk Alerts */}
              <div>
                <h3 className="font-semibold mb-4 flex items-center justify-between">
                  <span>Active Suspicious Activity Alerts</span>
                  <Badge variant="destructive">{riskAlerts.length} Total</Badge>
                </h3>
                {riskAlerts.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <ShieldCheck className="h-12 w-12 mx-auto mb-2 text-green-500" />
                    <p>No suspicious activity detected</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {riskAlerts.map((alert) => (
                      <div key={alert.id} className="flex items-center justify-between p-4 border rounded-lg hover:shadow-md transition-shadow">
                        <div className="flex items-center space-x-4">
                          <div className={`p-2 rounded-full ${getSeverityColor(alert.severity)}`}>
                            {alert.severity === 'critical' ? (
                              <ShieldAlert className="h-5 w-5 text-red-600" />
                            ) : alert.severity === 'high' ? (
                              <AlertTriangle className="h-5 w-5 text-orange-600" />
                            ) : alert.severity === 'medium' ? (
                              <ShieldOff className="h-5 w-5 text-yellow-600" />
                            ) : (
                              <Shield className="h-5 w-5 text-blue-600" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center space-x-2">
                              <p className="font-medium">{alert.title}</p>
                              <Badge variant="outline" className="text-xs">
                                {alert.type.replace(/_/g, ' ')}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-600 mt-1">{alert.description}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {format(new Date(alert.timestamp), 'MMM dd, yyyy h:mm a')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge className={getSeverityColor(alert.severity)}>
                            {alert.severity.toUpperCase()}
                          </Badge>
                          <Button size="sm" variant="outline">
                            <Eye className="h-3 w-3 mr-1" />
                            Review
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Risk Distribution */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Risk Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsPieChart>
                          <Pie
                            data={riskDistributionData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                            label
                          >
                            {riskDistributionData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </RechartsPieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Risk Metrics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Default Rate</span>
                        <div className="flex items-center space-x-2">
                          <Progress value={stats?.defaultRate || 0} className="w-24 h-2" />
                          <span className="text-sm font-medium">{stats?.defaultRate.toFixed(1)}%</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Active Loans</span>
                        <span className="text-sm font-medium">{stats?.activeLoans || 0}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Total Loans</span>
                        <span className="text-sm font-medium">{stats?.totalLoans || 0}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* User Management Tab */}
        <TabsContent value="users" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>
                Manage user accounts, permissions, and access control
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* User Growth Chart */}
                <div>
                  <h3 className="font-semibold mb-4">User Growth Trend</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={userGrowthData}>
                        <defs>
                          <linearGradient id="colorBorrowers" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
                          </linearGradient>
                          <linearGradient id="colorLenders" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Area 
                          type="monotone" 
                          dataKey="borrowers" 
                          stroke="#3b82f6" 
                          fill="url(#colorBorrowers)"
                          strokeWidth={2}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="lenders" 
                          stroke="#10b981" 
                          fill="url(#colorLenders)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* User Actions */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Account Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Button variant="outline" className="w-full justify-start">
                        <Lock className="mr-2 h-4 w-4" />
                        Lock Account
                      </Button>
                      <Button variant="outline" className="w-full justify-start">
                        <Unlock className="mr-2 h-4 w-4" />
                        Unlock Account
                      </Button>
                      <Button variant="outline" className="w-full justify-start">
                        <UserX className="mr-2 h-4 w-4" />
                        Suspend User
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Verification</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Button variant="outline" className="w-full justify-start">
                        <UserCheck className="mr-2 h-4 w-4" />
                        Verify Identity
                      </Button>
                      <Button variant="outline" className="w-full justify-start">
                        <Mail className="mr-2 h-4 w-4" />
                        Verify Email
                      </Button>
                      <Button variant="outline" className="w-full justify-start">
                        <Phone className="mr-2 h-4 w-4" />
                        Verify Phone
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Risk Management</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Button variant="outline" className="w-full justify-start">
                        <ShieldAlert className="mr-2 h-4 w-4" />
                        Flag High Risk
                      </Button>
                      <Button variant="outline" className="w-full justify-start">
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Clear Risk Flag
                      </Button>
                      <Button variant="outline" className="w-full justify-start">
                        <BadgeAlert className="mr-2 h-4 w-4" />
                        Report Fraud
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Compliance Tab */}
        <TabsContent value="compliance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Compliance & Regulatory</CardTitle>
              <CardDescription>
                Ensure platform compliance with financial regulations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Compliance Checklist */}
              <div>
                <h3 className="font-semibold mb-4">Compliance Checklist</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Checkbox checked />
                      <div>
                        <p className="font-medium">AML/KYC Procedures</p>
                        <p className="text-sm text-gray-600">Anti-money laundering checks active</p>
                      </div>
                    </div>
                    <Badge className="bg-green-100 text-green-800">Compliant</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Checkbox checked />
                      <div>
                        <p className="font-medium">Data Protection (GDPR)</p>
                        <p className="text-sm text-gray-600">User data encryption and privacy</p>
                      </div>
                    </div>
                    <Badge className="bg-green-100 text-green-800">Compliant</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Checkbox />
                      <div>
                        <p className="font-medium">Financial Reporting</p>
                        <p className="text-sm text-gray-600">Quarterly reports pending</p>
                      </div>
                    </div>
                    <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Checkbox checked />
                      <div>
                        <p className="font-medium">Interest Rate Compliance</p>
                        <p className="text-sm text-gray-600">Within regulatory limits</p>
                      </div>
                    </div>
                    <Badge className="bg-green-100 text-green-800">Compliant</Badge>
                  </div>
                </div>
              </div>

              {/* Audit Trail */}
              <div>
                <h3 className="font-semibold mb-4">Recent Audit Activities</h3>
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">Audit trail will be populated as admin actions are performed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Loan Performance Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={loanMetricsData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip />
                      <Legend />
                      <Bar yAxisId="left" dataKey="volume" fill="#3b82f6" name="Volume ($)" />
                      <Line yAxisId="right" type="monotone" dataKey="defaultRate" stroke="#ef4444" name="Default (%)" strokeWidth={2} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Platform Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center">
                  <div className="text-center space-y-6 w-full">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <span className="text-sm font-medium">Total Users</span>
                        <span className="text-lg font-bold">{stats?.totalUsers || 0}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <span className="text-sm font-medium">Total Borrowers</span>
                        <span className="text-lg font-bold">{stats?.totalBorrowers || 0}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <span className="text-sm font-medium">Total Lenders</span>
                        <span className="text-lg font-bold">{stats?.totalLenders || 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Platform Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-64">
                <div className="space-y-3">
                  {recentActivity.map((activity, index) => (
                    <div key={index} className="flex items-center space-x-4 p-2">
                      <div className="p-2 bg-gray-100 rounded-full">
                        <activity.icon className="h-4 w-4 text-gray-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm">{activity.description}</p>
                        <p className="text-xs text-gray-500">
                          {format(new Date(activity.timestamp), 'MMM dd, h:mm a')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* KYC Review Dialog */}
      <Dialog open={showKYCDialog} onOpenChange={setShowKYCDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>KYC Document Review</DialogTitle>
            <DialogDescription>
              Review submitted documents and verify user identity
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Full Name</Label>
                  <p className="font-medium">{selectedUser.profiles?.full_name}</p>
                </div>
                <div>
                  <Label>Email</Label>
                  <p className="font-medium">{selectedUser.profiles?.email}</p>
                </div>
                <div>
                  <Label>Phone</Label>
                  <p className="font-medium">{selectedUser.profiles?.phone || 'Not provided'}</p>
                </div>
                <div>
                  <Label>Registration Date</Label>
                  <p className="font-medium">
                    {format(new Date(selectedUser.created_at), 'MMM dd, yyyy')}
                  </p>
                </div>
              </div>

              <div>
                <Label>Submitted Documents</Label>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <FileText className="h-5 w-5 text-blue-500" />
                      <div>
                        <p className="font-medium">National ID</p>
                        <p className="text-sm text-gray-600">ID-2024-001.pdf</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline">
                      <Eye className="mr-1 h-3 w-3" />
                      View
                    </Button>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <FileText className="h-5 w-5 text-green-500" />
                      <div>
                        <p className="font-medium">Proof of Address</p>
                        <p className="text-sm text-gray-600">utility-bill.pdf</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline">
                      <Eye className="mr-1 h-3 w-3" />
                      View
                    </Button>
                  </div>
                </div>
              </div>

              <div>
                <Label>Verification Checklist</Label>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox />
                    <Label className="text-sm font-normal">Document authenticity verified</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox />
                    <Label className="text-sm font-normal">Name matches across documents</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox />
                    <Label className="text-sm font-normal">Address verification completed</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox />
                    <Label className="text-sm font-normal">No suspicious activity detected</Label>
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowKYCDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={() => handleKYCReview(selectedUser?.id, 'reject')}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Reject
            </Button>
            <Button 
              onClick={() => handleKYCReview(selectedUser?.id, 'approve')}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}