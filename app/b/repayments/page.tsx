'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Calendar } from '@/components/ui/calendar'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  CreditCard,
  Calendar as CalendarIcon,
  DollarSign,
  Clock,
  CheckCircle,
  AlertCircle,
  Info,
  Download,
  Receipt,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  Send,
  Shield,
  Bell,
  Settings,
  Filter,
  Search,
  Wallet,
  Banknote,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  History,
  Target,
  Award,
  Upload,
  Camera,
  XCircle,
  Loader2,
  AlertTriangle
} from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { format, addDays, differenceInDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, parseISO, subMonths } from 'date-fns'
import { getCurrencyByCountry, formatCurrency as formatCurrencyUtil, type CurrencyInfo } from '@/lib/utils/currency'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts'

export default function RepaymentsPage() {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [borrower, setBorrower] = useState<any>(null)
  const [borrowerCurrency, setBorrowerCurrency] = useState<CurrencyInfo | null>(null)
  const [activeLoan, setActiveLoan] = useState<any>(null)
  const [upcomingPayments, setUpcomingPayments] = useState<any[]>([])
  const [overduePayments, setOverduePayments] = useState<any[]>([])
  const [paymentHistory, setPaymentHistory] = useState<any[]>([])
  const [selectedPayment, setSelectedPayment] = useState<any>(null)
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer')
  const [autoPayEnabled, setAutoPayEnabled] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [paymentStats, setPaymentStats] = useState<any>(null)
  const [paymentProofs, setPaymentProofs] = useState<any[]>([])
  const [confirmedPayments, setConfirmedPayments] = useState<any[]>([])
  const [showProofDialog, setShowProofDialog] = useState(false)
  const [proofAmount, setProofAmount] = useState('')
  const [proofDate, setProofDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [proofMethod, setProofMethod] = useState('mobile_money')
  const [proofReference, setProofReference] = useState('')
  const [proofNotes, setProofNotes] = useState('')
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [submittingProof, setSubmittingProof] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadRepaymentsData()
  }, [])

  const loadRepaymentsData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/b/login')
        return
      }

      // Get profile
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

      // Get borrower record via borrower_user_links
      const { data: linkData } = await supabase
        .from('borrower_user_links')
        .select('borrower_id')
        .eq('user_id', user.id)
        .single()

      if (linkData) {
        const { data: borrowerData } = await supabase
          .from('borrowers')
          .select('*')
          .eq('id', linkData.borrower_id)
          .single()

        if (!borrowerData) {
          setLoading(false)
          return
        }

        setBorrower(borrowerData)

        // Load borrower's currency
        const currency = getCurrencyByCountry(borrowerData.country_code)
        if (currency) {
          setBorrowerCurrency(currency)
        }

        // Get active loan with schedules
        const { data: loanData } = await supabase
          .from('loans')
          .select(`
            *,
            lenders(
              business_name,
              contact_email
            ),
            repayment_schedules(
              *
            ),
            repayment_events(
              *
            )
          `)
          .eq('borrower_id', borrowerData.id)
          .eq('status', 'active')
          .single()

        if (loanData) {
          setActiveLoan(loanData)
          
          // Sort and categorize payments
          const now = new Date()
          const schedules = loanData.repayment_schedules || []
          
          const upcoming = schedules
            .filter((s: any) => s.status === 'pending' && new Date(s.due_date) >= now)
            .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
          
          const overdue = schedules
            .filter((s: any) => s.status === 'pending' && new Date(s.due_date) < now)
            .sort((a: any, b: any) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime())
          
          setUpcomingPayments(upcoming)
          setOverduePayments(overdue)
          
          // Get payment history
          const history = loanData.repayment_events || []
          setPaymentHistory(history.sort((a: any, b: any) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          ))
          
          // Calculate stats
          calculatePaymentStats(loanData, schedules, history)

          // Load payment proofs for this loan
          const { data: proofsData } = await supabase
            .from('payment_proofs')
            .select('*')
            .eq('loan_id', loanData.id)
            .order('created_at', { ascending: false })

          setPaymentProofs(proofsData || [])

          // Set confirmed payments (approved proofs + direct lender recordings)
          const confirmed = (proofsData || []).filter((p: any) => p.status === 'approved')
          setConfirmedPayments(confirmed)
        }
      }
    } catch (error) {
      console.error('Error loading repayments:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculatePaymentStats = (loan: any, schedules: any[], history: any[]) => {
    const totalPayments = schedules.length
    const completedPayments = schedules.filter((s: any) => s.status === 'paid').length
    const onTimePayments = history.filter((h: any) => {
      const schedule = schedules.find((s: any) => s.id === h.schedule_id)
      if (!schedule) return false
      return new Date(h.created_at) <= new Date(schedule.due_date)
    }).length
    
    const totalPaid = loan.total_repaid
    const totalRemaining = loan.total_amount - totalPaid
    const nextPayment = schedules
      .filter((s: any) => s.status === 'pending')
      .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0]
    
    setPaymentStats({
      totalPayments,
      completedPayments,
      onTimePayments,
      onTimeRate: totalPayments > 0 ? Math.round((onTimePayments / completedPayments) * 100) : 100,
      totalPaid,
      totalRemaining,
      nextPaymentAmount: nextPayment?.amount || 0,
      nextPaymentDate: nextPayment?.due_date || null,
      averagePayment: loan.total_amount / totalPayments
    })
  }

  const formatCurrency = (amountMinor: number) => {
    if (!borrowerCurrency) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
      }).format(amountMinor / 100)
    }
    return formatCurrencyUtil(amountMinor, borrowerCurrency)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800'
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      case 'overdue': return 'bg-red-100 text-red-800'
      case 'processing': return 'bg-blue-100 text-blue-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getDaysUntilDue = (dueDate: string) => {
    const days = differenceInDays(new Date(dueDate), new Date())
    if (days < 0) return `${Math.abs(days)} days overdue`
    if (days === 0) return 'Due today'
    if (days === 1) return 'Due tomorrow'
    return `${days} days`
  }

  const handleMakePayment = (payment: any) => {
    setSelectedPayment(payment)
    setShowPaymentDialog(true)
  }

  const handleSubmitPaymentProof = async () => {
    if (!activeLoan || !proofAmount || !proofDate) return

    setSubmittingProof(true)
    try {
      let proofUrl = null

      // Upload proof file if provided
      if (proofFile) {
        const fileExt = proofFile.name.split('.').pop()
        const fileName = `${activeLoan.id}/${Date.now()}.${fileExt}`
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('payment-proofs')
          .upload(fileName, proofFile)

        if (uploadError) {
          console.error('Upload error:', uploadError)
        } else {
          const { data: urlData } = supabase.storage
            .from('payment-proofs')
            .getPublicUrl(fileName)
          proofUrl = urlData.publicUrl
        }
      }

      // Submit proof via RPC
      const { data, error } = await supabase.rpc('submit_payment_proof', {
        p_loan_id: activeLoan.id,
        p_amount: parseFloat(proofAmount),
        p_payment_date: proofDate,
        p_payment_method: proofMethod,
        p_reference_number: proofReference || null,
        p_proof_url: proofUrl,
        p_notes: proofNotes || null
      })

      if (error) throw error

      // Reset form and close dialog
      setProofAmount('')
      setProofDate(format(new Date(), 'yyyy-MM-dd'))
      setProofMethod('mobile_money')
      setProofReference('')
      setProofNotes('')
      setProofFile(null)
      setShowProofDialog(false)

      // Refresh data
      await loadRepaymentsData()

      alert('Payment proof submitted successfully! Your lender will review it shortly.')
    } catch (error: any) {
      console.error('Error submitting payment proof:', error)
      alert(error.message || 'Failed to submit payment proof')
    } finally {
      setSubmittingProof(false)
    }
  }

  const getProofStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800 border-green-300'
      case 'rejected': return 'bg-red-100 text-red-800 border-red-300'
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      default: return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  const processPayment = async () => {
    // In a real app, this would integrate with a payment processor
    console.log('Processing payment:', selectedPayment, paymentMethod)
    setShowPaymentDialog(false)
    // Refresh data after payment
    await loadRepaymentsData()
  }

  const generatePaymentTrend = () => {
    if (!paymentHistory.length) return []
    
    const last6Months = []
    for (let i = 5; i >= 0; i--) {
      const month = subMonths(new Date(), i)
      const monthPayments = paymentHistory.filter((p: any) => {
        const paymentDate = new Date(p.created_at)
        return paymentDate.getMonth() === month.getMonth() && 
               paymentDate.getFullYear() === month.getFullYear()
      })
      
      last6Months.push({
        month: format(month, 'MMM'),
        amount: monthPayments.reduce((sum: number, p: any) => sum + p.amount, 0),
        count: monthPayments.length
      })
    }
    
    return last6Months
  }

  const paymentTrendData = generatePaymentTrend()

  const calendarDates = activeLoan ? 
    upcomingPayments.map(p => new Date(p.due_date)) : []

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Repayments</h1>
          <p className="text-gray-600 mt-1">
            Manage your loan repayments and track payment history
          </p>
        </div>
        <div className="flex space-x-2">
          <Button onClick={() => setShowProofDialog(true)} disabled={!activeLoan}>
            <Upload className="mr-2 h-4 w-4" />
            Submit Payment Proof
          </Button>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export History
          </Button>
        </div>
      </div>

      {!activeLoan ? (
        <Card className="text-center py-12">
          <CardContent>
            <Wallet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Active Loans</h3>
            <p className="text-gray-600 mb-4">You don't have any active loans requiring repayments.</p>
            <p className="text-sm text-gray-500 mb-4">
              Looking for completed loans? Your full repayment history is available on the My Loans page.
            </p>
            <Button onClick={() => router.push('/b/loans')}>
              View My Loans
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Overdue Alert */}
          {overduePayments.length > 0 && (
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertTitle className="text-red-900">Overdue Payments</AlertTitle>
              <AlertDescription>
                You have {overduePayments.length} overdue payment{overduePayments.length > 1 ? 's' : ''} totaling{' '}
                {formatCurrency(
                  overduePayments.reduce((sum, p) => sum + p.amount, 0)
                )}. Please make payment immediately to avoid penalties.
                <Button 
                  className="mt-3" 
                  variant="destructive"
                  onClick={() => handleMakePayment(overduePayments[0])}
                >
                  Pay Now
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Payment Stats */}
          {paymentStats && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Next Payment</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {formatCurrency(paymentStats.nextPaymentAmount)}
                  </p>
                  {paymentStats.nextPaymentDate && (
                    <p className="text-sm text-gray-600">
                      {format(new Date(paymentStats.nextPaymentDate), 'MMM dd')}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Total Paid</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(paymentStats.totalPaid)}
                  </p>
                  <p className="text-sm text-gray-600">
                    {paymentStats.completedPayments} of {paymentStats.totalPayments}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Remaining</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {formatCurrency(paymentStats.totalRemaining)}
                  </p>
                  <p className="text-sm text-gray-600">
                    {paymentStats.totalPayments - paymentStats.completedPayments} payments
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">On-Time Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {paymentStats.onTimeRate}%
                  </p>
                  <p className="text-sm text-gray-600">
                    {paymentStats.onTimePayments} on-time
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Avg. Payment</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {formatCurrency(paymentStats.averagePayment)}
                  </p>
                  <p className="text-sm text-gray-600">per month</p>
                </CardContent>
              </Card>
            </div>
          )}

          <Tabs defaultValue="upcoming" className="space-y-6">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="proofs">My Submissions</TabsTrigger>
              <TabsTrigger value="confirmed">Confirmed</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="calendar">Calendar</TabsTrigger>
            </TabsList>

            {/* Upcoming Payments Tab */}
            <TabsContent value="upcoming" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Upcoming Payments</CardTitle>
                  <CardDescription>
                    Your scheduled payments for the next months
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {upcomingPayments.length === 0 ? (
                    <p className="text-sm text-gray-500">No upcoming payments</p>
                  ) : (
                    <div className="space-y-4">
                      {upcomingPayments.slice(0, 5).map((payment, index) => {
                        const isOverdue = differenceInDays(new Date(payment.due_date), new Date()) < 0
                        return (
                          <div key={payment.id} className={`p-4 border rounded-lg hover:bg-gray-50 ${isOverdue ? 'border-red-300 bg-red-50' : ''}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-4">
                                <div className={`p-3 rounded-full ${isOverdue ? 'bg-red-100' : index === 0 ? 'bg-blue-100' : 'bg-gray-100'}`}>
                                  <CalendarIcon className={`h-6 w-6 ${isOverdue ? 'text-red-600' : index === 0 ? 'text-blue-600' : 'text-gray-600'}`} />
                                </div>
                                <div>
                                  <p className="font-semibold">
                                    Payment #{payment.payment_number || index + paymentStats?.completedPayments + 1}
                                  </p>
                                  <p className="text-sm text-gray-600">
                                    Due on {format(new Date(payment.due_date), 'MMMM dd, yyyy')}
                                  </p>
                                  <p className={`text-sm font-medium ${isOverdue ? 'text-red-600' : 'text-blue-600'}`}>
                                    {getDaysUntilDue(payment.due_date)}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-2xl font-bold">
                                  {formatCurrency(payment.amount)}
                                </p>
                                <div className="flex items-center space-x-2 mt-2">
                                  <Button
                                    size="sm"
                                    onClick={() => handleMakePayment(payment)}
                                  >
                                    Pay Now
                                  </Button>
                                  <Button size="sm" variant="outline">
                                    <Bell className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                            {/* Show lender notes for overdue payments */}
                            {isOverdue && payment.lender_notes && (
                              <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                                <p className="text-sm font-medium text-orange-800">Lender's Note:</p>
                                <p className="text-sm text-orange-700">{payment.lender_notes}</p>
                                {payment.lender_notes_updated_at && (
                                  <p className="text-xs text-orange-500 mt-1">
                                    Updated {format(new Date(payment.lender_notes_updated_at), 'MMM dd, yyyy')}
                                  </p>
                                )}
                                <Button
                                  variant="link"
                                  size="sm"
                                  className="text-orange-700 p-0 h-auto mt-2"
                                  onClick={() => router.push(`/b/disputes/new?type=payment_not_updated&loan=${activeLoan?.id}`)}
                                >
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Dispute this if you believe you've paid
                                </Button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Payment Trend */}
              <Card>
                <CardHeader>
                  <CardTitle>Payment Trend</CardTitle>
                  <CardDescription>Your payment amounts over the last 6 months</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={paymentTrendData}>
                        <defs>
                          <linearGradient id="paymentGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip formatter={(value: any) => formatCurrency(value)} />
                        <Area 
                          type="monotone" 
                          dataKey="amount" 
                          stroke="#3b82f6" 
                          fill="url(#paymentGradient)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Payment Proofs Tab - My Submissions */}
            <TabsContent value="proofs" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>My Payment Submissions</CardTitle>
                      <CardDescription>
                        Payment proofs you've submitted for lender review
                      </CardDescription>
                    </div>
                    <Button onClick={() => setShowProofDialog(true)}>
                      <Upload className="mr-2 h-4 w-4" />
                      Submit New Proof
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {paymentProofs.length === 0 ? (
                    <div className="text-center py-8">
                      <Receipt className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No Payment Proofs</h3>
                      <p className="text-gray-600 mb-4">
                        Made a payment? Submit proof so your lender can verify and update your balance.
                      </p>
                      <Button onClick={() => setShowProofDialog(true)}>
                        <Upload className="mr-2 h-4 w-4" />
                        Submit Payment Proof
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {paymentProofs.map((proof) => (
                        <div
                          key={proof.id}
                          className={`p-4 border rounded-lg ${
                            proof.status === 'pending' ? 'border-yellow-200 bg-yellow-50' :
                            proof.status === 'approved' ? 'border-green-200 bg-green-50' :
                            'border-red-200 bg-red-50'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start space-x-4">
                              <div className={`p-3 rounded-full ${
                                proof.status === 'pending' ? 'bg-yellow-100' :
                                proof.status === 'approved' ? 'bg-green-100' :
                                'bg-red-100'
                              }`}>
                                {proof.status === 'pending' && <Clock className="h-6 w-6 text-yellow-600" />}
                                {proof.status === 'approved' && <CheckCircle className="h-6 w-6 text-green-600" />}
                                {proof.status === 'rejected' && <XCircle className="h-6 w-6 text-red-600" />}
                              </div>
                              <div>
                                <p className="font-semibold text-lg">
                                  {formatCurrency(proof.amount * 100)}
                                </p>
                                <p className="text-sm text-gray-600">
                                  Paid on {format(new Date(proof.payment_date), 'MMMM dd, yyyy')}
                                </p>
                                <p className="text-sm text-gray-500">
                                  Method: {proof.payment_method.replace('_', ' ')}
                                  {proof.reference_number && ` • Ref: ${proof.reference_number}`}
                                </p>
                                {proof.notes && (
                                  <p className="text-sm text-gray-500 mt-1">Note: {proof.notes}</p>
                                )}
                                {proof.status === 'rejected' && proof.rejection_reason && (
                                  <Alert className="mt-2 border-red-200 bg-red-50">
                                    <AlertCircle className="h-4 w-4 text-red-600" />
                                    <AlertDescription className="text-red-800">
                                      <div className="flex items-center justify-between">
                                        <span>Rejected: {proof.rejection_reason}</span>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="ml-2 text-orange-700 border-orange-300 hover:bg-orange-50"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            router.push(`/b/disputes/new?type=payment_not_updated&loan=${activeLoan?.id}&amount=${proof.amount}&reason=${encodeURIComponent(proof.rejection_reason || '')}`)
                                          }}
                                        >
                                          <AlertTriangle className="h-3 w-3 mr-1" />
                                          Dispute
                                        </Button>
                                      </div>
                                    </AlertDescription>
                                  </Alert>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <Badge className={getProofStatusColor(proof.status)}>
                                {proof.status === 'pending' ? 'Awaiting Review' :
                                 proof.status === 'approved' ? 'Confirmed' : 'Rejected'}
                              </Badge>
                              <p className="text-xs text-gray-500 mt-2">
                                Submitted {format(new Date(proof.created_at), 'MMM dd, yyyy')}
                              </p>
                              {proof.proof_url && (
                                <Button
                                  variant="link"
                                  size="sm"
                                  className="mt-1"
                                  onClick={() => window.open(proof.proof_url, '_blank')}
                                >
                                  <FileText className="h-4 w-4 mr-1" />
                                  View Proof
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Confirmed Payments Tab - Payments updated by lender */}
            <TabsContent value="confirmed" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Confirmed Payments</CardTitle>
                  <CardDescription>
                    Payments that have been verified and recorded by your lender
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {(activeLoan?.total_repaid || 0) === 0 && confirmedPayments.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No Confirmed Payments Yet</h3>
                      <p className="text-gray-600">
                        When your lender confirms your payments, they will appear here.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Total Repaid Summary */}
                      <div className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-green-700">Total Confirmed Repaid</p>
                            <p className="text-3xl font-bold text-green-800">
                              {formatCurrency((activeLoan?.total_repaid || 0) * 100)}
                            </p>
                          </div>
                          <div className="p-4 bg-green-100 rounded-full">
                            <CheckCircle className="h-8 w-8 text-green-600" />
                          </div>
                        </div>
                        <div className="mt-4">
                          <div className="flex justify-between text-sm text-green-700 mb-1">
                            <span>Progress</span>
                            <span>
                              {activeLoan?.total_amount_minor
                                ? Math.round(((activeLoan?.total_repaid || 0) * 100 / activeLoan.total_amount_minor) * 100)
                                : 0}%
                            </span>
                          </div>
                          <Progress
                            value={activeLoan?.total_amount_minor
                              ? ((activeLoan?.total_repaid || 0) * 100 / activeLoan.total_amount_minor) * 100
                              : 0}
                            className="h-2"
                          />
                        </div>
                      </div>

                      {/* Approved Payment Proofs */}
                      {confirmedPayments.length > 0 && (
                        <div>
                          <h3 className="text-lg font-semibold mb-3">Payment Confirmations</h3>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Date Paid</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Method</TableHead>
                                <TableHead>Reference</TableHead>
                                <TableHead>Confirmed On</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {confirmedPayments.map((payment) => (
                                <TableRow key={payment.id}>
                                  <TableCell>
                                    {format(new Date(payment.payment_date), 'MMM dd, yyyy')}
                                  </TableCell>
                                  <TableCell className="font-semibold text-green-600">
                                    {formatCurrency(payment.amount * 100)}
                                  </TableCell>
                                  <TableCell className="capitalize">
                                    {payment.payment_method.replace('_', ' ')}
                                  </TableCell>
                                  <TableCell className="font-mono text-sm">
                                    {payment.reference_number || '-'}
                                  </TableCell>
                                  <TableCell>
                                    {payment.reviewed_at
                                      ? format(new Date(payment.reviewed_at), 'MMM dd, yyyy')
                                      : '-'}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Calendar Tab */}
            <TabsContent value="calendar">
              <Card>
                <CardHeader>
                  <CardTitle>Payment Calendar</CardTitle>
                  <CardDescription>
                    View your payment schedule in calendar format
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex space-x-6">
                    <div className="flex-1">
                      <Calendar
                        mode="multiple"
                        selected={calendarDates}
                        className="rounded-md border"
                      />
                    </div>
                    <div className="w-80 space-y-4">
                      <h3 className="font-semibold">Payment Dates</h3>
                      {upcomingPayments.slice(0, 3).map((payment) => (
                        <div key={payment.id} className="p-3 border rounded-lg">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium">
                                {format(new Date(payment.due_date), 'MMMM dd, yyyy')}
                              </p>
                              <p className="text-sm text-gray-600">
                                {getDaysUntilDue(payment.due_date)}
                              </p>
                            </div>
                            <p className="font-bold">
                              {formatCurrency(payment.amount)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Payment History Tab */}
            <TabsContent value="history">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>Payment History</CardTitle>
                      <CardDescription>
                        All your past payment transactions
                      </CardDescription>
                    </div>
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm">
                        <Filter className="mr-2 h-4 w-4" />
                        Filter
                      </Button>
                      <Button variant="outline" size="sm">
                        <Receipt className="mr-2 h-4 w-4" />
                        Receipts
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {paymentHistory.length === 0 ? (
                    <p className="text-sm text-gray-500">No payment history yet</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Payment #</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Receipt</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paymentHistory.map((payment, index) => (
                          <TableRow key={payment.id}>
                            <TableCell>
                              {format(new Date(payment.created_at), 'MMM dd, yyyy')}
                            </TableCell>
                            <TableCell>#{paymentHistory.length - index}</TableCell>
                            <TableCell className="font-semibold">
                              {formatCurrency(payment.amount)}
                            </TableCell>
                            <TableCell>
                              {payment.payment_method || 'Bank Transfer'}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {payment.transaction_reference || 'N/A'}
                            </TableCell>
                            <TableCell>
                              <Badge className={getStatusColor(payment.status)}>
                                {payment.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button size="sm" variant="ghost">
                                <Download className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Auto-Pay Tab */}
            <TabsContent value="autopay">
              <Card>
                <CardHeader>
                  <CardTitle>Automatic Payments</CardTitle>
                  <CardDescription>
                    Set up automatic payments to never miss a due date
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <Alert>
                    <Shield className="h-4 w-4" />
                    <AlertTitle>Secure & Convenient</AlertTitle>
                    <AlertDescription>
                      Enable auto-pay to automatically deduct payments from your account on due dates.
                      You'll receive notifications before each payment.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <Checkbox 
                          checked={autoPayEnabled}
                          onCheckedChange={(checked) => setAutoPayEnabled(checked as boolean)}
                        />
                        <div>
                          <Label className="text-base font-medium">Enable Auto-Pay</Label>
                          <p className="text-sm text-gray-600">
                            Automatically pay on due dates
                          </p>
                        </div>
                      </div>
                      <Badge variant={autoPayEnabled ? 'default' : 'secondary'}>
                        {autoPayEnabled ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>

                    {autoPayEnabled && (
                      <>
                        <div>
                          <Label>Payment Method</Label>
                          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                            <SelectTrigger className="mt-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                              <SelectItem value="debit_card">Debit Card</SelectItem>
                              <SelectItem value="mpesa">M-Pesa</SelectItem>
                              <SelectItem value="paypal">PayPal</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label>Payment Day</Label>
                          <Select defaultValue="due_date">
                            <SelectTrigger className="mt-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="due_date">On Due Date</SelectItem>
                              <SelectItem value="1_day_before">1 Day Before Due</SelectItem>
                              <SelectItem value="3_days_before">3 Days Before Due</SelectItem>
                              <SelectItem value="5_days_before">5 Days Before Due</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label>Notification Preferences</Label>
                          <div className="space-y-2 mt-2">
                            <div className="flex items-center space-x-2">
                              <Checkbox defaultChecked />
                              <Label className="text-sm font-normal">Email notifications</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox defaultChecked />
                              <Label className="text-sm font-normal">SMS notifications</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox defaultChecked />
                              <Label className="text-sm font-normal">In-app notifications</Label>
                            </div>
                          </div>
                        </div>

                        <Button className="w-full">
                          Save Auto-Pay Settings
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Make Payment</DialogTitle>
            <DialogDescription>
              Complete your loan repayment
            </DialogDescription>
          </DialogHeader>
          {selectedPayment && (
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">Payment Amount</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(selectedPayment.amount)}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  Due: {format(new Date(selectedPayment.due_date), 'MMMM dd, yyyy')}
                </p>
              </div>

              <div>
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="debit_card">Debit Card</SelectItem>
                    <SelectItem value="mpesa">M-Pesa</SelectItem>
                    <SelectItem value="paypal">PayPal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  You will be redirected to complete payment securely.
                  Do not close the window until payment is confirmed.
                </AlertDescription>
              </Alert>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
              Cancel
            </Button>
            <Button onClick={processPayment}>
              <Send className="mr-2 h-4 w-4" />
              Proceed to Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submit Payment Proof Dialog */}
      <Dialog open={showProofDialog} onOpenChange={setShowProofDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Submit Payment Proof</DialogTitle>
            <DialogDescription>
              Made a payment? Submit proof so your lender can verify and update your balance.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Amount Paid *</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={proofAmount}
                  onChange={(e) => setProofAmount(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Payment Date *</Label>
                <Input
                  type="date"
                  value={proofDate}
                  onChange={(e) => setProofDate(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label>Payment Method *</Label>
              <Select value={proofMethod} onValueChange={setProofMethod}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mobile_money">Mobile Money (M-Pesa, MTN, etc.)</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card Payment</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Transaction Reference / Receipt Number</Label>
              <Input
                placeholder="e.g., TXN123456 or receipt number"
                value={proofReference}
                onChange={(e) => setProofReference(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label>Upload Proof (Screenshot/Photo of Receipt)</Label>
              <div className="mt-1">
                <label
                  className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 ${
                    proofFile ? 'border-green-300 bg-green-50' : 'border-gray-300'
                  }`}
                >
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    {proofFile ? (
                      <>
                        <CheckCircle className="w-8 h-8 mb-2 text-green-500" />
                        <p className="text-sm text-green-600 font-medium">{proofFile.name}</p>
                        <p className="text-xs text-gray-500">Click to change file</p>
                      </>
                    ) : (
                      <>
                        <Camera className="w-8 h-8 mb-2 text-gray-400" />
                        <p className="text-sm text-gray-500">
                          <span className="font-semibold">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-xs text-gray-400">PNG, JPG, PDF up to 10MB</p>
                      </>
                    )}
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*,.pdf"
                    onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
            </div>

            <div>
              <Label>Additional Notes</Label>
              <Textarea
                placeholder="Any additional information about this payment..."
                value={proofNotes}
                onChange={(e) => setProofNotes(e.target.value)}
                className="mt-1"
                rows={3}
              />
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Your lender will review this payment proof and update your loan balance once verified.
                You'll receive a notification when your payment is confirmed.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProofDialog(false)} disabled={submittingProof}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitPaymentProof}
              disabled={submittingProof || !proofAmount || !proofDate}
            >
              {submittingProof ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Submit Proof
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}