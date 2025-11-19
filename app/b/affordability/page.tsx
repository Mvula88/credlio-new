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
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Calculator,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Info,
  Home,
  Car,
  ShoppingCart,
  Utensils,
  Heart,
  GraduationCap,
  Smartphone,
  Zap,
  Shield,
  PiggyBank,
  Target,
  ChevronRight,
  Wallet,
  Receipt,
  FileText,
  BarChart3,
  PieChart
} from 'lucide-react'
import { format } from 'date-fns'
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadialBarChart,
  RadialBar
} from 'recharts'

export default function AffordabilityCalculatorPage() {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [borrower, setBorrower] = useState<any>(null)
  const [creditScore, setCreditScore] = useState<any>(null)
  const router = useRouter()
  const supabase = createClient()

  // Income State
  const [monthlyIncome, setMonthlyIncome] = useState(5000)
  const [additionalIncome, setAdditionalIncome] = useState(0)
  const [incomeFrequency, setIncomeFrequency] = useState('monthly')

  // Expenses State
  const [expenses, setExpenses] = useState({
    housing: 1500,
    transportation: 400,
    food: 600,
    utilities: 200,
    insurance: 300,
    debt: 500,
    entertainment: 200,
    savings: 500,
    other: 300
  })

  // Loan Parameters
  const [loanAmount, setLoanAmount] = useState(10000)
  const [loanTerm, setLoanTerm] = useState(12)
  const [interestRate, setInterestRate] = useState(15)

  // Calculation Results
  const [affordability, setAffordability] = useState<any>(null)
  const [recommendation, setRecommendation] = useState<any>(null)

  useEffect(() => {
    loadUserData()
  }, [])

  useEffect(() => {
    calculateAffordability()
  }, [monthlyIncome, additionalIncome, expenses, loanAmount, loanTerm, interestRate])

  const loadUserData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/b/login')
        return
      }

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
        setCreditScore(borrowerData.borrower_scores?.[0])
        
        // Set interest rate based on credit score
        if (borrowerData.borrower_scores?.[0]?.score) {
          const score = borrowerData.borrower_scores[0].score
          if (score >= 750) setInterestRate(10)
          else if (score >= 700) setInterestRate(12)
          else if (score >= 650) setInterestRate(15)
          else if (score >= 600) setInterestRate(18)
          else setInterestRate(22)
        }
      }
    } catch (error) {
      console.error('Error loading user data:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateAffordability = () => {
    const totalIncome = monthlyIncome + additionalIncome
    const totalExpenses = Object.values(expenses).reduce((sum, val) => sum + val, 0)
    const disposableIncome = totalIncome - totalExpenses
    
    // Calculate monthly payment for the loan
    const monthlyRate = interestRate / 100 / 12
    const numPayments = loanTerm
    const monthlyPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / 
                          (Math.pow(1 + monthlyRate, numPayments) - 1)
    
    const totalInterest = (monthlyPayment * numPayments) - loanAmount
    const totalRepayment = loanAmount + totalInterest
    
    // Debt-to-Income Ratio
    const currentDTI = ((totalExpenses - expenses.savings) / totalIncome) * 100
    const newDTI = ((totalExpenses - expenses.savings + monthlyPayment) / totalIncome) * 100
    
    // Affordability Score (0-100)
    let affordabilityScore = 100
    if (newDTI > 50) affordabilityScore = 30
    else if (newDTI > 40) affordabilityScore = 50
    else if (newDTI > 30) affordabilityScore = 70
    else if (newDTI > 20) affordabilityScore = 85
    
    // Can afford this loan?
    const canAfford = disposableIncome >= monthlyPayment * 1.2 // 20% buffer
    
    // Maximum affordable loan
    const maxAffordablePayment = disposableIncome * 0.8 // Keep 20% buffer
    const maxLoan = maxAffordablePayment * 
                   (Math.pow(1 + monthlyRate, numPayments) - 1) / 
                   (monthlyRate * Math.pow(1 + monthlyRate, numPayments))
    
    setAffordability({
      totalIncome,
      totalExpenses,
      disposableIncome,
      monthlyPayment: Math.round(monthlyPayment),
      totalInterest: Math.round(totalInterest),
      totalRepayment: Math.round(totalRepayment),
      currentDTI: Math.round(currentDTI),
      newDTI: Math.round(newDTI),
      affordabilityScore,
      canAfford,
      maxLoan: Math.round(maxLoan)
    })
    
    // Generate recommendation
    generateRecommendation(canAfford, newDTI, disposableIncome, monthlyPayment)
  }

  const generateRecommendation = (canAfford: boolean, dti: number, disposable: number, payment: number) => {
    let status = 'good'
    let title = 'You can afford this loan'
    let description = 'Your financial situation supports this loan comfortably.'
    let suggestions = []
    
    if (!canAfford) {
      status = 'bad'
      title = 'This loan may strain your finances'
      description = 'The monthly payment exceeds your comfortable disposable income.'
      suggestions = [
        'Consider a smaller loan amount',
        'Extend the loan term to reduce monthly payments',
        'Review and reduce your monthly expenses',
        'Increase your income sources'
      ]
    } else if (dti > 40) {
      status = 'warning'
      title = 'Proceed with caution'
      description = 'While affordable, this loan will significantly increase your debt burden.'
      suggestions = [
        'Build an emergency fund first',
        'Consider paying off existing debt',
        'Look for better interest rates'
      ]
    } else {
      suggestions = [
        'Set up automatic payments to avoid missing due dates',
        'Consider paying extra to reduce interest',
        'Keep building your emergency fund'
      ]
    }
    
    setRecommendation({
      status,
      title,
      description,
      suggestions
    })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const expenseCategories = [
    { name: 'Housing', value: expenses.housing, icon: Home, color: '#3b82f6' },
    { name: 'Transportation', value: expenses.transportation, icon: Car, color: '#10b981' },
    { name: 'Food', value: expenses.food, icon: Utensils, color: '#f59e0b' },
    { name: 'Utilities', value: expenses.utilities, icon: Zap, color: '#8b5cf6' },
    { name: 'Insurance', value: expenses.insurance, icon: Shield, color: '#ef4444' },
    { name: 'Debt', value: expenses.debt, icon: Receipt, color: '#ec4899' },
    { name: 'Entertainment', value: expenses.entertainment, icon: Heart, color: '#14b8a6' },
    { name: 'Savings', value: expenses.savings, icon: PiggyBank, color: '#84cc16' },
    { name: 'Other', value: expenses.other, icon: ShoppingCart, color: '#6b7280' }
  ]

  const budgetData = expenseCategories.map(cat => ({
    name: cat.name,
    value: cat.value,
    percentage: Math.round((cat.value / (monthlyIncome + additionalIncome)) * 100)
  }))

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
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Affordability Calculator</h1>
        <p className="text-gray-600 mt-1">
          Calculate how much you can afford to borrow based on your income and expenses
        </p>
      </div>

      {/* Main Calculator */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Section */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="income" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="income">Income</TabsTrigger>
              <TabsTrigger value="expenses">Expenses</TabsTrigger>
              <TabsTrigger value="loan">Loan Details</TabsTrigger>
            </TabsList>

            {/* Income Tab */}
            <TabsContent value="income">
              <Card>
                <CardHeader>
                  <CardTitle>Monthly Income</CardTitle>
                  <CardDescription>Enter all your sources of income</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <Label htmlFor="monthly-income">Primary Income</Label>
                    <div className="flex items-center space-x-2 mt-2">
                      <DollarSign className="h-5 w-5 text-gray-400" />
                      <Input
                        id="monthly-income"
                        type="number"
                        value={monthlyIncome}
                        onChange={(e) => setMonthlyIncome(Number(e.target.value))}
                        className="text-lg"
                      />
                    </div>
                    <div className="mt-2">
                      <Slider
                        value={[monthlyIncome]}
                        onValueChange={(value) => setMonthlyIncome(value[0])}
                        min={0}
                        max={20000}
                        step={100}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="additional-income">Additional Income</Label>
                    <div className="flex items-center space-x-2 mt-2">
                      <DollarSign className="h-5 w-5 text-gray-400" />
                      <Input
                        id="additional-income"
                        type="number"
                        value={additionalIncome}
                        onChange={(e) => setAdditionalIncome(Number(e.target.value))}
                        className="text-lg"
                      />
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Include bonuses, freelance income, investments, etc.
                    </p>
                  </div>

                  <div className="p-4 bg-green-50 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Total Monthly Income</span>
                      <span className="text-2xl font-bold text-green-600">
                        {formatCurrency(monthlyIncome + additionalIncome)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Expenses Tab */}
            <TabsContent value="expenses">
              <Card>
                <CardHeader>
                  <CardTitle>Monthly Expenses</CardTitle>
                  <CardDescription>Track where your money goes each month</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {expenseCategories.map((category) => (
                    <div key={category.name}>
                      <div className="flex items-center justify-between mb-2">
                        <Label className="flex items-center">
                          <category.icon className="h-4 w-4 mr-2" style={{ color: category.color }} />
                          {category.name}
                        </Label>
                        <span className="font-medium">{formatCurrency(category.value)}</span>
                      </div>
                      <Slider
                        value={[category.value]}
                        onValueChange={(value) => 
                          setExpenses(prev => ({
                            ...prev,
                            [category.name.toLowerCase()]: value[0]
                          }))
                        }
                        min={0}
                        max={3000}
                        step={50}
                        className="mb-4"
                      />
                    </div>
                  ))}

                  <div className="p-4 bg-red-50 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Total Monthly Expenses</span>
                      <span className="text-2xl font-bold text-red-600">
                        {formatCurrency(Object.values(expenses).reduce((sum, val) => sum + val, 0))}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Loan Details Tab */}
            <TabsContent value="loan">
              <Card>
                <CardHeader>
                  <CardTitle>Loan Parameters</CardTitle>
                  <CardDescription>Adjust loan details to see affordability</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <Label htmlFor="loan-amount">Loan Amount</Label>
                    <div className="flex items-center space-x-2 mt-2">
                      <DollarSign className="h-5 w-5 text-gray-400" />
                      <Input
                        id="loan-amount"
                        type="number"
                        value={loanAmount}
                        onChange={(e) => setLoanAmount(Number(e.target.value))}
                        className="text-lg"
                      />
                    </div>
                    <div className="mt-2">
                      <Slider
                        value={[loanAmount]}
                        onValueChange={(value) => setLoanAmount(value[0])}
                        min={1000}
                        max={50000}
                        step={500}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="loan-term">Loan Term (Months)</Label>
                    <Select value={loanTerm.toString()} onValueChange={(value) => setLoanTerm(Number(value))}>
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="6">6 months</SelectItem>
                        <SelectItem value="12">12 months</SelectItem>
                        <SelectItem value="18">18 months</SelectItem>
                        <SelectItem value="24">24 months</SelectItem>
                        <SelectItem value="36">36 months</SelectItem>
                        <SelectItem value="48">48 months</SelectItem>
                        <SelectItem value="60">60 months</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="interest-rate">Interest Rate (%)</Label>
                    <div className="flex items-center justify-between mt-2">
                      <Input
                        id="interest-rate"
                        type="number"
                        value={interestRate}
                        onChange={(e) => setInterestRate(Number(e.target.value))}
                        step="0.5"
                        className="w-24"
                      />
                      <Badge variant="outline">
                        Based on your credit score: {creditScore?.score || 650}
                      </Badge>
                    </div>
                    <div className="mt-2">
                      <Slider
                        value={[interestRate]}
                        onValueChange={(value) => setInterestRate(value[0])}
                        min={5}
                        max={30}
                        step={0.5}
                      />
                    </div>
                  </div>

                  {creditScore && (
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        Your credit score of {creditScore.score} qualifies you for an estimated 
                        {' '}{interestRate}% APR. Better scores get lower rates.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Results Section */}
        <div className="space-y-6">
          {/* Affordability Score */}
          <Card>
            <CardHeader>
              <CardTitle>Affordability Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart 
                    cx="50%" 
                    cy="50%" 
                    innerRadius="60%" 
                    outerRadius="90%" 
                    data={[{ 
                      value: affordability?.affordabilityScore || 0, 
                      fill: affordability?.affordabilityScore >= 70 ? '#10b981' : 
                            affordability?.affordabilityScore >= 50 ? '#f59e0b' : '#ef4444'
                    }]}
                    startAngle={180} 
                    endAngle={0}
                  >
                    <RadialBar dataKey="value" cornerRadius={10} max={100} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-3xl font-bold">
                    {affordability?.affordabilityScore || 0}
                  </span>
                </div>
              </div>
              <p className="text-center text-sm text-gray-600 mt-2">
                {affordability?.affordabilityScore >= 70 ? 'Excellent' :
                 affordability?.affordabilityScore >= 50 ? 'Good' : 'Poor'} Affordability
              </p>
            </CardContent>
          </Card>

          {/* Loan Summary */}
          {affordability && (
            <Card>
              <CardHeader>
                <CardTitle>Loan Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Monthly Payment</span>
                  <span className="font-bold text-lg">
                    {formatCurrency(affordability.monthlyPayment)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Interest</span>
                  <span className="font-medium">
                    {formatCurrency(affordability.totalInterest)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Repayment</span>
                  <span className="font-medium">
                    {formatCurrency(affordability.totalRepayment)}
                  </span>
                </div>
                <hr />
                <div className="flex justify-between">
                  <span className="text-gray-600">Disposable Income</span>
                  <span className={`font-bold ${affordability.disposableIncome > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(affordability.disposableIncome)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">After Loan Payment</span>
                  <span className={`font-bold ${affordability.disposableIncome - affordability.monthlyPayment > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(affordability.disposableIncome - affordability.monthlyPayment)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recommendation */}
          {recommendation && (
            <Card className={
              recommendation.status === 'good' ? 'border-green-200 bg-green-50' :
              recommendation.status === 'warning' ? 'border-yellow-200 bg-yellow-50' :
              'border-red-200 bg-red-50'
            }>
              <CardHeader>
                <CardTitle className="flex items-center">
                  {recommendation.status === 'good' ? 
                    <CheckCircle className="mr-2 h-5 w-5 text-green-600" /> :
                   recommendation.status === 'warning' ?
                    <AlertCircle className="mr-2 h-5 w-5 text-yellow-600" /> :
                    <AlertCircle className="mr-2 h-5 w-5 text-red-600" />
                  }
                  {recommendation.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm mb-4">{recommendation.description}</p>
                {recommendation.suggestions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Suggestions:</p>
                    <ul className="text-sm space-y-1">
                      {recommendation.suggestions.map((suggestion: string, index: number) => (
                        <li key={index} className="flex items-start">
                          <ChevronRight className="h-4 w-4 mr-1 mt-0.5" />
                          {suggestion}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="space-y-2">
            {affordability?.canAfford ? (
              <Button 
                className="w-full" 
                size="lg"
                onClick={() => router.push('/b/requests')}
              >
                Apply for Loan
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button className="w-full" size="lg" disabled>
                Loan Not Recommended
              </Button>
            )}
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => window.print()}
            >
              <FileText className="mr-2 h-4 w-4" />
              Download Report
            </Button>
          </div>
        </div>
      </div>

      {/* Additional Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Budget Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Budget Breakdown</CardTitle>
            <CardDescription>How your income is allocated</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={budgetData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => `${entry.name}: ${entry.percentage}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {budgetData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={expenseCategories[index].color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => formatCurrency(value)} />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Debt Metrics */}
        <Card>
          <CardHeader>
            <CardTitle>Debt Metrics</CardTitle>
            <CardDescription>Your debt-to-income ratios</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span>Current Debt-to-Income</span>
                <span className="font-bold">{affordability?.currentDTI || 0}%</span>
              </div>
              <Progress 
                value={affordability?.currentDTI || 0} 
                className="h-3"
              />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span>After New Loan</span>
                <span className="font-bold">{affordability?.newDTI || 0}%</span>
              </div>
              <Progress 
                value={affordability?.newDTI || 0} 
                className="h-3"
              />
            </div>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Lenders typically prefer a DTI ratio below 36%. Above 43% may make it difficult to qualify for loans.
              </AlertDescription>
            </Alert>
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm font-medium text-blue-900">Maximum Affordable Loan</p>
              <p className="text-2xl font-bold text-blue-600">
                {formatCurrency(affordability?.maxLoan || 0)}
              </p>
              <p className="text-sm text-blue-700 mt-1">
                Based on your current financial situation
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}