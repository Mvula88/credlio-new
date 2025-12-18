'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { hashNationalIdAsync } from '@/lib/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Calculator,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Info,
  Percent,
  Wallet,
  Receipt,
  Target,
  Search,
  User,
  Loader2,
  Users,
  History,
  Save
} from 'lucide-react'
import { toast } from 'sonner'

interface Borrower {
  id: string
  full_name: string
  phone_e164: string
  country_code: string
  created_at: string
}

interface AffordabilityResult {
  monthlyPayment: number
  debtToIncome: number
  disposableIncome: number
  affordabilityScore: 'excellent' | 'good' | 'fair' | 'poor'
  canAfford: boolean
  maxRecommendedLoan: number
  recommendation: string
}

interface SavedAssessment {
  id: string
  borrower_id: string
  monthly_income: number
  monthly_expenses: number
  existing_debt: number
  loan_amount: number
  loan_term: number
  interest_rate: number
  monthly_payment: number
  debt_to_income: number
  disposable_income: number
  affordability_score: string
  can_afford: boolean
  max_recommended_loan: number
  created_at: string
}

export default function LenderAffordabilityPage() {
  const supabase = createClient()

  // Borrower search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [selectedBorrower, setSelectedBorrower] = useState<Borrower | null>(null)
  const [recentBorrowers, setRecentBorrowers] = useState<Borrower[]>([])
  const [loadingRecent, setLoadingRecent] = useState(true)
  const [savedAssessments, setSavedAssessments] = useState<SavedAssessment[]>([])
  const [loadingAssessments, setLoadingAssessments] = useState(false)
  const [savingAssessment, setSavingAssessment] = useState(false)

  // Borrower Income
  const [monthlyIncome, setMonthlyIncome] = useState<string>('')

  // Borrower Expenses
  const [monthlyExpenses, setMonthlyExpenses] = useState<string>('')
  const [existingDebt, setExistingDebt] = useState<string>('')

  // Loan Details
  const [loanAmount, setLoanAmount] = useState<string>('')
  const [loanTerm, setLoanTerm] = useState<string>('12')
  const [interestRate, setInterestRate] = useState<string>('15')

  // Results
  const [result, setResult] = useState<AffordabilityResult | null>(null)

  useEffect(() => {
    loadRecentBorrowers()
  }, [])

  // Load lender's recent borrowers
  const loadRecentBorrowers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: loansData, error: loansError } = await supabase
        .from('loans')
        .select(`
          borrower_id,
          borrowers (
            id,
            full_name,
            phone_e164,
            country_code,
            created_at
          )
        `)
        .eq('lender_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)

      if (loansError) throw loansError

      // Get unique borrowers
      const borrowerMap = new Map<string, Borrower>()
      loansData?.forEach(loan => {
        const borrower = loan.borrowers as any
        if (borrower && !borrowerMap.has(borrower.id)) {
          borrowerMap.set(borrower.id, {
            id: borrower.id,
            full_name: borrower.full_name,
            phone_e164: borrower.phone_e164,
            country_code: borrower.country_code,
            created_at: borrower.created_at
          })
        }
      })

      setRecentBorrowers(Array.from(borrowerMap.values()))
    } catch (error) {
      console.error('Error loading recent borrowers:', error)
    } finally {
      setLoadingRecent(false)
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error('Please enter National ID number')
      return
    }

    try {
      setSearchLoading(true)
      setNotFound(false)
      setSelectedBorrower(null)

      const idHash = await hashNationalIdAsync(searchQuery)

      const { data, error } = await supabase
        .from('borrowers')
        .select('id, full_name, phone_e164, country_code, created_at')
        .eq('national_id_hash', idHash)
        .single()

      if (error || !data) {
        setNotFound(true)
        return
      }

      selectBorrower(data)
    } catch (error: any) {
      console.error('Search error:', error)
      toast.error('Search failed. Please try again.')
    } finally {
      setSearchLoading(false)
    }
  }

  const selectBorrower = async (borrower: Borrower) => {
    setSelectedBorrower(borrower)
    setResult(null)

    // Clear form
    setMonthlyIncome('')
    setMonthlyExpenses('')
    setExistingDebt('')
    setLoanAmount('')
    setLoanTerm('12')
    setInterestRate('15')

    // Load saved assessments for this borrower
    await loadSavedAssessments(borrower.id)
  }

  const loadSavedAssessments = async (borrowerId: string) => {
    try {
      setLoadingAssessments(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('affordability_assessments')
        .select('*')
        .eq('borrower_id', borrowerId)
        .eq('lender_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5)

      if (error) {
        // Table might not exist yet
        console.log('Could not load assessments:', error.message)
        setSavedAssessments([])
        return
      }

      setSavedAssessments(data || [])
    } catch (error) {
      console.error('Error loading assessments:', error)
    } finally {
      setLoadingAssessments(false)
    }
  }

  const calculateAffordability = () => {
    const income = parseFloat(monthlyIncome) || 0
    const expenses = parseFloat(monthlyExpenses) || 0
    const debt = parseFloat(existingDebt) || 0
    const amount = parseFloat(loanAmount) || 0
    const term = parseInt(loanTerm) || 12
    const rate = parseFloat(interestRate) || 15

    if (income === 0) {
      toast.error('Please enter monthly income')
      return
    }

    // Calculate monthly payment using amortization formula
    const monthlyRate = rate / 100 / 12
    const monthlyPayment = amount * (monthlyRate * Math.pow(1 + monthlyRate, term)) / (Math.pow(1 + monthlyRate, term) - 1)

    // Calculate total monthly debt including new loan
    const totalMonthlyDebt = debt + monthlyPayment

    // Calculate debt-to-income ratio
    const debtToIncome = (totalMonthlyDebt / income) * 100

    // Calculate disposable income after all obligations
    const disposableIncome = income - expenses - totalMonthlyDebt

    // Determine affordability score
    let affordabilityScore: AffordabilityResult['affordabilityScore']
    let canAfford: boolean
    let recommendation: string

    if (debtToIncome <= 30 && disposableIncome > 0) {
      affordabilityScore = 'excellent'
      canAfford = true
      recommendation = 'Excellent affordability. Borrower has strong capacity to repay.'
    } else if (debtToIncome <= 40 && disposableIncome > 0) {
      affordabilityScore = 'good'
      canAfford = true
      recommendation = 'Good affordability. Consider loan approval with standard terms.'
    } else if (debtToIncome <= 50 && disposableIncome >= 0) {
      affordabilityScore = 'fair'
      canAfford = true
      recommendation = 'Fair affordability. Consider reducing loan amount or requiring collateral.'
    } else {
      affordabilityScore = 'poor'
      canAfford = false
      recommendation = 'Poor affordability. High risk - consider rejection or significant loan reduction.'
    }

    // Calculate maximum recommended loan
    const maxMonthlyPayment = income * 0.35 - debt // 35% DTI is good target
    const maxRecommendedLoan = maxMonthlyPayment * (Math.pow(1 + monthlyRate, term) - 1) / (monthlyRate * Math.pow(1 + monthlyRate, term))

    setResult({
      monthlyPayment,
      debtToIncome,
      disposableIncome,
      affordabilityScore,
      canAfford,
      maxRecommendedLoan: Math.max(0, maxRecommendedLoan),
      recommendation
    })
  }

  const saveAssessment = async () => {
    if (!selectedBorrower || !result) return

    try {
      setSavingAssessment(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Please log in to save assessment')
        return
      }

      const { error } = await supabase
        .from('affordability_assessments')
        .insert({
          borrower_id: selectedBorrower.id,
          lender_id: user.id,
          monthly_income: parseFloat(monthlyIncome) || 0,
          monthly_expenses: parseFloat(monthlyExpenses) || 0,
          existing_debt: parseFloat(existingDebt) || 0,
          loan_amount: parseFloat(loanAmount) || 0,
          loan_term: parseInt(loanTerm) || 12,
          interest_rate: parseFloat(interestRate) || 15,
          monthly_payment: result.monthlyPayment,
          debt_to_income: result.debtToIncome,
          disposable_income: result.disposableIncome,
          affordability_score: result.affordabilityScore,
          can_afford: result.canAfford,
          max_recommended_loan: result.maxRecommendedLoan
        })

      if (error) {
        if (error.message.includes('does not exist')) {
          toast.error('Assessment feature is being set up. Please try again later.')
        } else {
          throw error
        }
        return
      }

      toast.success('Assessment saved to borrower profile')
      await loadSavedAssessments(selectedBorrower.id)
    } catch (error: any) {
      console.error('Error saving assessment:', error)
      toast.error('Failed to save assessment')
    } finally {
      setSavingAssessment(false)
    }
  }

  const loadAssessmentIntoForm = (assessment: SavedAssessment) => {
    setMonthlyIncome(assessment.monthly_income.toString())
    setMonthlyExpenses(assessment.monthly_expenses.toString())
    setExistingDebt(assessment.existing_debt.toString())
    setLoanAmount(assessment.loan_amount.toString())
    setLoanTerm(assessment.loan_term.toString())
    setInterestRate(assessment.interest_rate.toString())

    // Set result from saved assessment
    setResult({
      monthlyPayment: assessment.monthly_payment,
      debtToIncome: assessment.debt_to_income,
      disposableIncome: assessment.disposable_income,
      affordabilityScore: assessment.affordability_score as AffordabilityResult['affordabilityScore'],
      canAfford: assessment.can_afford,
      maxRecommendedLoan: assessment.max_recommended_loan,
      recommendation: getRecommendation(assessment.affordability_score as AffordabilityResult['affordabilityScore'])
    })
  }

  const getRecommendation = (score: AffordabilityResult['affordabilityScore']) => {
    switch (score) {
      case 'excellent':
        return 'Excellent affordability. Borrower has strong capacity to repay.'
      case 'good':
        return 'Good affordability. Consider loan approval with standard terms.'
      case 'fair':
        return 'Fair affordability. Consider reducing loan amount or requiring collateral.'
      case 'poor':
        return 'Poor affordability. High risk - consider rejection or significant loan reduction.'
    }
  }

  const getScoreColor = (score: AffordabilityResult['affordabilityScore']) => {
    switch (score) {
      case 'excellent':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'good':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'fair':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'poor':
        return 'bg-red-100 text-red-800 border-red-200'
    }
  }

  const getScoreBadge = (score: string) => {
    switch (score) {
      case 'excellent':
        return <Badge className="bg-green-100 text-green-800">Excellent</Badge>
      case 'good':
        return <Badge className="bg-blue-100 text-blue-800">Good</Badge>
      case 'fair':
        return <Badge className="bg-yellow-100 text-yellow-800">Fair</Badge>
      case 'poor':
        return <Badge className="bg-red-100 text-red-800">Poor</Badge>
      default:
        return <Badge variant="secondary">{score}</Badge>
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Wallet className="h-8 w-8 text-primary" />
          Affordability Assessment
        </h1>
        <p className="text-muted-foreground mt-1">
          Calculate borrower affordability to make informed lending decisions
        </p>
      </div>

      {/* Search Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            Search Borrower
          </CardTitle>
          <CardDescription>
            Enter the borrower's National ID to find them and assess their affordability
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Input
              placeholder="Enter National ID Number"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={searchLoading}>
              {searchLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Search
            </Button>
          </div>

          {notFound && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                No borrower found with this National ID. They need to be registered first.
              </AlertDescription>
            </Alert>
          )}

          {selectedBorrower && (
            <Card className="border-primary/50 bg-primary/5">
              <CardContent className="pt-4">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{selectedBorrower.full_name}</h3>
                    <p className="text-sm text-muted-foreground">{selectedBorrower.phone_e164}</p>
                  </div>
                  <Button
                    variant="outline"
                    className="ml-auto"
                    onClick={() => {
                      setSelectedBorrower(null)
                      setResult(null)
                      setSavedAssessments([])
                    }}
                  >
                    Change Borrower
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      {/* Quick Access - Your Borrowers */}
      {!selectedBorrower && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Your Borrowers - Quick Access
            </CardTitle>
            <CardDescription>
              Click on a borrower to start their affordability assessment
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingRecent ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : recentBorrowers.length === 0 ? (
              <div className="text-center py-12">
                <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  No borrowers yet. Search for a borrower above to start.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Borrower</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentBorrowers.map((borrower) => (
                      <TableRow key={borrower.id} className="cursor-pointer hover:bg-muted/50">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="h-4 w-4 text-primary" />
                            </div>
                            <span className="font-medium">{borrower.full_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {borrower.phone_e164}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            onClick={() => selectBorrower(borrower)}
                          >
                            <Calculator className="h-4 w-4 mr-2" />
                            Assess
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Assessment Form and Results - only shown when borrower is selected */}
      {selectedBorrower && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Input Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Financial Information
              </CardTitle>
              <CardDescription>
                Enter {selectedBorrower.full_name}'s financial details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Income Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Wallet className="h-4 w-4" />
                  Monthly Income
                </div>
                <div>
                  <Label htmlFor="income">Gross Monthly Income</Label>
                  <Input
                    id="income"
                    type="number"
                    placeholder="5000"
                    value={monthlyIncome}
                    onChange={(e) => setMonthlyIncome(e.target.value)}
                  />
                </div>
              </div>

              {/* Expenses Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Receipt className="h-4 w-4" />
                  Monthly Obligations
                </div>
                <div>
                  <Label htmlFor="expenses">Essential Expenses (Rent, Utilities, Food)</Label>
                  <Input
                    id="expenses"
                    type="number"
                    placeholder="2500"
                    value={monthlyExpenses}
                    onChange={(e) => setMonthlyExpenses(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="debt">Existing Debt Payments</Label>
                  <Input
                    id="debt"
                    type="number"
                    placeholder="500"
                    value={existingDebt}
                    onChange={(e) => setExistingDebt(e.target.value)}
                  />
                </div>
              </div>

              {/* Loan Details Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Target className="h-4 w-4" />
                  Loan Details
                </div>
                <div>
                  <Label htmlFor="amount">Requested Loan Amount</Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="10000"
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="term">Term (Months)</Label>
                    <Input
                      id="term"
                      type="number"
                      placeholder="12"
                      value={loanTerm}
                      onChange={(e) => setLoanTerm(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="rate">Interest Rate (%)</Label>
                    <Input
                      id="rate"
                      type="number"
                      step="0.1"
                      placeholder="15"
                      value={interestRate}
                      onChange={(e) => setInterestRate(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <Button onClick={calculateAffordability} className="w-full">
                <Calculator className="mr-2 h-4 w-4" />
                Calculate Affordability
              </Button>
            </CardContent>
          </Card>

          {/* Results */}
          <div className="space-y-6">
            {result && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Assessment Results
                  </CardTitle>
                  <CardDescription>
                    Comprehensive affordability analysis for {selectedBorrower.full_name}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Affordability Score */}
                  <Alert className={getScoreColor(result.affordabilityScore)}>
                    {result.canAfford ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <AlertTitle className="text-lg">
                      {result.affordabilityScore.charAt(0).toUpperCase() + result.affordabilityScore.slice(1)} Affordability
                    </AlertTitle>
                    <AlertDescription>
                      {result.recommendation}
                    </AlertDescription>
                  </Alert>

                  {/* Key Metrics */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-gray-600" />
                        <span className="text-sm font-medium">Monthly Payment</span>
                      </div>
                      <span className="text-lg font-bold">{formatCurrency(result.monthlyPayment)}</span>
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <Percent className="h-4 w-4 text-gray-600" />
                        <span className="text-sm font-medium">Debt-to-Income Ratio</span>
                      </div>
                      <span className="text-lg font-bold">{result.debtToIncome.toFixed(1)}%</span>
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-gray-600" />
                        <span className="text-sm font-medium">Disposable Income</span>
                      </div>
                      <span className={`text-lg font-bold ${result.disposableIncome < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatCurrency(result.disposableIncome)}
                      </span>
                    </div>
                  </div>

                  {/* Recommendation */}
                  {result.maxRecommendedLoan > 0 && (
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertTitle>Recommended Maximum Loan</AlertTitle>
                      <AlertDescription>
                        Based on 35% debt-to-income ratio: <strong>{formatCurrency(result.maxRecommendedLoan)}</strong>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Save Button */}
                  <Button
                    onClick={saveAssessment}
                    disabled={savingAssessment}
                    className="w-full"
                    variant="outline"
                  >
                    {savingAssessment ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Assessment to Profile
                  </Button>

                  {/* Guideline Reference */}
                  <div className="p-4 bg-gray-50 rounded-lg space-y-2 text-sm">
                    <p className="font-medium">Industry Guidelines:</p>
                    <ul className="space-y-1 text-gray-600">
                      <li>• DTI {'<'} 30%: Excellent (Low Risk)</li>
                      <li>• DTI 30-40%: Good (Moderate Risk)</li>
                      <li>• DTI 40-50%: Fair (Higher Risk)</li>
                      <li>• DTI {'>'} 50%: Poor (High Risk)</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Saved Assessments History */}
            {savedAssessments.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Previous Assessments
                  </CardTitle>
                  <CardDescription>
                    Past affordability checks for {selectedBorrower.full_name}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {savedAssessments.map((assessment) => (
                      <div
                        key={assessment.id}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                        onClick={() => loadAssessmentIntoForm(assessment)}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {getScoreBadge(assessment.affordability_score)}
                            <span className="text-sm font-medium">
                              {formatCurrency(assessment.loan_amount)} loan
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {new Date(assessment.created_at).toLocaleDateString()} - DTI: {assessment.debt_to_income.toFixed(1)}%
                          </p>
                        </div>
                        <Button variant="ghost" size="sm">
                          Load
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {loadingAssessments && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
