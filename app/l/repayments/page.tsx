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
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  TrendingUp,
  Download,
  FileText,
  Loader2,
  CreditCard,
  BarChart3,
  Info
} from 'lucide-react'
import { format } from 'date-fns'
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
  Cell
} from 'recharts'
import { getCurrencyByCountry, formatCurrency as formatCurrencyUtil, type CurrencyInfo } from '@/lib/utils/currency'

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#6366f1']

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

      // Get lender and profile for country info
      const { data: lender } = await supabase
        .from('lenders')
        .select('user_id')
        .eq('user_id', user.id)
        .single()

      if (!lender) {
        router.push('/l/login')
        return
      }

      // Get user's profile to get country code
      const { data: profile } = await supabase
        .from('profiles')
        .select('country_code')
        .eq('user_id', user.id)
        .single()

      // Load lender's currency
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
            borrowers!inner(
              id,
              full_name,
              phone_e164
            )
          )
        `)
        .eq('loans.lender_id', lender.user_id)
        .eq('loans.status', 'active')
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

      // Calculate stats
      const now = new Date()
      const pending = schedulesData?.filter(s => s.status === 'pending') || []
      const overdue = pending.filter(s => new Date(s.due_date) < now)
      const completed = schedulesData?.filter(s => s.status === 'paid') || []

      const totalCollected = repaymentsData?.reduce((sum, r) =>
        r.status === 'completed' ? sum + (r.amount_minor || 0) : sum, 0) || 0
      const pendingAmount = pending.reduce((sum, s) => sum + (s.amount_due_minor || 0), 0)
      const overdueAmount = overdue.reduce((sum, s) => sum + (s.amount_due_minor || 0), 0)
      const onTimePayments = completed.filter(s => {
        const payment = repaymentsData?.find(r => r.schedule_id === s.id)
        return payment && new Date(payment.created_at) <= new Date(s.due_date)
      })

      setStats({
        totalCollected,
        pendingAmount,
        overdueAmount,
        onTimeRate: completed.length > 0
          ? (onTimePayments.length / completed.length) * 100
          : 0,
        totalScheduled: schedulesData?.length || 0,
        completedPayments: completed.length,
      })
    } catch (error) {
      console.error('Error loading repayments:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadCrossLenderHistory = async (borrowerId: string) => {
    try {
      // Get repayment history across ALL lenders for this borrower
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

      // Create repayment event
      const { data: payment, error: paymentError } = await supabase
        .from('repayment_events')
        .insert({
          loan_id: selectedSchedule.loan_id,
          schedule_id: selectedSchedule.id,
          amount,
          payment_method: paymentMethod,
          status: 'completed',
        })
        .select()
        .single()

      if (paymentError) {
        console.error('Payment error:', paymentError)
        return
      }

      // Update schedule status
      await supabase
        .from('repayment_schedules')
        .update({
          status: amount >= selectedSchedule.amount ? 'paid' : 'partial',
          paid_amount: amount,
          paid_date: new Date().toISOString(),
        })
        .eq('id', selectedSchedule.id)

      // Update loan total_repaid
      await supabase.rpc('process_repayment', {
        p_loan_id: selectedSchedule.loan_id,
        p_amount: amount,
      })

      // Reload data
      await loadRepaymentsData()

      // Close dialog
      setSelectedSchedule(null)
      setPaymentAmount('')
      setPaymentMethod('cash')
    } catch (error) {
      console.error('Error recording payment:', error)
    } finally {
      setRecordingPayment(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>
      case 'paid':
        return <Badge className="bg-green-100 text-green-800">Paid</Badge>
      case 'partial':
        return <Badge className="bg-blue-100 text-blue-800">Partial</Badge>
      case 'overdue':
        return <Badge variant="destructive">Overdue</Badge>
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
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

  const isOverdue = (dueDate: string, status: string) => {
    return status === 'pending' && new Date(dueDate) < new Date()
  }

  // Group schedules by borrower for better visualization
  const schedulesByBorrower = schedules.reduce((acc: any, schedule: any) => {
    const borrowerId = schedule.loans?.borrowers?.id
    if (!borrowerId) return acc

    if (!acc[borrowerId]) {
      acc[borrowerId] = {
        borrower: schedule.loans.borrowers,
        schedules: [],
        totalAmount: 0,
        paidAmount: 0,
        currency: schedule.loans.currency
      }
    }

    acc[borrowerId].schedules.push(schedule)
    acc[borrowerId].totalAmount += (schedule.amount_due_minor || 0)
    acc[borrowerId].paidAmount += (schedule.status === 'paid' ? (schedule.amount_due_minor || 0) : 0)

    return acc
  }, {})

  // Filter borrowers by search query (borrower ID only to avoid confusion with duplicate names)
  const filteredBorrowers = Object.values(schedulesByBorrower).filter((borrowerData: any) => {
    if (!searchQuery.trim()) return true
    return borrowerData.borrower.id.toLowerCase().includes(searchQuery.toLowerCase())
  })

  // Prepare payment trend data for chart
  const paymentTrendData = repayments.slice(0, 10).reverse().map(r => ({
    date: format(new Date(r.created_at), 'MMM dd'),
    amount: r.amount,
    borrower: r.loans?.borrowers?.full_name?.split(' ')[0] || 'Unknown'
  }))

  // Prepare payment status distribution
  const statusDistribution = [
    { name: 'Paid', value: schedules.filter(s => s.status === 'paid').length },
    { name: 'Pending', value: schedules.filter(s => s.status === 'pending' && !isOverdue(s.due_date, s.status)).length },
    { name: 'Overdue', value: schedules.filter(s => isOverdue(s.due_date, s.status)).length },
    { name: 'Partial', value: schedules.filter(s => s.status === 'partial').length },
  ].filter(item => item.value > 0)

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
        <h1 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">Repayment Management</h1>
        <p className="text-white/90 text-lg font-medium drop-shadow">
          Track individual repayment progress and payment history • {format(new Date(), 'MMMM dd, yyyy')}
        </p>
      </div>

      {/* Stats Cards with Graphs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Total Collected</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-green-500/10 to-green-500/5 rounded-xl">
              <DollarSign className="h-5 w-5 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {formatCurrency(stats.totalCollected)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.completedPayments} payments
            </p>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Pending Amount</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 rounded-xl">
              <Clock className="h-5 w-5 text-yellow-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">
              {formatCurrency(stats.pendingAmount)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">To be collected</p>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Overdue Amount</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-red-500/10 to-red-500/5 rounded-xl">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">
              {formatCurrency(stats.overdueAmount)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Past due date</p>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">On-Time Rate</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-blue-500/10 to-blue-500/5 rounded-xl">
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              {stats.onTimeRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">Payment reliability</p>
          </CardContent>
        </Card>
      </div>

      {/* Payment Trend and Distribution Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Payment Trend</CardTitle>
            <CardDescription>Last 10 payments received</CardDescription>
          </CardHeader>
          <CardContent>
            {paymentTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={paymentTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="amount" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                No payment data yet
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment Status Distribution</CardTitle>
            <CardDescription>Overview of all repayment schedules</CardDescription>
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
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                No schedule data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Individual Borrower Repayment Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Individual Repayment Progress</CardTitle>
          <CardDescription>
            See each borrower's payment progress and history across all lenders
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="mb-4 bg-blue-50 border-blue-200">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-900">
              <strong>Cross-Lender Visibility:</strong> Click on any borrower to see their payment history with other lenders, helping you assess their reliability.
            </AlertDescription>
          </Alert>

          {/* Search Bar */}
          {Object.values(schedulesByBorrower).length > 0 && (
            <div className="mb-4">
              <Label htmlFor="search" className="text-sm font-medium mb-2 block">
                Search by Borrower ID
              </Label>
              <div className="relative">
                <Input
                  id="search"
                  type="text"
                  placeholder="Enter borrower ID to filter..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <User className="h-4 w-4" />
                </div>
              </div>
              {searchQuery && (
                <p className="text-xs text-muted-foreground mt-1">
                  Showing {filteredBorrowers.length} of {Object.values(schedulesByBorrower).length} borrowers
                </p>
              )}
            </div>
          )}

          {Object.values(schedulesByBorrower).length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No active repayment schedules</p>
              <p className="text-sm text-gray-500 mt-2">
                Repayment schedules will appear here once you have active loans
              </p>
            </div>
          ) : filteredBorrowers.length === 0 ? (
            <div className="text-center py-12">
              <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No borrowers found</p>
              <p className="text-sm text-gray-500 mt-2">
                No borrowers match your search. Try a different ID.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredBorrowers.map((borrowerData: any) => {
                const progress = (borrowerData.paidAmount / borrowerData.totalAmount) * 100
                const onTimeCount = borrowerData.schedules.filter((s: any) => {
                  if (s.status !== 'paid') return false
                  const payment = repayments.find(r => r.schedule_id === s.id)
                  return payment && new Date(payment.created_at) <= new Date(s.due_date)
                }).length
                const totalPaid = borrowerData.schedules.filter((s: any) => s.status === 'paid').length

                return (
                  <div key={borrowerData.borrower.id} className="border rounded-lg p-4 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-lg">{borrowerData.borrower.full_name}</h3>
                        <p className="text-sm text-muted-foreground">{borrowerData.borrower.phone_e164}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedBorrower(borrowerData.borrower)
                          loadCrossLenderHistory(borrowerData.borrower.id)
                        }}
                      >
                        <BarChart3 className="h-4 w-4 mr-2" />
                        View Full History
                      </Button>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Repayment Progress</span>
                        <span className="font-semibold">
                          {formatCurrency(borrowerData.paidAmount)} / {formatCurrency(borrowerData.totalAmount)}
                        </span>
                      </div>
                      <Progress value={progress} className="h-3" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{progress.toFixed(1)}% complete</span>
                        <span>
                          {onTimeCount} of {totalPaid} paid on time
                        </span>
                      </div>
                    </div>

                    {/* Individual Schedules */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {borrowerData.schedules.map((schedule: any) => (
                        <div
                          key={schedule.id}
                          className={`p-3 rounded-lg border-2 ${
                            isOverdue(schedule.due_date, schedule.status)
                              ? 'border-red-200 bg-red-50'
                              : schedule.status === 'paid'
                              ? 'border-green-200 bg-green-50'
                              : 'border-gray-200 bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            {getStatusBadge(
                              isOverdue(schedule.due_date, schedule.status) ? 'overdue' : schedule.status
                            )}
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(schedule.due_date), 'MMM dd')}
                            </span>
                          </div>
                          <div className="text-lg font-bold">
                            {formatCurrency(schedule.amount_due_minor || 0)}
                          </div>
                          {schedule.status === 'pending' && (
                            <Button
                              size="sm"
                              className="w-full mt-2"
                              variant={isOverdue(schedule.due_date, schedule.status) ? 'destructive' : 'default'}
                              onClick={() => {
                                setSelectedSchedule(schedule)
                                setPaymentAmount(schedule.amount.toString())
                              }}
                            >
                              Record Payment
                            </Button>
                          )}
                        </div>
                      ))}
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
            <div>
              <Label>Amount Due</Label>
              <div className="text-2xl font-bold text-green-600">
                {selectedSchedule && formatCurrency(selectedSchedule.amount_due_minor || 0)}
              </div>
            </div>

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
            <Button
              variant="outline"
              onClick={() => {
                setSelectedSchedule(null)
                setPaymentAmount('')
                setPaymentMethod('cash')
              }}
            >
              Cancel
            </Button>
            <Button onClick={recordPayment} disabled={recordingPayment || !paymentAmount}>
              {recordingPayment ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Recording...
                </>
              ) : (
                'Record Payment'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cross-Lender Payment History Dialog */}
      <Dialog open={!!selectedBorrower} onOpenChange={(open) => !open && setSelectedBorrower(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payment History: {selectedBorrower?.full_name}</DialogTitle>
            <DialogDescription>
              Complete payment history across all lenders
            </DialogDescription>
          </DialogHeader>

          <Alert className="bg-blue-50 border-blue-200">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-900">
              This shows how this borrower has been paying with <strong>all lenders</strong>, not just you. This helps assess their overall payment reliability.
            </AlertDescription>
          </Alert>

          {crossLenderHistory.length > 0 ? (
            <div className="space-y-4">
              {/* Payment Trend Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Payment Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={crossLenderHistory.map(h => ({
                      date: format(new Date(h.created_at), 'MMM dd'),
                      amount: h.amount,
                      lender: h.loans?.lenders?.business_name || 'Unknown'
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="amount" stroke="#10b981" name="Payment Amount" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Payment History Table */}
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
                      <TableCell className="font-semibold">{formatCurrency(payment.amount_minor || 0)}</TableCell>
                      <TableCell className="capitalize">{payment.payment_method?.replace('_', ' ')}</TableCell>
                      <TableCell>{getStatusBadge(payment.status)}</TableCell>
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
