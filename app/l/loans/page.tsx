'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CreditCard,
  Plus,
  Calendar,
  DollarSign,
  User,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  TrendingUp,
  FileText,
  Loader2,
  BanknoteIcon
} from 'lucide-react'
import { format } from 'date-fns'
import { getCurrencyByCountry, formatCurrency as formatCurrencyUtil, type CurrencyInfo } from '@/lib/utils/currency'
import { toast } from 'sonner'
import {
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
  AreaChart,
  Area
} from 'recharts'

const COLORS = ['#10b981', '#3b82f6', '#ef4444', '#6366f1']

export default function LoansPage() {
  const [loans, setLoans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [lenderCurrency, setLenderCurrency] = useState<CurrencyInfo | null>(null)
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    completed: 0,
    defaulted: 0,
    totalDisbursed: 0,
    totalRepaid: 0,
    dueToday: 0,
    overdue: 0,
  })
  // Payment recording state
  const [selectedSchedule, setSelectedSchedule] = useState<any>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [recordingPayment, setRecordingPayment] = useState(false)

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadLoans()
  }, [])

  const loadLoans = async () => {
    try {
      // Get both user and session
      const { data: { user, session } } = await supabase.auth.getUser()
      if (!user) {
        console.error('No user found')
        router.push('/l/login')
        return
      }

      // Try to get lender with better error handling
      const { data: lender, error: lenderError } = await supabase
        .from('lenders')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (lenderError) {
        console.error('Error fetching lender:', lenderError)
      }

      if (!lender) {
        console.error('No lender record found for user:', user.id)
        alert('RLS Policy Issue: Cannot access lender record. Please refresh the page or log out and log back in.')
        setLoading(false)
        return
      }

      // Get lender's profile to get country code
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

      // Get all loans for this lender
      console.log('Fetching loans for lender_id:', lender.user_id)
      console.log('Current user id:', user.id)

      // First, get loans with just borrower info (simpler query)
      const { data: loanData, error } = await supabase
        .from('loans')
        .select(`
          *,
          borrowers(
            full_name,
            phone_e164,
            borrower_scores(score)
          )
        `)
        .eq('lender_id', lender.user_id)
        .order('created_at', { ascending: false })

      console.log('Loans query result:', { loanData, error })
      console.log('Number of loans found:', loanData?.length || 0)

      if (error) {
        console.error('Error loading loans:', error)
        console.error('Error details:', JSON.stringify(error, null, 2))
        toast.error('Failed to load loans. Please try refreshing the page.')
        setLoading(false)
        return
      }

      // Debug: Also fetch ALL loans without filter to see if any exist
      const { data: allLoans } = await supabase
        .from('loans')
        .select('id, lender_id, status, created_at')
      console.log('All accessible loans (without lender filter):', allLoans)

      // Now get repayment schedules with their events separately for each loan
      const loansWithSchedules = await Promise.all(
        (loanData || []).map(async (loan) => {
          const { data: schedules } = await supabase
            .from('repayment_schedules')
            .select('id, due_date, amount_due_minor, installment_no, principal_minor, interest_minor, status, paid_amount_minor, paid_at, is_early_payment, repayment_events(id, amount_paid_minor, paid_at)')
            .eq('loan_id', loan.id)
            .order('installment_no', { ascending: true })

          return {
            ...loan,
            repayment_schedules: schedules || []
          }
        })
      )

      setLoans(loansWithSchedules)

      // Helper to check if schedule is paid
      const checkSchedulePaid = (schedule: any) => {
        if (!schedule.repayment_events || schedule.repayment_events.length === 0) return false
        const totalPaid = schedule.repayment_events.reduce((sum: number, e: any) => sum + (e.amount_paid_minor || 0), 0)
        return totalPaid >= schedule.amount_due_minor
      }

      // Calculate due today and overdue counts
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      let dueToday = 0
      let overdue = 0

      loansWithSchedules.forEach(loan => {
        if (loan.status !== 'active') return
        loan.repayment_schedules?.forEach((schedule: any) => {
          if (checkSchedulePaid(schedule)) return
          const dueDate = new Date(schedule.due_date)
          dueDate.setHours(0, 0, 0, 0)

          if (dueDate.getTime() === today.getTime()) {
            dueToday++
          } else if (dueDate < today) {
            overdue++
          }
        })
      })

      // Calculate stats - convert from minor units to major units
      const statsData = {
        total: loanData?.length || 0,
        active: loanData?.filter(l => l.status === 'active').length || 0,
        completed: loanData?.filter(l => l.status === 'completed').length || 0,
        defaulted: loanData?.filter(l => l.status === 'defaulted').length || 0,
        totalDisbursed: loanData?.filter(l => ['active', 'completed', 'defaulted', 'written_off'].includes(l.status)).reduce((sum, l) => sum + (l.principal_minor || 0), 0) || 0,
        totalRepaid: 0, // This would need to be calculated from repayment_events
        dueToday,
        overdue,
      }
      setStats(statsData)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
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

  // Helper to check if a schedule is paid
  const isSchedulePaid = (schedule: any) => {
    // First check the status column if available
    if (schedule.status === 'paid') return true
    if (schedule.status === 'partial' || schedule.status === 'pending' || schedule.status === 'overdue') return false

    // Fallback to checking repayment events
    if (!schedule.repayment_events || schedule.repayment_events.length === 0) return false
    const totalPaid = schedule.repayment_events.reduce((sum: number, e: any) => sum + (e.amount_paid_minor || 0), 0)
    return totalPaid >= schedule.amount_due_minor
  }

  const calculateProgress = (loan: any) => {
    const schedules = loan.repayment_schedules || []
    if (schedules.length === 0) return 0

    // Use amount-based progress instead of schedule-count-based progress
    // This shows partial payment progress correctly
    const totalDue = schedules.reduce((sum: number, s: any) => sum + (s.amount_due_minor || 0), 0)
    const totalPaid = schedules.reduce((sum: number, s: any) => sum + (s.paid_amount_minor || 0), 0)

    return totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0
  }

  const getNextPayment = (loan: any) => {
    // Get the earliest unpaid schedule by due_date
    const schedules = loan.repayment_schedules || []
    if (schedules.length === 0) return null

    // Sort by installment_no and get the first unpaid one
    const sorted = [...schedules].sort((a, b) => a.installment_no - b.installment_no)
    const unpaid = sorted.find((s: any) => !isSchedulePaid(s))
    return unpaid || sorted[0]
  }

  // Check if a schedule is overdue
  const isOverdue = (dueDate: string, schedule: any) => {
    if (isSchedulePaid(schedule)) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const due = new Date(dueDate)
    due.setHours(0, 0, 0, 0)
    return due < today
  }

  // Check if a schedule is due today
  const isDueToday = (dueDate: string, schedule: any) => {
    if (isSchedulePaid(schedule)) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const due = new Date(dueDate)
    due.setHours(0, 0, 0, 0)
    return due.getTime() === today.getTime()
  }

  // Get loans with overdue payments
  const getOverdueLoans = () => {
    return loans.filter(loan => {
      if (loan.status !== 'active') return false
      return loan.repayment_schedules?.some((s: any) => isOverdue(s.due_date, s))
    })
  }

  // Get loans with payments due today
  const getDueTodayLoans = () => {
    return loans.filter(loan => {
      if (loan.status !== 'active') return false
      return loan.repayment_schedules?.some((s: any) => isDueToday(s.due_date, s))
    })
  }

  // Record payment function - uses improved process_repayment RPC
  const recordPayment = async () => {
    if (!selectedSchedule || !paymentAmount) return

    try {
      setRecordingPayment(true)
      const amount = parseFloat(paymentAmount) // Amount in major units (the RPC expects this)

      // Use the improved process_repayment function which:
      // - Automatically allocates payment to schedules (oldest first)
      // - Handles early payments, partial payments, and overpayments
      // - Updates loan total_repaid
      // - Sends notifications
      // - Marks loan as completed if fully paid
      // - Updates borrower credit score
      console.log('Calling process_repayment with:', {
        p_loan_id: selectedSchedule.loan_id,
        p_amount: amount,
      })

      const { data: result, error: paymentError } = await supabase.rpc('process_repayment', {
        p_loan_id: selectedSchedule.loan_id,
        p_amount: amount,
      })

      console.log('RPC result:', { result, paymentError })

      if (paymentError) {
        console.error('Payment error:', JSON.stringify(paymentError, null, 2))
        toast.error('Failed to record payment: ' + (paymentError.message || paymentError.details || paymentError.hint || 'Unknown error'))
        return
      }

      // Show success message with details
      if (result) {
        if (result.loan_completed) {
          toast.success(`Loan fully repaid! ${result.overpayment > 0 ? `(Overpayment: ${result.overpayment})` : ''}`)
        } else {
          toast.success(`Payment recorded! ${result.schedules_paid} installment(s) paid.`)
        }
      } else {
        toast.success('Payment recorded successfully')
      }

      // Reload data
      await loadLoans()

      // Close dialog
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

  // REMOVED: Export functionality - only admins can export data

  // Prepare data for charts
  const statusDistribution = [
    { name: 'Active', value: stats.active, color: '#10b981' },
    { name: 'Completed', value: stats.completed, color: '#3b82f6' },
    { name: 'Defaulted', value: stats.defaulted, color: '#ef4444' },
  ].filter(item => item.value > 0)

  // Loan disbursement over time (last 6 loans)
  const disbursementTrend = loans.slice(0, 6).reverse().map(loan => ({
    date: format(new Date(loan.created_at), 'MMM dd'),
    amount: (loan.principal_minor || 0) / 100,
    borrower: loan.borrowers?.full_name?.split(' ')[0] || 'Unknown'
  }))

  // Portfolio health metrics
  const portfolioHealth = loans.map(loan => {
    const progress = calculateProgress(loan)
    return {
      borrower: loan.borrowers?.full_name?.split(' ')[0] || 'Unknown',
      progress: progress,
      status: loan.status
    }
  }).slice(0, 10)

  // Calculate default rate by month
  const defaultRate = loans.length > 0
    ? ((stats.defaulted / stats.total) * 100).toFixed(1)
    : 0

  const completionRate = loans.length > 0
    ? ((stats.completed / stats.total) * 100).toFixed(1)
    : 0

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
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">Loan Portfolio</h1>
            <p className="text-white/90 text-lg font-medium drop-shadow">
              Manage and track your lending portfolio • {format(new Date(), 'MMMM dd, yyyy')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => router.push('/l/loans/new')} className="bg-white text-primary hover:bg-white/90">
              <Plus className="mr-2 h-4 w-4" />
              Create New Loan
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="tech-card hover-lift border-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Total Loans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.active}</div>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{stats.completed}</div>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Defaulted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{stats.defaulted}</div>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Disbursed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatCurrency(stats.totalDisbursed)}</div>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Default Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-red-600">{defaultRate}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Portfolio Performance Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Portfolio Status Distribution</CardTitle>
            <CardDescription>Breakdown of loan statuses</CardDescription>
          </CardHeader>
          <CardContent>
            {statusDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={statusDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {statusDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                No loan data yet
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Disbursements</CardTitle>
            <CardDescription>Last 6 loans disbursed</CardDescription>
          </CardHeader>
          <CardContent>
            {disbursementTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={disbursementTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="amount" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                No disbursement data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Portfolio Health - Loan Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Portfolio Health: Loan Repayment Progress</CardTitle>
          <CardDescription>Track repayment progress across your active loans</CardDescription>
        </CardHeader>
        <CardContent>
          {portfolioHealth.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={portfolioHealth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="borrower" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="progress" fill="#10b981" name="Repayment Progress (%)" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
              No active loans to display
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loans Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Loans</CardTitle>
          <CardDescription>View and manage all your loans</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all" className="space-y-4">
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="all">All Loans ({stats.total})</TabsTrigger>
              <TabsTrigger value="active">Active ({stats.active})</TabsTrigger>
              <TabsTrigger value="due-today" className="relative">
                Due Today
                {stats.dueToday > 0 && (
                  <span className="ml-1 bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                    {stats.dueToday}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="overdue" className="relative">
                Overdue
                {stats.overdue > 0 && (
                  <span className="ml-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                    {stats.overdue}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="completed">Completed ({stats.completed})</TabsTrigger>
              <TabsTrigger value="defaulted">Defaulted ({stats.defaulted})</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-4">
              <LoanTable loans={loans} formatCurrency={formatCurrency} getStatusBadge={getStatusBadge} calculateProgress={calculateProgress} getNextPayment={getNextPayment} router={router} onRecordPayment={setSelectedSchedule} isOverdue={isOverdue} isDueToday={isDueToday} />
            </TabsContent>

            <TabsContent value="active" className="space-y-4">
              <LoanTable loans={loans.filter(l => l.status === 'active')} formatCurrency={formatCurrency} getStatusBadge={getStatusBadge} calculateProgress={calculateProgress} getNextPayment={getNextPayment} router={router} onRecordPayment={setSelectedSchedule} isOverdue={isOverdue} isDueToday={isDueToday} />
            </TabsContent>

            <TabsContent value="due-today" className="space-y-4">
              <LoanTable loans={getDueTodayLoans()} formatCurrency={formatCurrency} getStatusBadge={getStatusBadge} calculateProgress={calculateProgress} getNextPayment={getNextPayment} router={router} onRecordPayment={setSelectedSchedule} isOverdue={isOverdue} isDueToday={isDueToday} showDueSchedule />
            </TabsContent>

            <TabsContent value="overdue" className="space-y-4">
              <LoanTable loans={getOverdueLoans()} formatCurrency={formatCurrency} getStatusBadge={getStatusBadge} calculateProgress={calculateProgress} getNextPayment={getNextPayment} router={router} onRecordPayment={setSelectedSchedule} isOverdue={isOverdue} isDueToday={isDueToday} showDueSchedule />
            </TabsContent>

            <TabsContent value="completed" className="space-y-4">
              <LoanTable loans={loans.filter(l => l.status === 'completed')} formatCurrency={formatCurrency} getStatusBadge={getStatusBadge} calculateProgress={calculateProgress} getNextPayment={getNextPayment} router={router} onRecordPayment={setSelectedSchedule} isOverdue={isOverdue} isDueToday={isDueToday} />
            </TabsContent>

            <TabsContent value="defaulted" className="space-y-4">
              <LoanTable loans={loans.filter(l => l.status === 'defaulted')} formatCurrency={formatCurrency} getStatusBadge={getStatusBadge} calculateProgress={calculateProgress} getNextPayment={getNextPayment} router={router} onRecordPayment={setSelectedSchedule} isOverdue={isOverdue} isDueToday={isDueToday} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Payment Recording Dialog */}
      <Dialog open={!!selectedSchedule} onOpenChange={(open) => !open && setSelectedSchedule(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record a payment for this installment
            </DialogDescription>
          </DialogHeader>
          {selectedSchedule && (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Amount Due:</span>
                  <span className="font-medium">{formatCurrency(selectedSchedule.amount_due_minor || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Due Date:</span>
                  <span className="font-medium">{format(new Date(selectedSchedule.due_date), 'MMM dd, yyyy')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Installment:</span>
                  <span className="font-medium">#{selectedSchedule.installment_no}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Payment Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="Enter amount"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Full amount: {lenderCurrency ? (selectedSchedule.amount_due_minor / 100).toFixed(2) : (selectedSchedule.amount_due_minor / 100).toFixed(2)}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="method">Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="mobile_money">Mobile Money</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="check">Check</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
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
                  <BanknoteIcon className="mr-2 h-4 w-4" />
                  Record Payment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function LoanTable({ loans, formatCurrency, getStatusBadge, calculateProgress, getNextPayment, router, onRecordPayment, isOverdue, isDueToday, showDueSchedule }: any) {
  if (loans.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">No loans found</p>
        <p className="text-sm text-gray-500 mt-2">
          Create a new loan to get started
        </p>
      </div>
    )
  }

  // Helper to get the due/overdue schedule for a loan
  const getDueSchedule = (loan: any) => {
    if (!loan.repayment_schedules) return null
    return loan.repayment_schedules.find((s: any) =>
      !isSchedulePaid(s) && (isOverdue(s.due_date, s) || isDueToday(s.due_date, s))
    )
  }

  // Check if schedule is paid for table display
  const isSchedulePaidForDisplay = (schedule: any) => {
    // First check the status column if available
    if (schedule.status === 'paid') return true
    if (schedule.status === 'partial' || schedule.status === 'pending' || schedule.status === 'overdue') return false

    // Fallback to checking repayment events
    if (!schedule.repayment_events || schedule.repayment_events.length === 0) return false
    const totalPaid = schedule.repayment_events.reduce((sum: number, e: any) => sum + (e.amount_paid_minor || 0), 0)
    return totalPaid >= schedule.amount_due_minor
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Borrower</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Interest</TableHead>
            <TableHead>Term</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Progress</TableHead>
            <TableHead>Next Payment</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loans.map((loan: any) => {
            const nextPayment = getNextPayment(loan)
            const progress = calculateProgress(loan)
            const dueSchedule = showDueSchedule ? getDueSchedule(loan) : null
            const scheduleToShow = dueSchedule || nextPayment

            return (
              <TableRow key={loan.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{loan.borrowers?.full_name}</p>
                    <p className="text-sm text-gray-500">{loan.borrowers?.phone_e164}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">
                      {formatCurrency(loan.principal_minor || 0)}
                    </p>
                    <p className="text-sm text-gray-500">
                      APR: {((loan.apr_bps || 0) / 100).toFixed(2)}%
                    </p>
                  </div>
                </TableCell>
                <TableCell>{((loan.apr_bps || 0) / 100).toFixed(2)}%</TableCell>
                <TableCell>{loan.term_months} months</TableCell>
                <TableCell>{getStatusBadge(loan.status)}</TableCell>
                <TableCell>
                  <div className="w-24">
                    <div className="flex items-center space-x-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-green-600 h-2 rounded-full"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">{progress}%</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {scheduleToShow ? (
                    <div>
                      <p className="text-sm font-medium">
                        {formatCurrency(scheduleToShow.amount_due_minor || 0)}
                      </p>
                      <p className={`text-xs ${
                        isOverdue && isOverdue(scheduleToShow.due_date, scheduleToShow)
                          ? 'text-red-600 font-medium'
                          : isDueToday && isDueToday(scheduleToShow.due_date, scheduleToShow)
                          ? 'text-orange-600 font-medium'
                          : 'text-gray-500'
                      }`}>
                        {format(new Date(scheduleToShow.due_date), 'MMM dd')}
                        {isOverdue && isOverdue(scheduleToShow.due_date, scheduleToShow) && ' (Overdue)'}
                        {isDueToday && isDueToday(scheduleToShow.due_date, scheduleToShow) && ' (Today)'}
                      </p>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-500">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/l/loans/${loan.id}`)}
                    >
                      View
                    </Button>
                    {loan.status === 'active' && scheduleToShow && !isSchedulePaidForDisplay(scheduleToShow) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-green-600 border-green-600 hover:bg-green-50"
                        onClick={() => onRecordPayment({ ...scheduleToShow, loan_id: loan.id })}
                      >
                        <BanknoteIcon className="h-4 w-4 mr-1" />
                        Pay
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
