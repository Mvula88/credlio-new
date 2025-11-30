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
import {
  TrendingUp,
  TrendingDown,
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  Calendar,
  DollarSign,
  FileText,
  Shield,
  Star,
  Info,
  Target,
  Award,
  ChevronUp,
  ChevronDown,
  Minus,
  BarChart3,
  PieChart,
  CreditCard,
  History,
  ArrowUpRight,
  ArrowDownRight,
  Flag,
  AlertTriangle,
  Users
} from 'lucide-react'
import { format, subMonths } from 'date-fns'
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
  RadialBar
} from 'recharts'

export default function CreditScorePage() {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [borrower, setBorrower] = useState<any>(null)
  const [creditScore, setCreditScore] = useState<any>(null)
  const [scoreHistory, setScoreHistory] = useState<any[]>([])
  const [paymentHistory, setPaymentHistory] = useState<any[]>([])
  const [creditUtilization, setCreditUtilization] = useState<any>(null)
  const [recommendations, setRecommendations] = useState<any[]>([])
  const [riskFlags, setRiskFlags] = useState<any[]>([])
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadCreditData()
  }, [])

  const loadCreditData = async () => {
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

      // Get borrower record with credit score
      const { data: borrowerData } = await supabase
        .from('borrowers')
        .select(`
          *,
          borrower_scores(
            score,
            factors,
            updated_at
          )
        `)
        .eq('user_id', user.id)
        .single()

      if (borrowerData) {
        setBorrower(borrowerData)

        // Get or calculate real credit score
        let score = borrowerData.borrower_scores?.[0]
        if (!score) {
          // Calculate score if it doesn't exist
          const { data: calculatedScore } = await supabase.rpc('calculate_borrower_score', {
            p_borrower_id: borrowerData.id
          })

          // Fetch the newly calculated score
          const { data: freshScore } = await supabase
            .from('borrower_scores')
            .select('*')
            .eq('borrower_id', borrowerData.id)
            .single()

          score = freshScore || { score: 600, score_factors: {}, updated_at: new Date().toISOString() }
        }
        setCreditScore(score)

        // Build real score history from repayment events
        const history = await buildScoreHistory(borrowerData.id)
        setScoreHistory(history)

        // Get payment history
        const { data: payments } = await supabase
          .from('repayment_events')
          .select(`
            *,
            loans(
              currency,
              principal_amount
            )
          `)
          .eq('loans.borrower_id', borrowerData.id)
          .order('created_at', { ascending: false })
          .limit(12)

        setPaymentHistory(payments || [])

        // Load risk flags for this borrower
        const { data: flagsData } = await supabase
          .from('risk_flags')
          .select('*')
          .eq('borrower_id', borrowerData.id)
          .order('created_at', { ascending: false })

        setRiskFlags(flagsData || [])

        // Calculate credit utilization
        const { data: loans } = await supabase
          .from('loans')
          .select('*')
          .eq('borrower_id', borrowerData.id)
          .in('status', ['active', 'completed'])

        const utilization = calculateUtilization(loans || [], borrowerData)
        setCreditUtilization(utilization)

        // Generate recommendations
        const recs = generateRecommendations(borrowerData.borrower_scores?.[0]?.score || 650)
        setRecommendations(recs)
      }
    } catch (error) {
      console.error('Error loading credit data:', error)
    } finally {
      setLoading(false)
    }
  }

  const buildScoreHistory = async (borrowerId: string) => {
    // Get all loans with their repayment data to build historical trend
    const { data: loans } = await supabase
      .from('loans')
      .select(`
        *,
        repayment_events(*)
      `)
      .eq('borrower_id', borrowerId)
      .order('created_at', { ascending: true })

    if (!loans || loans.length === 0) {
      // No loan history - return current score only
      return [{
        month: format(new Date(), 'MMM'),
        score: creditScore?.score || 600,
        change: 0
      }]
    }

    const history = []
    let currentScore = 700 // Base score

    // Track score changes over last 12 months
    for (let i = 11; i >= 0; i--) {
      const monthDate = subMonths(new Date(), i)
      const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)

      // Count late payments in this month
      let latePaymentsInMonth = 0
      loans.forEach(loan => {
        const events = loan.repayment_events || []
        events.forEach((event: any) => {
          const eventDate = new Date(event.created_at)
          if (eventDate >= monthStart && eventDate <= monthEnd && event.days_late > 0) {
            latePaymentsInMonth++
            // Deduct points based on lateness
            if (event.days_late <= 7) currentScore -= 10
            else if (event.days_late <= 30) currentScore -= 35
            else currentScore -= 70
          }
        })
      })

      // Apply floor
      currentScore = Math.max(currentScore, 300)

      const prevScore = history[history.length - 1]?.score || 700
      history.push({
        month: format(monthDate, 'MMM'),
        score: currentScore,
        change: currentScore - prevScore
      })
    }

    return history
  }

  const calculateUtilization = (loans: any[], borrower: any) => {
    const totalCredit = borrower.credit_limit || 100000
    const totalUsed = loans
      .filter(l => l.status === 'active')
      .reduce((sum, loan) => sum + loan.principal_amount, 0)
    
    return {
      used: totalUsed,
      available: totalCredit - totalUsed,
      limit: totalCredit,
      percentage: Math.round((totalUsed / totalCredit) * 100)
    }
  }

  const generateRecommendations = (score: number) => {
    const recs = []
    
    if (score < 700) {
      recs.push({
        title: 'Make All Payments On Time',
        description: 'Payment history accounts for 35% of your credit score. Set up automatic payments to never miss a due date.',
        impact: 'High',
        icon: Clock,
        color: 'text-red-600'
      })
    }
    
    if (score < 750) {
      recs.push({
        title: 'Reduce Credit Utilization',
        description: 'Keep your credit utilization below 30%. Currently using more than recommended.',
        impact: 'Medium',
        icon: TrendingDown,
        color: 'text-yellow-600'
      })
    }

    recs.push({
      title: 'Build Credit History',
      description: 'Maintain accounts in good standing for longer periods to improve your credit age.',
      impact: 'Low',
      icon: Calendar,
      color: 'text-blue-600'
    })

    recs.push({
      title: 'Diversify Credit Mix',
      description: 'Having different types of credit accounts can improve your score.',
      impact: 'Low',
      icon: PieChart,
      color: 'text-purple-600'
    })

    return recs
  }

  const getCreditScoreColor = (score: number) => {
    if (score >= 750) return '#10b981' // green
    if (score >= 700) return '#84cc16' // lime
    if (score >= 650) return '#eab308' // yellow
    if (score >= 550) return '#f97316' // orange
    return '#ef4444' // red
  }

  const getCreditScoreLabel = (score: number) => {
    if (score >= 750) return 'Excellent'
    if (score >= 700) return 'Good'
    if (score >= 650) return 'Fair'
    if (score >= 550) return 'Below Average'
    return 'Poor'
  }

  const getScoreChange = () => {
    if (scoreHistory.length < 2) return { value: 0, trend: 'neutral' }
    const current = scoreHistory[scoreHistory.length - 1].score
    const previous = scoreHistory[scoreHistory.length - 2].score
    const change = current - previous
    return {
      value: change,
      trend: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral'
    }
  }

  const scoreFactorsData = creditScore?.factors ? 
    Object.entries(creditScore.factors).map(([key, value]) => ({
      name: key.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
      value: value as number,
      fullMark: 100
    })) : []

  const utilizationData = creditUtilization ? [
    { name: 'Used', value: creditUtilization.used, color: '#ef4444' },
    { name: 'Available', value: creditUtilization.available, color: '#10b981' }
  ] : []

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const scoreChange = getScoreChange()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Credit Score & Report</h1>
        <p className="text-gray-600 mt-1">
          Monitor your credit health and get personalized recommendations
        </p>
      </div>

      {/* Main Score Card */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-white">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-blue-100 text-sm">Your Credit Score</p>
              <div className="flex items-baseline space-x-3 mt-2">
                <span className="text-6xl font-bold">{creditScore?.score || 650}</span>
                <span className="text-2xl opacity-75">/ 850</span>
              </div>
              <div className="flex items-center space-x-2 mt-3">
                <Badge className="bg-white/20 text-white hover:bg-white/30">
                  {getCreditScoreLabel(creditScore?.score || 650)}
                </Badge>
                <div className="flex items-center">
                  {scoreChange.trend === 'up' ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : scoreChange.trend === 'down' ? (
                    <ChevronDown className="h-5 w-5" />
                  ) : (
                    <Minus className="h-5 w-5" />
                  )}
                  <span className="text-sm">
                    {scoreChange.value > 0 ? '+' : ''}{scoreChange.value} from last month
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-blue-100 text-sm">Last Updated</p>
              <p className="font-semibold">
                {creditScore?.updated_at ? 
                  format(new Date(creditScore.updated_at), 'MMM dd, yyyy') : 
                  'Today'
                }
              </p>
              <Button 
                size="sm" 
                variant="secondary"
                className="mt-3"
                onClick={() => window.print()}
              >
                <FileText className="mr-2 h-4 w-4" />
                Download Report
              </Button>
            </div>
          </div>
        </div>

        {/* Score Gauge */}
        <CardContent className="pt-6">
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart 
                cx="50%" 
                cy="50%" 
                innerRadius="60%" 
                outerRadius="90%" 
                data={[{ value: creditScore?.score || 650, fill: getCreditScoreColor(creditScore?.score || 650) }]}
                startAngle={180} 
                endAngle={0}
              >
                <RadialBar dataKey="value" cornerRadius={10} max={850} />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for Different Sections */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="factors">Score Factors</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="recommendations">Tips</TabsTrigger>
          <TabsTrigger value="simulator">Simulator</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Payment History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline space-x-2">
                  <span className="text-2xl font-bold">98%</span>
                  <span className="text-sm text-green-600">On-time</span>
                </div>
                <Progress value={98} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Credit Utilization
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline space-x-2">
                  <span className="text-2xl font-bold">
                    {creditUtilization?.percentage || 25}%
                  </span>
                  <span className="text-sm text-yellow-600">Used</span>
                </div>
                <Progress value={creditUtilization?.percentage || 25} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Credit Age
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline space-x-2">
                  <span className="text-2xl font-bold">2.5</span>
                  <span className="text-sm text-gray-600">Years</span>
                </div>
                <Progress value={60} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Total Accounts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline space-x-2">
                  <span className="text-2xl font-bold">3</span>
                  <span className="text-sm text-gray-600">Active</span>
                </div>
                <Progress value={75} className="mt-2" />
              </CardContent>
            </Card>
          </div>

          {/* Score Trend Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Score Trend</CardTitle>
              <CardDescription>Your credit score over the last 12 months</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={scoreHistory}>
                    <defs>
                      <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis domain={[500, 850]} />
                    <Tooltip />
                    <Area 
                      type="monotone" 
                      dataKey="score" 
                      stroke="#3b82f6" 
                      fill="url(#scoreGradient)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Risk Flags Section */}
          <Card className={riskFlags.length > 0 ? "border-2 border-red-200" : ""}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Flag className="h-5 w-5" />
                    Risk Flags & Reports
                  </CardTitle>
                  <CardDescription>
                    Reports from lenders about payment issues or defaults
                  </CardDescription>
                </div>
                <Badge
                  variant={riskFlags.filter(f => !f.resolved_at).length > 0 ? "destructive" : "outline"}
                  className="text-lg px-3 py-1"
                >
                  {riskFlags.filter(f => !f.resolved_at).length} Active
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {riskFlags.length === 0 ? (
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-900">
                    <strong>Great news!</strong> You have no risk flags. Keep up your good payment behavior!
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-3">
                  {riskFlags.map((flag) => {
                    const isResolved = !!flag.resolved_at
                    const isDefault = flag.type === 'DEFAULT'

                    const getRiskBadge = (type: string) => {
                      const badges: Record<string, { label: string; className: string }> = {
                        'LATE_1_7': { label: 'Late 1-7 days', className: 'bg-yellow-100 text-yellow-800' },
                        'LATE_8_30': { label: 'Late 8-30 days', className: 'bg-orange-100 text-orange-800' },
                        'LATE_31_60': { label: 'Late 31-60 days', className: 'bg-red-100 text-red-800' },
                        'DEFAULT': { label: 'Default', className: 'bg-red-600 text-white' },
                        'CLEARED': { label: 'Cleared', className: 'bg-green-100 text-green-800' },
                      }
                      return badges[type] || { label: type, className: 'bg-gray-100 text-gray-800' }
                    }

                    const badge = getRiskBadge(flag.type)

                    return (
                      <div
                        key={flag.id}
                        className={`p-4 rounded-lg border-2 ${
                          isResolved
                            ? 'bg-gray-50 border-gray-200'
                            : isDefault
                            ? 'bg-red-50 border-red-300'
                            : 'bg-orange-50 border-orange-200'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className={badge.className}>
                                {badge.label}
                              </Badge>
                              <Badge variant={flag.origin === 'LENDER_REPORTED' ? 'default' : 'secondary'}>
                                {flag.origin === 'LENDER_REPORTED' ? (
                                  <>
                                    <Users className="h-3 w-3 mr-1" />
                                    Lender Reported
                                  </>
                                ) : (
                                  'System Auto'
                                )}
                              </Badge>
                              {isResolved && (
                                <Badge className="bg-green-100 text-green-800">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Resolved
                                </Badge>
                              )}
                            </div>

                            <p className="text-sm text-gray-900 font-medium mb-1">
                              {flag.reason}
                            </p>

                            <div className="flex items-center gap-4 text-xs text-gray-600 mt-2">
                              <span>
                                Reported: {format(new Date(flag.created_at), 'MMM d, yyyy')}
                              </span>
                              {flag.amount_at_issue_minor && (
                                <span>
                                  Amount: ${(flag.amount_at_issue_minor / 100).toFixed(2)}
                                </span>
                              )}
                            </div>

                            {flag.resolved_at && (
                              <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs">
                                <strong className="text-green-900">Resolved:</strong>{' '}
                                <span className="text-green-700">
                                  {format(new Date(flag.resolved_at), 'MMM d, yyyy')}
                                  {flag.resolution_reason && ` - ${flag.resolution_reason}`}
                                </span>
                              </div>
                            )}
                          </div>

                          {isDefault && !isResolved && (
                            <div className="ml-4">
                              <Badge variant="destructive" className="text-xs">
                                HIGH RISK
                              </Badge>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {riskFlags.filter(f => !f.resolved_at).length > 0 && (
                    <Alert className="bg-yellow-50 border-yellow-200 mt-4">
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      <AlertDescription className="text-yellow-900">
                        <strong>Active flags affect your credit score.</strong> Work with lenders to resolve outstanding issues.
                        When resolved, flags will remain in your history but marked as "Resolved".
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Score Factors Tab */}
        <TabsContent value="factors" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>What Makes Up Your Score</CardTitle>
              <CardDescription>
                Understanding the factors that influence your credit score
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Factors Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="font-medium">Payment History</span>
                      <span className="text-sm text-gray-600">35%</span>
                    </div>
                    <Progress value={35} className="h-3" />
                    <p className="text-sm text-gray-600">
                      Your track record of on-time payments
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="font-medium">Credit Utilization</span>
                      <span className="text-sm text-gray-600">30%</span>
                    </div>
                    <Progress value={30} className="h-3" />
                    <p className="text-sm text-gray-600">
                      How much credit you use vs. available credit
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="font-medium">Credit Age</span>
                      <span className="text-sm text-gray-600">15%</span>
                    </div>
                    <Progress value={15} className="h-3" />
                    <p className="text-sm text-gray-600">
                      Length of your credit history
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="font-medium">Credit Mix</span>
                      <span className="text-sm text-gray-600">10%</span>
                    </div>
                    <Progress value={10} className="h-3" />
                    <p className="text-sm text-gray-600">
                      Variety of credit accounts you have
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="font-medium">New Inquiries</span>
                      <span className="text-sm text-gray-600">10%</span>
                    </div>
                    <Progress value={10} className="h-3" />
                    <p className="text-sm text-gray-600">
                      Recent credit checks and new accounts
                    </p>
                  </div>
                </div>
              </div>

              {/* Pie Chart */}
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={scoreFactorsData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.name}: ${entry.value}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {scoreFactorsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'][index % 5]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Payment History</CardTitle>
              <CardDescription>Your recent payment activity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {paymentHistory.length === 0 ? (
                  <p className="text-sm text-gray-500">No payment history yet</p>
                ) : (
                  paymentHistory.map((payment) => (
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
                            ${payment.amount} Payment
                          </p>
                          <p className="text-sm text-gray-600">
                            {format(new Date(payment.created_at), 'MMMM dd, yyyy')}
                          </p>
                        </div>
                      </div>
                      <Badge 
                        className={
                          payment.status === 'completed' 
                            ? 'bg-green-100 text-green-800' 
                            : payment.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }
                      >
                        {payment.status}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Credit Accounts */}
          <Card>
            <CardHeader>
              <CardTitle>Credit Accounts</CardTitle>
              <CardDescription>All your credit accounts and their status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">Personal Loan #1</p>
                      <p className="text-sm text-gray-600">Opened: Jan 2023</p>
                    </div>
                    <Badge className="bg-green-100 text-green-800">Active</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Balance</p>
                      <p className="font-medium">$5,000</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Limit</p>
                      <p className="font-medium">$10,000</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Payment</p>
                      <p className="font-medium text-green-600">On Time</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recommendations Tab */}
        <TabsContent value="recommendations" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {recommendations.map((rec, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center">
                      <rec.icon className={`mr-2 h-5 w-5 ${rec.color}`} />
                      {rec.title}
                    </span>
                    <Badge variant={rec.impact === 'High' ? 'destructive' : rec.impact === 'Medium' ? 'default' : 'secondary'}>
                      {rec.impact} Impact
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">{rec.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Educational Content */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Award className="mr-2 h-5 w-5 text-yellow-500" />
                Credit Score Goals
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Target className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium">Excellent (750-850)</p>
                      <p className="text-sm text-gray-600">Best rates and terms available</p>
                    </div>
                  </div>
                  <ChevronUp className="h-5 w-5 text-green-600" />
                </div>

                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Star className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="font-medium">Good (700-749)</p>
                      <p className="text-sm text-gray-600">Competitive rates available</p>
                    </div>
                  </div>
                  <ArrowUpRight className="h-5 w-5 text-blue-600" />
                </div>

                <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Info className="h-5 w-5 text-yellow-600" />
                    <div>
                      <p className="font-medium">Fair (650-699)</p>
                      <p className="text-sm text-gray-600">Standard rates, room for improvement</p>
                    </div>
                  </div>
                  <Minus className="h-5 w-5 text-yellow-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Score Simulator Tab */}
        <TabsContent value="simulator" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Credit Score Simulator</CardTitle>
              <CardDescription>
                See how different actions could impact your credit score
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>How it works</AlertTitle>
                <AlertDescription>
                  This simulator shows estimated impacts on your credit score based on typical scenarios. 
                  Actual results may vary based on your complete credit profile.
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <div className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">Pay all bills on time for 6 months</p>
                      <p className="text-sm text-gray-600">Consistent on-time payments</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-green-600">+40</p>
                      <p className="text-sm text-gray-600">points</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">Pay off 50% of credit card debt</p>
                      <p className="text-sm text-gray-600">Reduce utilization to 15%</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-green-600">+25</p>
                      <p className="text-sm text-gray-600">points</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">Open a new credit account</p>
                      <p className="text-sm text-gray-600">Hard inquiry impact</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-red-600">-5</p>
                      <p className="text-sm text-gray-600">points</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">Miss a payment</p>
                      <p className="text-sm text-gray-600">30 days late</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-red-600">-80</p>
                      <p className="text-sm text-gray-600">points</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="font-medium text-blue-900">Your Simulated Score</p>
                <div className="flex items-baseline space-x-2 mt-2">
                  <span className="text-3xl font-bold text-blue-600">
                    {creditScore?.score || 650}
                  </span>
                  <ArrowUpRight className="h-5 w-5 text-green-600" />
                  <span className="text-xl font-bold text-green-600">
                    {creditScore?.score ? creditScore.score + 40 : 690}
                  </span>
                </div>
                <p className="text-sm text-blue-700 mt-2">
                  Following recommended actions could improve your score significantly
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}