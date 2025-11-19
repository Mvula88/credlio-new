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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  CreditCard,
  Calendar,
  DollarSign,
  TrendingUp,
  FileText,
  Download,
  Eye,
  Clock,
  CheckCircle,
  AlertCircle,
  Info,
  ChevronRight,
  Receipt,
  Calculator,
  Banknote,
  Target,
  Activity,
  BarChart3,
  History,
  Shield,
  Award,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  AlertTriangle
} from 'lucide-react'
import { format, addMonths, differenceInDays, parseISO, isPast } from 'date-fns'
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
  Cell,
  RadialBarChart,
  RadialBar
} from 'recharts'

export default function BorrowerLoansPage() {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [borrower, setBorrower] = useState<any>(null)
  const [borrowerCurrency, setBorrowerCurrency] = useState<CurrencyInfo | null>(null)
  const [loans, setLoans] = useState<any[]>([])
  const [selectedLoan, setSelectedLoan] = useState<any>(null)
  const [repaymentSchedule, setRepaymentSchedule] = useState<any[]>([])
  const [paymentHistory, setPaymentHistory] = useState<any[]>([])
  const [loanStats, setLoanStats] = useState<any>(null)
  const [downloadingAgreement, setDownloadingAgreement] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadLoansData()
  }, [])

  const loadLoansData = async () => {
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

      // Get borrower link
      const { data: linkData } = await supabase
        .from('borrower_user_links')
        .select('borrower_id')
        .eq('user_id', user.id)
        .single()

      if (linkData) {
        // Get borrower record
        const { data: borrowerData } = await supabase
          .from('borrowers')
          .select('*')
          .eq('id', linkData.borrower_id)
          .single()

        if (borrowerData) {
          setBorrower(borrowerData)

          // Load borrower's currency
          const currency = getCurrencyByCountry(borrowerData.country_code)
          if (currency) {
            setBorrowerCurrency(currency)
          }
        }

        // Get ALL loans (including completed/past) for this borrower
        const { data: loansData } = await supabase
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
          .eq('borrower_id', linkData.borrower_id)
          .order('created_at', { ascending: false })

        if (loansData && loansData.length > 0) {
          setLoans(loansData)
          setSelectedLoan(loansData.find(l => l.status === 'active') || loansData[0])
          
          // Calculate stats
          calculateLoanStats(loansData)
        }
      }
    } catch (error) {
      console.error('Error loading loans:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadAgreement = async (loanId: string) => {
    try {
      setDownloadingAgreement(true)

      // Call API to generate/fetch agreement
      const response = await fetch(`/api/loans/agreement?loanId=${loanId}`)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to download agreement')
      }

      // Get the HTML content
      const htmlContent = await response.text()

      // Create a blob and download
      const blob = new Blob([htmlContent], { type: 'text/html' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `loan-agreement-${loanId}.html`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error: any) {
      console.error('Error downloading agreement:', error)
      alert(error.message || 'Failed to download loan agreement')
    } finally {
      setDownloadingAgreement(false)
    }
  }

  const calculateLoanStats = (loansData: any[]) => {
    const totalBorrowed = loansData.reduce((sum, loan) => sum + loan.principal_amount, 0)
    const totalRepaid = loansData.reduce((sum, loan) => sum + loan.total_repaid, 0)
    const activeLoans = loansData.filter(l => l.status === 'active').length
    const completedLoans = loansData.filter(l => l.status === 'completed').length
    const totalInterestPaid = loansData.reduce((sum, loan) => {
      const paid = loan.repayment_events?.reduce((s: number, e: any) => 
        e.status === 'completed' ? s + (e.interest_amount || 0) : s, 0) || 0
      return sum + paid
    }, 0)

    setLoanStats({
      totalBorrowed,
      totalRepaid,
      activeLoans,
      completedLoans,
      totalInterestPaid,
      averageAPR: loansData.reduce((sum, loan) => sum + loan.interest_rate, 0) / loansData.length
    })
  }

  useEffect(() => {
    if (selectedLoan) {
      setRepaymentSchedule(selectedLoan.repayment_schedules || [])
      setPaymentHistory(selectedLoan.repayment_events || [])
    }
  }, [selectedLoan])

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      case 'completed': return 'bg-blue-100 text-blue-800'
      case 'defaulted': return 'bg-red-100 text-red-800'
      case 'overdue': return 'bg-orange-100 text-orange-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const calculateLoanProgress = (loan: any) => {
    if (!loan) return 0
    return Math.round((loan.total_repaid / loan.total_amount) * 100)
  }

  const getNextPayment = (loan: any) => {
    if (!loan.repayment_schedules) return null
    const pending = loan.repayment_schedules
      .filter((s: any) => s.status === 'pending')
      .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
    return pending[0]
  }

  const generateRepaymentChart = () => {
    if (!selectedLoan || !selectedLoan.repayment_schedules) return []
    
    return selectedLoan.repayment_schedules.map((schedule: any, index: number) => ({
      month: format(new Date(schedule.due_date), 'MMM'),
      principal: schedule.principal_amount,
      interest: schedule.interest_amount,
      total: schedule.amount,
      status: schedule.status
    }))
  }

  const generatePaymentProgressData = () => {
    if (!selectedLoan) return []

    const paid = selectedLoan.total_repaid
    const remaining = selectedLoan.total_amount - paid

    return [
      { name: 'Paid', value: paid, color: '#10b981' },
      { name: 'Remaining', value: remaining, color: '#e5e7eb' }
    ]
  }

  // NEW: Payment analytics for health score
  const getPaymentAnalytics = (loan: any) => {
    if (!loan || !loan.repayment_schedules) {
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

    const schedules = loan.repayment_schedules
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

  const getRadialChartData = (loan: any) => {
    const analytics = getPaymentAnalytics(loan)
    return [
      {
        name: 'Progress',
        value: analytics.progressPercentage,
        fill: analytics.paymentHealthScore >= 80 ? '#22c55e' :
              analytics.paymentHealthScore >= 60 ? '#eab308' : '#ef4444',
      },
    ]
  }

  // NEW: Overall analytics across all loans
  const getOverallPaymentAnalytics = () => {
    if (loans.length === 0) {
      return {
        totalOnTime: 0,
        totalLate: 0,
        totalOverdue: 0,
        onTimePaymentRate: 0,
        averageHealthScore: 0,
      }
    }

    let totalOnTime = 0
    let totalLate = 0
    let totalOverdue = 0
    let totalPaid = 0

    loans.forEach(loan => {
      const analytics = getPaymentAnalytics(loan)
      totalOnTime += analytics.onTimePayments
      totalLate += analytics.latePayments
      totalOverdue += analytics.overduePayments
      totalPaid += analytics.paidPayments
    })

    const onTimeRate = totalPaid > 0 ? Math.round((totalOnTime / totalPaid) * 100) : 0
    const healthScores = loans.map(l => getPaymentAnalytics(l).paymentHealthScore).filter(s => s > 0)
    const avgHealth = healthScores.length > 0 ? Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length) : 0

    return {
      totalOnTime,
      totalLate,
      totalOverdue,
      onTimePaymentRate: onTimeRate,
      averageHealthScore: avgHealth,
    }
  }

  const getOverallRadialData = () => {
    const overall = getOverallPaymentAnalytics()
    return [
      {
        name: 'Overall',
        value: overall.onTimePaymentRate,
        fill: overall.averageHealthScore >= 80 ? '#22c55e' :
              overall.averageHealthScore >= 60 ? '#eab308' : '#ef4444',
      },
    ]
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const nextPayment = selectedLoan ? getNextPayment(selectedLoan) : null
  const repaymentChartData = generateRepaymentChart()
  const progressData = generatePaymentProgressData()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Loans</h1>
          <p className="text-gray-600 mt-1">
            Manage and track all your loan details and repayments
          </p>
        </div>
        <Button onClick={() => router.push('/b/requests')}>
          <CreditCard className="mr-2 h-4 w-4" />
          Request New Loan
        </Button>
      </div>

      {/* Stats Overview */}
      {loanStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Borrowed</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCurrency(loanStats.totalBorrowed)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Repaid</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(loanStats.totalRepaid)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Interest Paid</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCurrency(loanStats.totalInterestPaid)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Active Loans</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{loanStats.activeLoans}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-blue-600">{loanStats.completedLoans}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Avg. APR</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{loanStats.averageAPR.toFixed(1)}%</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Overall Payment Performance Summary for THIS Borrower - NEW */}
      {loans.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              <CardTitle>My Complete Payment History</CardTitle>
            </div>
            <CardDescription>
              Your permanent payment record across all loans - never deleted, used for credit assessment
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
                      data={getOverallRadialData()}
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
                      {getOverallPaymentAnalytics().onTimePaymentRate}%
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">On-Time Rate</div>
                    <div className="mt-3 flex items-center gap-1">
                      <Award className={`h-5 w-5 ${
                        getOverallPaymentAnalytics().averageHealthScore >= 80 ? 'text-green-600' :
                        getOverallPaymentAnalytics().averageHealthScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                      }`} />
                      <span className={`text-sm font-semibold ${
                        getOverallPaymentAnalytics().averageHealthScore >= 80 ? 'text-green-600' :
                        getOverallPaymentAnalytics().averageHealthScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {getOverallPaymentAnalytics().averageHealthScore}% Health
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Overall Statistics */}
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-green-500" />
                      <span className="text-sm">On-Time Payments</span>
                    </div>
                    <span className="font-semibold">{getOverallPaymentAnalytics().totalOnTime}</span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-yellow-500" />
                      <span className="text-sm">Late Payments</span>
                    </div>
                    <span className="font-semibold">{getOverallPaymentAnalytics().totalLate}</span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-red-500" />
                      <span className="text-sm">Overdue Payments</span>
                    </div>
                    <span className="font-semibold">{getOverallPaymentAnalytics().totalOverdue}</span>
                  </div>
                </div>

                <Alert className="bg-blue-50 border-blue-200 mt-4">
                  <Shield className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-sm text-blue-900">
                    <strong>Permanent Record:</strong> This history stays forever and helps lenders trust you for future loans.
                  </AlertDescription>
                </Alert>

                {getOverallPaymentAnalytics().averageHealthScore >= 80 && (
                  <Alert className="bg-green-50 border-green-200">
                    <Award className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-sm text-green-900">
                      Excellent payment history! Your strong record qualifies you for better loan terms.
                    </AlertDescription>
                  </Alert>
                )}

                {getOverallPaymentAnalytics().averageHealthScore >= 60 && getOverallPaymentAnalytics().averageHealthScore < 80 && (
                  <Alert className="bg-yellow-50 border-yellow-200">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <AlertDescription className="text-sm text-yellow-900">
                      Good record. Keep making on-time payments to improve your score.
                    </AlertDescription>
                  </Alert>
                )}

                {getOverallPaymentAnalytics().averageHealthScore < 60 && (
                  <Alert className="bg-red-50 border-red-200">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-sm text-red-900">
                      Payment issues detected. Contact your lenders to discuss payment options.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {loans.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Loans Yet</h3>
            <p className="text-gray-600 mb-4">You haven't taken any loans yet. Start by requesting a loan.</p>
            <Button onClick={() => router.push('/b/requests')}>
              <CreditCard className="mr-2 h-4 w-4" />
              Request a Loan
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="schedule">Payment Schedule</TabsTrigger>
            <TabsTrigger value="history">Payment History</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Loan Selector */}
            {loans.length > 1 && (
              <div className="flex space-x-2 overflow-x-auto pb-2">
                {loans.map((loan) => (
                  <Button
                    key={loan.id}
                    variant={selectedLoan?.id === loan.id ? 'default' : 'outline'}
                    onClick={() => setSelectedLoan(loan)}
                    className="whitespace-nowrap"
                  >
                    Loan #{loan.id.slice(0, 8)}
                    <Badge className={`ml-2 ${getStatusColor(loan.status)}`}>
                      {loan.status}
                    </Badge>
                  </Button>
                ))}
              </div>
            )}

            {selectedLoan && (
              <>
                {/* Current Loan Details */}
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle>Loan Details</CardTitle>
                        <CardDescription>
                          Loan ID: {selectedLoan.id}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadAgreement(selectedLoan.id)}
                          disabled={downloadingAgreement}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {downloadingAgreement ? 'Downloading...' : 'Agreement'}
                        </Button>
                        <Badge className={getStatusColor(selectedLoan.status)}>
                          {selectedLoan.status}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <p className="text-sm text-gray-600">Principal Amount</p>
                        <p className="text-2xl font-bold">
                          {formatCurrency(selectedLoan.principal_amount, selectedLoan.currency)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Interest Rate</p>
                        <p className="text-2xl font-bold">{selectedLoan.interest_rate}% APR</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Term</p>
                        <p className="text-2xl font-bold">{selectedLoan.term_months} months</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <p className="text-sm text-gray-600">Total Amount</p>
                        <p className="text-xl font-semibold">
                          {formatCurrency(selectedLoan.total_amount, selectedLoan.currency)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Total Repaid</p>
                        <p className="text-xl font-semibold text-green-600">
                          {formatCurrency(selectedLoan.total_repaid, selectedLoan.currency)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Remaining</p>
                        <p className="text-xl font-semibold">
                          {formatCurrency(selectedLoan.total_amount - selectedLoan.total_repaid, selectedLoan.currency)}
                        </p>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>Repayment Progress</span>
                        <span>{calculateLoanProgress(selectedLoan)}%</span>
                      </div>
                      <Progress value={calculateLoanProgress(selectedLoan)} className="h-3" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-600">Lender</p>
                        <p className="font-medium">{selectedLoan.lenders?.business_name}</p>
                        <p className="text-sm text-gray-500">{selectedLoan.lenders?.contact_email}</p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-600">Loan Dates</p>
                        <p className="font-medium">
                          Started: {format(new Date(selectedLoan.created_at), 'MMM dd, yyyy')}
                        </p>
                        <p className="text-sm text-gray-500">
                          Expected End: {format(addMonths(new Date(selectedLoan.created_at), selectedLoan.term_months), 'MMM dd, yyyy')}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Next Payment Alert */}
                {nextPayment && selectedLoan.status === 'active' && (
                  <Alert className={differenceInDays(new Date(nextPayment.due_date), new Date()) < 7 ? 'border-orange-200 bg-orange-50' : ''}>
                    <Calendar className="h-4 w-4" />
                    <AlertTitle>Next Payment Due</AlertTitle>
                    <AlertDescription>
                      <div className="flex justify-between items-center mt-2">
                        <div>
                          <p className="font-semibold text-lg">
                            {formatCurrency(nextPayment.amount, selectedLoan.currency)}
                          </p>
                          <p className="text-sm">
                            Due on {format(new Date(nextPayment.due_date), 'MMMM dd, yyyy')}
                            {' '}({differenceInDays(new Date(nextPayment.due_date), new Date())} days)
                          </p>
                        </div>
                        <Button>Make Payment</Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Payment Performance for This Loan - NEW */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="h-5 w-5" />
                      Payment Performance
                    </CardTitle>
                    <CardDescription>Track your payment health for this loan</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* Circular Progress Chart for Individual Loan */}
                      <div className="flex flex-col items-center justify-center">
                        <div className="relative w-full max-w-[250px] aspect-square">
                          <ResponsiveContainer width="100%" height="100%">
                            <RadialBarChart
                              cx="50%"
                              cy="50%"
                              innerRadius="60%"
                              outerRadius="90%"
                              barSize={35}
                              data={getRadialChartData(selectedLoan)}
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
                            <div className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                              {getPaymentAnalytics(selectedLoan).progressPercentage}%
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">Complete</div>
                            <div className="mt-2 flex items-center gap-1">
                              <Award className={`h-4 w-4 ${
                                getPaymentAnalytics(selectedLoan).paymentHealthScore >= 80 ? 'text-green-600' :
                                getPaymentAnalytics(selectedLoan).paymentHealthScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                              }`} />
                              <span className={`text-xs font-semibold ${
                                getPaymentAnalytics(selectedLoan).paymentHealthScore >= 80 ? 'text-green-600' :
                                getPaymentAnalytics(selectedLoan).paymentHealthScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                              }`}>
                                {getPaymentAnalytics(selectedLoan).paymentHealthScore}% Health
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Payment Statistics for Individual Loan */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-green-500" />
                            <span className="text-sm">On-Time</span>
                          </div>
                          <span className="font-semibold text-sm">{getPaymentAnalytics(selectedLoan).onTimePayments}</span>
                        </div>

                        <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-yellow-500" />
                            <span className="text-sm">Late</span>
                          </div>
                          <span className="font-semibold text-sm">{getPaymentAnalytics(selectedLoan).latePayments}</span>
                        </div>

                        <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-blue-500" />
                            <span className="text-sm">Pending</span>
                          </div>
                          <span className="font-semibold text-sm">{getPaymentAnalytics(selectedLoan).pendingPayments}</span>
                        </div>

                        {getPaymentAnalytics(selectedLoan).overduePayments > 0 && (
                          <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full bg-red-500" />
                              <span className="text-sm">Overdue</span>
                            </div>
                            <span className="font-semibold text-sm">{getPaymentAnalytics(selectedLoan).overduePayments}</span>
                          </div>
                        )}

                        <div className="pt-2 border-t">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-muted-foreground">Payments Made</span>
                            <span className="text-xs font-semibold">
                              {getPaymentAnalytics(selectedLoan).paidPayments} / {getPaymentAnalytics(selectedLoan).totalPayments}
                            </span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                getPaymentAnalytics(selectedLoan).paymentHealthScore >= 80 ? 'bg-green-600' :
                                getPaymentAnalytics(selectedLoan).paymentHealthScore >= 60 ? 'bg-yellow-600' : 'bg-red-600'
                              }`}
                              style={{ width: `${getPaymentAnalytics(selectedLoan).progressPercentage}%` }}
                            />
                          </div>
                        </div>

                        {getPaymentAnalytics(selectedLoan).paymentHealthScore >= 80 && (
                          <Alert className="bg-green-50 border-green-200">
                            <CheckCircle className="h-3 w-3 text-green-600" />
                            <AlertDescription className="text-xs text-green-900">
                              Excellent! Keep it up!
                            </AlertDescription>
                          </Alert>
                        )}

                        {getPaymentAnalytics(selectedLoan).paymentHealthScore >= 60 && getPaymentAnalytics(selectedLoan).paymentHealthScore < 80 && (
                          <Alert className="bg-yellow-50 border-yellow-200">
                            <AlertTriangle className="h-3 w-3 text-yellow-600" />
                            <AlertDescription className="text-xs text-yellow-900">
                              Good progress. Aim for on-time payments.
                            </AlertDescription>
                          </Alert>
                        )}

                        {getPaymentAnalytics(selectedLoan).paymentHealthScore < 60 && (
                          <Alert className="bg-red-50 border-red-200">
                            <AlertTriangle className="h-3 w-3 text-red-600" />
                            <AlertDescription className="text-xs text-red-900">
                              Contact your lender if you need help.
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Repayment Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle>Repayment Breakdown</CardTitle>
                    <CardDescription>Principal vs Interest payments over time</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={repaymentChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis />
                          <Tooltip formatter={(value: any) => formatCurrency(value, selectedLoan.currency)} />
                          <Legend />
                          <Bar dataKey="principal" stackId="a" fill="#3b82f6" name="Principal" />
                          <Bar dataKey="interest" stackId="a" fill="#f59e0b" name="Interest" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Payment Schedule Tab */}
          <TabsContent value="schedule">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Payment Schedule</CardTitle>
                    <CardDescription>
                      Your complete repayment schedule for this loan
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm">
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {repaymentSchedule.length === 0 ? (
                  <p className="text-sm text-gray-500">No payment schedule available</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Payment #</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Principal</TableHead>
                        <TableHead>Interest</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {repaymentSchedule.map((schedule, index) => (
                        <TableRow key={schedule.id}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell>{format(new Date(schedule.due_date), 'MMM dd, yyyy')}</TableCell>
                          <TableCell>{formatCurrency(schedule.principal_amount, selectedLoan?.currency)}</TableCell>
                          <TableCell>{formatCurrency(schedule.interest_amount, selectedLoan?.currency)}</TableCell>
                          <TableCell className="font-semibold">
                            {formatCurrency(schedule.amount, selectedLoan?.currency)}
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(schedule.status)}>
                              {schedule.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {schedule.status === 'pending' && (
                              <Button size="sm">Pay Now</Button>
                            )}
                            {schedule.status === 'paid' && (
                              <Button size="sm" variant="ghost">
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
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
                      All your payment transactions for this loan
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm">
                    <Receipt className="mr-2 h-4 w-4" />
                    Download Receipts
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {paymentHistory.length === 0 ? (
                  <p className="text-sm text-gray-500">No payment history yet</p>
                ) : (
                  <div className="space-y-4">
                    {paymentHistory.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center space-x-4">
                          {payment.status === 'completed' ? (
                            <CheckCircle className="h-8 w-8 text-green-500" />
                          ) : payment.status === 'pending' ? (
                            <Clock className="h-8 w-8 text-yellow-500" />
                          ) : (
                            <AlertCircle className="h-8 w-8 text-red-500" />
                          )}
                          <div>
                            <p className="font-medium">
                              {formatCurrency(payment.amount, selectedLoan?.currency)} Payment
                            </p>
                            <p className="text-sm text-gray-600">
                              {format(new Date(payment.created_at), 'MMMM dd, yyyy at h:mm a')}
                            </p>
                            {payment.transaction_reference && (
                              <p className="text-xs text-gray-500">
                                Ref: {payment.transaction_reference}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge className={getStatusColor(payment.status)}>
                            {payment.status}
                          </Badge>
                          <Button size="sm" variant="ghost" className="mt-2">
                            <Download className="h-4 w-4 mr-1" />
                            Receipt
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents">
            <Card>
              <CardHeader>
                <CardTitle>Loan Documents</CardTitle>
                <CardDescription>
                  All documents related to your loan
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <FileText className="h-8 w-8 text-blue-500" />
                      <div>
                        <p className="font-medium">Loan Agreement</p>
                        <p className="text-sm text-gray-600">Signed on {format(new Date(selectedLoan?.created_at || new Date()), 'MMM dd, yyyy')}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline">
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <FileText className="h-8 w-8 text-green-500" />
                      <div>
                        <p className="font-medium">Repayment Schedule</p>
                        <p className="text-sm text-gray-600">Generated on {format(new Date(selectedLoan?.created_at || new Date()), 'MMM dd, yyyy')}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline">
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <FileText className="h-8 w-8 text-purple-500" />
                      <div>
                        <p className="font-medium">Terms & Conditions</p>
                        <p className="text-sm text-gray-600">Version 1.0</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline">
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}