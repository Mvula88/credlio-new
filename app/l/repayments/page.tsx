'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DollarSign,
  Calendar,
  User,
  Users,
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Download,
  FileText,
  Loader2,
  CreditCard,
  BarChart3,
  Info,
  Zap,
  Target,
  Award,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  PieChart as PieChartIcon,
  CalendarDays,
  Banknote,
  Timer,
  Shield,
  Star
} from 'lucide-react'
import { format, differenceInDays, isPast, isToday, addDays, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar,
  ComposedChart,
  Scatter,
  ReferenceLine
} from 'recharts'
import { getCurrencyByCountry, formatCurrency as formatCurrencyUtil, type CurrencyInfo } from '@/lib/utils/currency'
import { toast } from 'sonner'

const COLORS = {
  paid: '#10b981',
  early: '#8b5cf6',
  onTime: '#3b82f6',
  late: '#f59e0b',
  overdue: '#ef4444',
  pending: '#6b7280',
  partial: '#06b6d4'
}

export default function RepaymentsPage() {
  const [repayments, setRepayments] = useState<any[]>([])
  const [schedules, setSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [recordingPayment, setRecordingPayment] = useState(false)
  const [selectedSchedule, setSelectedSchedule] = useState<any>(null)
  const [selectedBorrower, setSelectedBorrower] = useState<any>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [crossLenderHistory, setCrossLenderHistory] = useState<any[]>([])
  const [lenderCurrency, setLenderCurrency] = useState<CurrencyInfo | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [stats, setStats] = useState({
    totalCollected: 0,
    pendingAmount: 0,
    overdueAmount: 0,
    onTimeRate: 0,
    totalScheduled: 0,
    completedPayments: 0,
    earlyPayments: 0,
    latePayments: 0,
    averageDaysEarly: 0,
    averageDaysLate: 0,
  })
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadRepaymentsData()
  }, [])

  const loadRepaymentsData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/l/login')
        return
      }

      const { data: lender } = await supabase
        .from('lenders')
        .select('user_id')
        .eq('user_id', user.id)
        .single()

      if (!lender) {
        router.push('/l/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('country_code')
        .eq('user_id', user.id)
        .single()

      if (profile?.country_code) {
        const currency = getCurrencyByCountry(profile.country_code)
        if (currency) {
          setLenderCurrency(currency)
        }
      }

      // Get all repayment schedules for active loans
      const { data: schedulesData } = await supabase
        .from('repayment_schedules')
        .select(`
          *,
          loans!inner(
            id,
            lender_id,
            borrower_id,
            currency,
            status,
            principal_minor,
            interest_amount_minor,
            created_at,
            borrowers!inner(
              id,
              full_name,
              phone_e164,
              credit_score
            )
          )
        `)
        .eq('loans.lender_id', lender.user_id)
        .in('loans.status', ['active', 'completed'])
        .order('due_date', { ascending: true })

      // Get all repayment events
      const { data: repaymentsData } = await supabase
        .from('repayment_events')
        .select(`
          *,
          loans!inner(
            lender_id,
            borrower_id,
            currency,
            borrowers!inner(
              full_name,
              phone_e164
            )
          )
        `)
        .eq('loans.lender_id', lender.user_id)
        .order('created_at', { ascending: false })

      setSchedules(schedulesData || [])
      setRepayments(repaymentsData || [])

      // Calculate comprehensive stats
      const now = new Date()
      const paid = schedulesData?.filter((s: any) => s.status === 'paid') || []
      const pending = schedulesData?.filter((s: any) => s.status === 'pending' || s.status === 'partial') || []
      const overdue = pending.filter((s: any) => new Date(s.due_date) < now)
      const early = paid.filter((s: any) => s.is_early_payment)

      // Calculate late payments (paid after due date)
      const late = paid.filter((s: any) => {
        if (!s.paid_at) return false
        return new Date(s.paid_at) > new Date(s.due_date)
      })

      // Calculate average days early/late
      let totalDaysEarly = 0
      let totalDaysLate = 0

      early.forEach((s: any) => {
        if (s.paid_at) {
          const days = differenceInDays(new Date(s.due_date), new Date(s.paid_at))
          totalDaysEarly += Math.max(0, days)
        }
      })

      late.forEach((s: any) => {
        if (s.paid_at) {
          const days = differenceInDays(new Date(s.paid_at), new Date(s.due_date))
          totalDaysLate += Math.max(0, days)
        }
      })

      const totalCollected = schedulesData?.reduce((sum: number, s: any) => sum + (s.paid_amount_minor || 0), 0) || 0
      const pendingAmount = pending.reduce((sum: number, s: any) => sum + ((s.amount_due_minor || 0) - (s.paid_amount_minor || 0)), 0)
      const overdueAmount = overdue.reduce((sum: number, s: any) => sum + ((s.amount_due_minor || 0) - (s.paid_amount_minor || 0)), 0)

      setStats({
        totalCollected,
        pendingAmount,
        overdueAmount,
        onTimeRate: paid.length > 0 ? ((paid.length - late.length) / paid.length) * 100 : 0,
        totalScheduled: schedulesData?.length || 0,
        completedPayments: paid.length,
        earlyPayments: early.length,
        latePayments: late.length,
        averageDaysEarly: early.length > 0 ? Math.round(totalDaysEarly / early.length) : 0,
        averageDaysLate: late.length > 0 ? Math.round(totalDaysLate / late.length) : 0,
      })
    } catch (error) {
      console.error('Error loading repayments:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadCrossLenderHistory = async (borrowerId: string) => {
    try {
      const { data: history } = await supabase
        .from('repayment_events')
        .select(`
          *,
          loans!inner(
            lender_id,
            borrower_id,
            lenders!inner(business_name)
          )
        `)
        .eq('loans.borrower_id', borrowerId)
        .order('created_at', { ascending: true })

      setCrossLenderHistory(history || [])
    } catch (error) {
      console.error('Error loading cross-lender history:', error)
    }
  }

  const recordPayment = async () => {
    if (!selectedSchedule || !paymentAmount) return

    try {
      setRecordingPayment(true)
      const amount = parseFloat(paymentAmount)

      const { data: result, error: paymentError } = await supabase.rpc('process_repayment', {
        p_loan_id: selectedSchedule.loan_id,
        p_amount: amount,
      })

      if (paymentError) {
        console.error('Payment error:', paymentError)
        toast.error('Failed to process payment: ' + paymentError.message)
        return
      }

      if (result) {
        const msg = result.loan_completed
          ? `Loan fully repaid! ${result.overpayment > 0 ? `(Overpayment: ${formatCurrency(result.overpayment * 100)})` : ''}`
          : `Payment recorded! ${result.schedules_paid} installment(s) paid. Remaining: ${formatCurrency(result.remaining * 100)}`
        toast.success(msg)
      }

      await loadRepaymentsData()
      setSelectedSchedule(null)
      setPaymentAmount('')
      setPaymentMethod('cash')
    } catch (error) {
      console.error('Error recording payment:', error)
      toast.error('Failed to record payment')
    } finally {
      setRecordingPayment(false)
    }
  }

  const getStatusBadge = (status: string, isEarly?: boolean, daysInfo?: number) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-gray-100 text-gray-800"><Clock className="h-3 w-3 mr-1" />Pending</Badge>
      case 'paid':
        if (isEarly) {
          return (
            <Badge className="bg-purple-100 text-purple-800">
              <Zap className="h-3 w-3 mr-1" />Early {daysInfo ? `(${daysInfo}d)` : ''}
            </Badge>
          )
        }
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Paid</Badge>
      case 'partial':
        return <Badge className="bg-cyan-100 text-cyan-800"><Activity className="h-3 w-3 mr-1" />Partial</Badge>
      case 'overdue':
        return (
          <Badge variant="destructive">
            <AlertTriangle className="h-3 w-3 mr-1" />Overdue {daysInfo ? `(${daysInfo}d)` : ''}
          </Badge>
        )
      case 'late':
        return (
          <Badge className="bg-amber-100 text-amber-800">
            <Timer className="h-3 w-3 mr-1" />Late {daysInfo ? `(${daysInfo}d)` : ''}
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
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

  const isOverdue = (dueDate: string, status: string) => {
    return (status === 'pending' || status === 'partial') && new Date(dueDate) < new Date()
  }

  // Group schedules by borrower with comprehensive analytics
  const schedulesByBorrower = schedules.reduce((acc: any, schedule: any) => {
    const borrowerId = schedule.loans?.borrowers?.id
    if (!borrowerId) return acc

    if (!acc[borrowerId]) {
      acc[borrowerId] = {
        borrower: schedule.loans.borrowers,
        loan: schedule.loans,
        schedules: [],
        totalAmount: 0,
        paidAmount: 0,
        currency: schedule.loans.currency,
        earlyPayments: 0,
        latePayments: 0,
        onTimePayments: 0,
        overdueCount: 0,
        averageDaysEarlyLate: 0,
        paymentHealth: 100,
        streak: 0,
      }
    }

    acc[borrowerId].schedules.push(schedule)
    acc[borrowerId].totalAmount += (schedule.amount_due_minor || 0)
    acc[borrowerId].paidAmount += (schedule.paid_amount_minor || 0)

    // Track payment behavior
    if (schedule.status === 'paid') {
      if (schedule.is_early_payment) {
        acc[borrowerId].earlyPayments++
      } else if (schedule.paid_at && new Date(schedule.paid_at) > new Date(schedule.due_date)) {
        acc[borrowerId].latePayments++
      } else {
        acc[borrowerId].onTimePayments++
      }
    } else if (isOverdue(schedule.due_date, schedule.status)) {
      acc[borrowerId].overdueCount++
    }

    return acc
  }, {})

  // Calculate payment health for each borrower
  Object.values(schedulesByBorrower).forEach((data: any) => {
    const totalPaid = data.earlyPayments + data.latePayments + data.onTimePayments
    if (totalPaid > 0) {
      // Health = (early * 1.2 + onTime * 1.0 + late * 0.5) / total * 100, minus overdue penalty
      const score = ((data.earlyPayments * 1.2 + data.onTimePayments * 1.0 + data.latePayments * 0.5) / totalPaid) * 100
      data.paymentHealth = Math.max(0, Math.min(100, Math.round(score - (data.overdueCount * 15))))
    } else if (data.overdueCount > 0) {
      data.paymentHealth = Math.max(0, 100 - (data.overdueCount * 20))
    }

    // Calculate streak (consecutive on-time or early payments)
    let streak = 0
    const sortedSchedules = [...data.schedules].sort((a, b) =>
      new Date(b.due_date).getTime() - new Date(a.due_date).getTime()
    )
    for (const s of sortedSchedules) {
      if (s.status === 'paid' && (s.is_early_payment || (s.paid_at && new Date(s.paid_at) <= new Date(s.due_date)))) {
        streak++
      } else {
        break
      }
    }
    data.streak = streak
  })

  const filteredBorrowers = Object.values(schedulesByBorrower).filter((borrowerData: any) => {
    if (!searchQuery.trim()) return true
    return borrowerData.borrower.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
           borrowerData.borrower.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  })

  // Prepare chart data
  const paymentBehaviorData = [
    { name: 'Early', value: stats.earlyPayments, color: COLORS.early },
    { name: 'On-Time', value: stats.completedPayments - stats.earlyPayments - stats.latePayments, color: COLORS.onTime },
    { name: 'Late', value: stats.latePayments, color: COLORS.late },
    { name: 'Overdue', value: schedules.filter(s => isOverdue(s.due_date, s.status)).length, color: COLORS.overdue },
    { name: 'Pending', value: schedules.filter(s => s.status === 'pending' && !isOverdue(s.due_date, s.status)).length, color: COLORS.pending },
  ].filter(item => item.value > 0)

  // Payment timeline - last 30 days
  const paymentTimelineData = schedules
    .filter(s => s.status === 'paid' && s.paid_at)
    .slice(0, 20)
    .map(s => {
      const dueDate = new Date(s.due_date)
      const paidDate = new Date(s.paid_at)
      const daysDiff = differenceInDays(dueDate, paidDate)
      return {
        date: format(paidDate, 'MMM dd'),
        amount: (s.paid_amount_minor || 0) / 100,
        daysDiff,
        status: daysDiff > 0 ? 'early' : daysDiff < 0 ? 'late' : 'onTime',
        borrower: s.loans?.borrowers?.full_name?.split(' ')[0] || 'Unknown'
      }
    })
    .reverse()

  // Monthly collection trend
  const monthlyData = schedules.reduce((acc: any[], s) => {
    if (s.status !== 'paid' || !s.paid_at) return acc
    const month = format(new Date(s.paid_at), 'MMM yyyy')
    const existing = acc.find(a => a.month === month)
    if (existing) {
      existing.collected += (s.paid_amount_minor || 0) / 100
      existing.count++
    } else {
      acc.push({ month, collected: (s.paid_amount_minor || 0) / 100, count: 1 })
    }
    return acc
  }, []).slice(-6)

  // Borrower health distribution
  const healthDistribution = [
    { range: 'Excellent (80-100)', count: Object.values(schedulesByBorrower).filter((b: any) => b.paymentHealth >= 80).length, color: '#10b981' },
    { range: 'Good (60-79)', count: Object.values(schedulesByBorrower).filter((b: any) => b.paymentHealth >= 60 && b.paymentHealth < 80).length, color: '#3b82f6' },
    { range: 'Fair (40-59)', count: Object.values(schedulesByBorrower).filter((b: any) => b.paymentHealth >= 40 && b.paymentHealth < 60).length, color: '#f59e0b' },
    { range: 'Poor (0-39)', count: Object.values(schedulesByBorrower).filter((b: any) => b.paymentHealth < 40).length, color: '#ef4444' },
  ].filter(item => item.count > 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="tech-header p-8 rounded-2xl shadow-lg">
        <h1 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">Repayment Analytics</h1>
        <p className="text-white/90 text-lg font-medium drop-shadow">
          Comprehensive payment tracking, behavior analysis & visual insights • {format(new Date(), 'MMMM dd, yyyy')}
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="tech-card hover-lift border-none">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase">Collected</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(stats.totalCollected)}</p>
              </div>
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase">Pending</p>
                <p className="text-2xl font-bold text-amber-600">{formatCurrency(stats.pendingAmount)}</p>
              </div>
              <div className="p-2 bg-amber-100 rounded-lg">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase">Overdue</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(stats.overdueAmount)}</p>
              </div>
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase">On-Time Rate</p>
                <p className="text-2xl font-bold text-blue-600">{stats.onTimeRate.toFixed(1)}%</p>
              </div>
              <div className="p-2 bg-blue-100 rounded-lg">
                <Target className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase">Early Payments</p>
                <p className="text-2xl font-bold text-purple-600">{stats.earlyPayments}</p>
                {stats.averageDaysEarly > 0 && (
                  <p className="text-xs text-purple-500">~{stats.averageDaysEarly}d early</p>
                )}
              </div>
              <div className="p-2 bg-purple-100 rounded-lg">
                <Zap className="h-5 w-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase">Late Payments</p>
                <p className="text-2xl font-bold text-orange-600">{stats.latePayments}</p>
                {stats.averageDaysLate > 0 && (
                  <p className="text-xs text-orange-500">~{stats.averageDaysLate}d late</p>
                )}
              </div>
              <div className="p-2 bg-orange-100 rounded-lg">
                <Timer className="h-5 w-5 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Payment Behavior Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-primary" />
              Payment Behavior
            </CardTitle>
            <CardDescription>Distribution of payment statuses</CardDescription>
          </CardHeader>
          <CardContent>
            {paymentBehaviorData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={paymentBehaviorData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {paymentBehaviorData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [value, 'Payments']}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                No payment data yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Timeline */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Payment Timeline
            </CardTitle>
            <CardDescription>Recent payments with early/late indicators</CardDescription>
          </CardHeader>
          <CardContent>
            {paymentTimelineData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <ComposedChart data={paymentTimelineData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload
                        return (
                          <div className="bg-white p-3 border rounded-lg shadow-lg">
                            <p className="font-semibold">{data.borrower}</p>
                            <p className="text-sm">Amount: {formatCurrency(data.amount * 100)}</p>
                            <p className={`text-sm ${data.daysDiff > 0 ? 'text-purple-600' : data.daysDiff < 0 ? 'text-amber-600' : 'text-green-600'}`}>
                              {data.daysDiff > 0 ? `${data.daysDiff} days early` : data.daysDiff < 0 ? `${Math.abs(data.daysDiff)} days late` : 'On time'}
                            </p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <ReferenceLine yAxisId="right" y={0} stroke="#666" strokeDasharray="3 3" />
                  <Bar yAxisId="left" dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Amount" />
                  <Line yAxisId="right" type="monotone" dataKey="daysDiff" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: '#8b5cf6' }} name="Days Early/Late" />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                No payment timeline data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Secondary Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Collection Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Monthly Collections
            </CardTitle>
            <CardDescription>Collection trend over time</CardDescription>
          </CardHeader>
          <CardContent>
            {monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => [formatCurrency(value * 100), 'Collected']} />
                  <Area type="monotone" dataKey="collected" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                No monthly data yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Borrower Health Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Borrower Payment Health
            </CardTitle>
            <CardDescription>Distribution of borrower payment reliability</CardDescription>
          </CardHeader>
          <CardContent>
            {healthDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={healthDistribution} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="range" type="category" width={100} />
                  <Tooltip />
                  <Bar dataKey="count" name="Borrowers">
                    {healthDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                No borrower data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Individual Borrower Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Individual Repayment Progress
          </CardTitle>
          <CardDescription>
            Detailed payment tracking for each borrower with behavior analytics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="mb-4 bg-blue-50 border-blue-200">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-900">
              <strong>Payment Health Score:</strong> Based on early payments (+20%), on-time payments (base), late payments (-50%), and overdue penalties (-15% each).
            </AlertDescription>
          </Alert>

          {/* Search */}
          {Object.values(schedulesByBorrower).length > 0 && (
            <div className="mb-4">
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Search by name or borrower ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          )}

          {Object.values(schedulesByBorrower).length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No active repayment schedules</p>
            </div>
          ) : filteredBorrowers.length === 0 ? (
            <div className="text-center py-12">
              <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No borrowers match your search</p>
            </div>
          ) : (
            <div className="space-y-6">
              {(filteredBorrowers as any[]).map((borrowerData: any) => {
                const progress = borrowerData.totalAmount > 0
                  ? (borrowerData.paidAmount / borrowerData.totalAmount) * 100
                  : 0
                const healthColor = borrowerData.paymentHealth >= 80 ? 'text-green-600' :
                                   borrowerData.paymentHealth >= 60 ? 'text-blue-600' :
                                   borrowerData.paymentHealth >= 40 ? 'text-amber-600' : 'text-red-600'
                const healthBg = borrowerData.paymentHealth >= 80 ? 'bg-green-100' :
                                borrowerData.paymentHealth >= 60 ? 'bg-blue-100' :
                                borrowerData.paymentHealth >= 40 ? 'bg-amber-100' : 'bg-red-100'

                return (
                  <div key={borrowerData.borrower.id} className="border-2 rounded-xl p-5 space-y-4 hover:shadow-md transition-shadow">
                    {/* Borrower Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`h-12 w-12 rounded-full ${healthBg} flex items-center justify-center`}>
                          <span className={`text-lg font-bold ${healthColor}`}>
                            {borrowerData.paymentHealth}
                          </span>
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg">{borrowerData.borrower.full_name}</h3>
                          <p className="text-sm text-muted-foreground">{borrowerData.borrower.phone_e164}</p>
                          {borrowerData.streak > 0 && (
                            <div className="flex items-center gap-1 mt-1">
                              <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                              <span className="text-xs text-amber-600 font-medium">{borrowerData.streak} payment streak!</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedBorrower(borrowerData.borrower)
                            loadCrossLenderHistory(borrowerData.borrower.id)
                          }}
                        >
                          <BarChart3 className="h-4 w-4 mr-2" />
                          Full History
                        </Button>
                      </div>
                    </div>

                    {/* Payment Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-muted-foreground">Progress</p>
                        <p className="text-lg font-bold">{progress.toFixed(1)}%</p>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Zap className="h-4 w-4 text-purple-600" />
                          <p className="text-xs text-purple-600">Early</p>
                        </div>
                        <p className="text-lg font-bold text-purple-700">{borrowerData.earlyPayments}</p>
                      </div>
                      <div className="bg-green-50 rounded-lg p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <p className="text-xs text-green-600">On-Time</p>
                        </div>
                        <p className="text-lg font-bold text-green-700">{borrowerData.onTimePayments}</p>
                      </div>
                      <div className="bg-amber-50 rounded-lg p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Timer className="h-4 w-4 text-amber-600" />
                          <p className="text-xs text-amber-600">Late</p>
                        </div>
                        <p className="text-lg font-bold text-amber-700">{borrowerData.latePayments}</p>
                      </div>
                      <div className="bg-red-50 rounded-lg p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                          <p className="text-xs text-red-600">Overdue</p>
                        </div>
                        <p className="text-lg font-bold text-red-700">{borrowerData.overdueCount}</p>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Repayment Progress</span>
                        <span className="font-semibold">
                          {formatCurrency(borrowerData.paidAmount)} / {formatCurrency(borrowerData.totalAmount)}
                        </span>
                      </div>
                      <div className="relative h-4 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${progress}%` }}
                        />
                        {/* Markers for each payment */}
                        <div className="absolute inset-0 flex items-center">
                          {borrowerData.schedules.map((s: any, i: number) => {
                            const position = ((i + 1) / borrowerData.schedules.length) * 100
                            return (
                              <div
                                key={s.id}
                                className={`absolute h-3 w-1 rounded-full transform -translate-x-1/2 ${
                                  s.status === 'paid'
                                    ? s.is_early_payment ? 'bg-purple-500' : 'bg-green-700'
                                    : isOverdue(s.due_date, s.status) ? 'bg-red-500' : 'bg-gray-400'
                                }`}
                                style={{ left: `${position}%` }}
                                title={`#${s.installment_no}: ${s.status}`}
                              />
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Individual Schedules */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {borrowerData.schedules.map((schedule: any) => {
                        const paidAmountMinor = schedule.paid_amount_minor || 0
                        const amountDueMinor = schedule.amount_due_minor || 0
                        const remainingMinor = amountDueMinor - paidAmountMinor
                        const partialProgress = amountDueMinor > 0 ? (paidAmountMinor / amountDueMinor) * 100 : 0
                        const overdueStatus = isOverdue(schedule.due_date, schedule.status)
                        const overdueDays = overdueStatus ? differenceInDays(new Date(), new Date(schedule.due_date)) : 0

                        let earlyDays = 0
                        let lateDays = 0
                        if (schedule.status === 'paid' && schedule.paid_at) {
                          const diff = differenceInDays(new Date(schedule.due_date), new Date(schedule.paid_at))
                          if (diff > 0) earlyDays = diff
                          if (diff < 0) lateDays = Math.abs(diff)
                        }

                        const cardBg = overdueStatus ? 'border-red-300 bg-red-50' :
                                       schedule.status === 'paid' && schedule.is_early_payment ? 'border-purple-300 bg-purple-50' :
                                       schedule.status === 'paid' ? 'border-green-300 bg-green-50' :
                                       schedule.status === 'partial' ? 'border-cyan-300 bg-cyan-50' :
                                       'border-gray-200 bg-gray-50'

                        return (
                          <div key={schedule.id} className={`p-3 rounded-lg border-2 ${cardBg}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-muted-foreground">
                                #{schedule.installment_no}
                              </span>
                              {getStatusBadge(
                                overdueStatus ? 'overdue' :
                                lateDays > 0 ? 'late' : schedule.status,
                                schedule.is_early_payment,
                                earlyDays || overdueDays || lateDays || undefined
                              )}
                            </div>

                            <div className="flex items-baseline justify-between mb-1">
                              <span className="text-lg font-bold">{formatCurrency(amountDueMinor)}</span>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(schedule.due_date), 'MMM dd')}
                              </span>
                            </div>

                            {/* Progress for partial payments */}
                            {(schedule.status === 'partial' || paidAmountMinor > 0) && schedule.status !== 'paid' && (
                              <div className="mt-2 space-y-1">
                                <Progress value={partialProgress} className="h-2" />
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>Paid: {formatCurrency(paidAmountMinor)}</span>
                                  <span>Left: {formatCurrency(remainingMinor)}</span>
                                </div>
                              </div>
                            )}

                            {/* Paid info */}
                            {schedule.status === 'paid' && schedule.paid_at && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Paid: {format(new Date(schedule.paid_at), 'MMM dd, yyyy')}
                              </p>
                            )}

                            {/* Action button */}
                            {(schedule.status === 'pending' || schedule.status === 'partial') && (
                              <Button
                                size="sm"
                                className={`w-full mt-2 ${overdueStatus ? 'bg-red-600 hover:bg-red-700' : ''}`}
                                variant={overdueStatus ? 'destructive' : 'default'}
                                onClick={() => {
                                  setSelectedSchedule(schedule)
                                  const remaining = (amountDueMinor - paidAmountMinor) / 100
                                  setPaymentAmount(remaining.toString())
                                }}
                              >
                                <Banknote className="h-4 w-4 mr-1" />
                                {schedule.status === 'partial' ? 'Pay Remaining' : 'Record Payment'}
                              </Button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Record Payment Dialog */}
      <Dialog open={!!selectedSchedule} onOpenChange={(open) => !open && setSelectedSchedule(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record a repayment for {selectedSchedule?.loans?.borrowers?.full_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedSchedule && new Date(selectedSchedule.due_date) > new Date() && (
              <Alert className="bg-purple-50 border-purple-200">
                <Zap className="h-4 w-4 text-purple-600" />
                <AlertDescription className="text-purple-900">
                  <strong>Early Payment!</strong> This installment isn't due until {format(new Date(selectedSchedule.due_date), 'MMMM dd, yyyy')}.
                  Early payments boost the borrower's credit score!
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs">Installment Amount</Label>
                <div className="text-xl font-bold">
                  {selectedSchedule && formatCurrency(selectedSchedule.amount_due_minor || 0)}
                </div>
              </div>
              {selectedSchedule?.paid_amount_minor > 0 && (
                <div>
                  <Label className="text-muted-foreground text-xs">Already Paid</Label>
                  <div className="text-xl font-bold text-green-600">
                    {formatCurrency(selectedSchedule.paid_amount_minor)}
                  </div>
                </div>
              )}
            </div>

            {selectedSchedule?.paid_amount_minor > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <Label className="text-blue-900 text-xs font-medium">Remaining Balance</Label>
                <div className="text-2xl font-bold text-blue-600">
                  {formatCurrency((selectedSchedule.amount_due_minor || 0) - (selectedSchedule.paid_amount_minor || 0))}
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="amount">Amount Received *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Enter any amount. Overpayments will be applied to future installments.
              </p>
            </div>

            <div>
              <Label htmlFor="method">Payment Method *</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="mobile_money">Mobile Money</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedSchedule(null)}>
              Cancel
            </Button>
            <Button onClick={recordPayment} disabled={recordingPayment || !paymentAmount}>
              {recordingPayment ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Recording...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Record Payment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cross-Lender History Dialog */}
      <Dialog open={!!selectedBorrower} onOpenChange={(open) => !open && setSelectedBorrower(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Complete Payment History: {selectedBorrower?.full_name}</DialogTitle>
            <DialogDescription>
              Payment history across all lenders for credit assessment
            </DialogDescription>
          </DialogHeader>

          <Alert className="bg-blue-50 border-blue-200">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-900">
              This shows payment history with <strong>all lenders</strong>, helping you assess overall reliability.
            </AlertDescription>
          </Alert>

          {crossLenderHistory.length > 0 ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Payment Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={crossLenderHistory.map(h => ({
                      date: format(new Date(h.created_at), 'MMM dd'),
                      amount: (h.amount_paid_minor || 0) / 100,
                      lender: h.loans?.lenders?.business_name || 'Unknown'
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Lender</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {crossLenderHistory.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>{format(new Date(payment.created_at), 'MMM dd, yyyy')}</TableCell>
                      <TableCell>{payment.loans?.lenders?.business_name || 'Unknown'}</TableCell>
                      <TableCell className="font-semibold">{formatCurrency(payment.amount_paid_minor || 0)}</TableCell>
                      <TableCell className="capitalize">{payment.method?.replace('_', ' ') || '-'}</TableCell>
                      <TableCell>{getStatusBadge('paid')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Loading payment history...</p>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setSelectedBorrower(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
