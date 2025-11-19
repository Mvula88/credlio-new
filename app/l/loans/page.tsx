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
  Loader2
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
  })
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
      const { data: loanData, error } = await supabase
        .from('loans')
        .select(`
          *,
          borrowers(
            full_name,
            phone_e164,
            borrower_scores(score)
          ),
          repayment_schedules(
            id,
            due_date,
            amount_due_minor,
            installment_no,
            principal_minor,
            interest_minor
          )
        `)
        .eq('lender_id', lender.user_id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading loans:', error)
        console.error('Error details:', JSON.stringify(error, null, 2))
        toast.error('Failed to load loans. Please try refreshing the page.')
        setLoading(false)
        return
      }

      setLoans(loanData || [])

      // Calculate stats - convert from minor units to major units
      const statsData = {
        total: loanData?.length || 0,
        active: loanData?.filter(l => l.status === 'active').length || 0,
        completed: loanData?.filter(l => l.status === 'completed').length || 0,
        defaulted: loanData?.filter(l => l.status === 'defaulted').length || 0,
        totalDisbursed: loanData?.reduce((sum, l) => sum + (l.principal_minor || 0), 0) || 0,
        totalRepaid: 0, // This would need to be calculated from repayment_events
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

  const calculateProgress = (loan: any) => {
    const schedules = loan.repayment_schedules || []
    if (schedules.length === 0) return 0

    const paidSchedules = schedules.filter((s: any) => s.status === 'paid').length
    return Math.round((paidSchedules / schedules.length) * 100)
  }

  const getNextPayment = (loan: any) => {
    // Get the earliest schedule by due_date
    const schedules = loan.repayment_schedules || []
    if (schedules.length === 0) return null

    // Sort by installment_no and get the first one
    const sorted = [...schedules].sort((a, b) => a.installment_no - b.installment_no)
    return sorted[0]
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
            <TabsList>
              <TabsTrigger value="all">All Loans ({stats.total})</TabsTrigger>
              <TabsTrigger value="active">Active ({stats.active})</TabsTrigger>
              <TabsTrigger value="completed">Completed ({stats.completed})</TabsTrigger>
              <TabsTrigger value="defaulted">Defaulted ({stats.defaulted})</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-4">
              <LoanTable loans={loans} formatCurrency={formatCurrency} getStatusBadge={getStatusBadge} calculateProgress={calculateProgress} getNextPayment={getNextPayment} router={router} />
            </TabsContent>

            <TabsContent value="active" className="space-y-4">
              <LoanTable loans={loans.filter(l => l.status === 'active')} formatCurrency={formatCurrency} getStatusBadge={getStatusBadge} calculateProgress={calculateProgress} getNextPayment={getNextPayment} router={router} />
            </TabsContent>

            <TabsContent value="completed" className="space-y-4">
              <LoanTable loans={loans.filter(l => l.status === 'completed')} formatCurrency={formatCurrency} getStatusBadge={getStatusBadge} calculateProgress={calculateProgress} getNextPayment={getNextPayment} router={router} />
            </TabsContent>

            <TabsContent value="defaulted" className="space-y-4">
              <LoanTable loans={loans.filter(l => l.status === 'defaulted')} formatCurrency={formatCurrency} getStatusBadge={getStatusBadge} calculateProgress={calculateProgress} getNextPayment={getNextPayment} router={router} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}

function LoanTable({ loans, formatCurrency, getStatusBadge, calculateProgress, getNextPayment, router }: any) {
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
                  {nextPayment ? (
                    <div>
                      <p className="text-sm font-medium">
                        {formatCurrency(nextPayment.amount_due_minor || 0)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {format(new Date(nextPayment.due_date), 'MMM dd')}
                      </p>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-500">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(`/l/loans/${loan.id}`)}
                  >
                    View
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
