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
import type { LoanWithRelations } from '@/lib/types'
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
import { getCurrencyByCountry, type CurrencyInfo } from '@/lib/utils/currency'

interface Borrower {
  id: string
  full_name: string
  phone_e164: string
  country_code: string
  created_at: string
  credit_score?: number
  score_updated_at?: string
}

interface ExistingLoan {
  id: string
  lender_name: string
  principal_amount: number
  outstanding_balance: number
  monthly_payment: number
  status: string
  created_at: string
}

interface AffordabilityResult {
  monthlyPayment: number
  paymentAmount: number
  paymentFrequencyLabel: string
  debtToIncome: number
  disposableIncome: number
  affordabilityScore: 'excellent' | 'good' | 'fair' | 'poor'
  canAfford: boolean
  maxRecommendedLoan: number
  recommendation: string
  stressTest10: { canAfford: boolean; dti: number; disposable: number }
  stressTest20: { canAfford: boolean; dti: number; disposable: number }
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

  // Currency
  const [currency, setCurrency] = useState<CurrencyInfo>({ code: 'NAD', symbol: 'N$', minorUnits: 2, countryCode: 'NA' })

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
  const [existingLoans, setExistingLoans] = useState<ExistingLoan[]>([])
  const [loadingLoans, setLoadingLoans] = useState(false)
  const [platformDebt, setPlatformDebt] = useState(0)

  // Borrower Income
  const [monthlyIncome, setMonthlyIncome] = useState<string>('')

  // Borrower Expenses
  const [monthlyExpenses, setMonthlyExpenses] = useState<string>('')
  const [existingDebt, setExistingDebt] = useState<string>('')

  // Loan Details
  const [loanAmount, setLoanAmount] = useState<string>('')
  const [loanTerm, setLoanTerm] = useState<string>('12')
  const [interestRate, setInterestRate] = useState<string>('15')
  const [extraRatePerInstallment, setExtraRatePerInstallment] = useState<string>('0')
  const [paymentFrequency, setPaymentFrequency] = useState<'monthly' | 'bi-weekly' | 'weekly' | 'daily'>('monthly')

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

      // Get lender's profile for currency
      const { data: profile } = await supabase
        .from('profiles')
        .select('country_code')
        .eq('user_id', user.id)
        .single()

      if (profile?.country_code) {
        const userCurrency = getCurrencyByCountry(profile.country_code)
        if (userCurrency) {
          setCurrency(userCurrency)
        }
      }

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
      loansData?.forEach((loan: LoanWithRelations) => {
        const borrower = loan.borrowers as Borrower
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
    } catch (error: any) {
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
        .select(`
          id, full_name, phone_e164, country_code, created_at,
          borrower_scores(score, updated_at)
        `)
        .eq('national_id_hash', idHash)
        .single()

      if (error || !data) {
        setNotFound(true)
        return
      }

      // Extract credit score
      const borrowerWithScore = {
        ...data,
        credit_score: data.borrower_scores?.[0]?.score,
        score_updated_at: data.borrower_scores?.[0]?.updated_at
      }

      selectBorrower(borrowerWithScore)
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
    setExistingLoans([])
    setPlatformDebt(0)

    // Clear form
    setMonthlyIncome('')
    setMonthlyExpenses('')
    setExistingDebt('')
    setLoanAmount('')
    setLoanTerm('12')
    setInterestRate('15')
    setExtraRatePerInstallment('0')

    // Load saved assessments and existing loans for this borrower
    await Promise.all([
      loadSavedAssessments(borrower.id),
      loadExistingLoans(borrower.id)
    ])
  }

  const loadExistingLoans = async (borrowerId: string) => {
    try {
      setLoadingLoans(true)

      // Fetch active loans for this borrower via API (bypasses RLS for credit bureau data)
      const response = await fetch(`/api/borrower/debt-summary?borrowerId=${borrowerId}`)

      if (!response.ok) {
        // If API fails, try direct query (will only show loans from current lender due to RLS)
        const { data: loans, error } = await supabase
          .from('loans')
          .select('id, principal_amount, principal_minor, outstanding_balance, status, created_at, interest_rate, term_months, total_interest_percent, base_rate_percent, extra_rate_per_installment, num_installments, total_amount_minor, interest_amount_minor')
          .eq('borrower_id', borrowerId)
          .in('status', ['active', 'pending', 'approved', 'disbursed'])
          .order('created_at', { ascending: false })

        if (error || !loans || loans.length === 0) {
          setExistingLoans([])
          setPlatformDebt(0)
          return
        }

        // Flat-interest model matching app/api/loans/create. Prefer the
        // canonical total_amount_minor if present; otherwise reconstruct
        // from base_rate + extra_rate × (installments - 1).
        const loansWithPayments = loans.map((loan: LoanWithRelations) => {
          const principalMinor = (loan.principal_minor ?? loan.principal_amount ?? 0)
          const principal = principalMinor / 100
          const installments = loan.num_installments || loan.term_months || 1
          const baseRate = loan.base_rate_percent ?? loan.interest_rate ?? 15
          const extraRate = loan.extra_rate_per_installment ?? 0
          const totalRate = loan.total_interest_percent ??
            (baseRate + extraRate * Math.max(0, installments - 1))
          const totalAmount = loan.total_amount_minor
            ? loan.total_amount_minor / 100
            : principal + (principal * totalRate / 100)
          const monthlyPayment = installments > 0 ? totalAmount / installments : 0

          return {
            id: loan.id,
            lender_name: 'Your Loan',
            principal_amount: principal,
            outstanding_balance: (loan.outstanding_balance || principalMinor) / 100,
            monthly_payment: monthlyPayment,
            status: loan.status,
            created_at: loan.created_at
          }
        })

        setExistingLoans(loansWithPayments)
        const totalMonthlyDebt = loansWithPayments.reduce((sum: number, loan: any) => sum + loan.monthly_payment, 0)
        setPlatformDebt(totalMonthlyDebt)
        setExistingDebt(Math.round(totalMonthlyDebt).toString())
        return
      }

      const data = await response.json()

      if (data.loans && data.loans.length > 0) {
        setExistingLoans(data.loans)
        setPlatformDebt(data.totalMonthlyDebt)
        setExistingDebt(Math.round(data.totalMonthlyDebt).toString())
      } else {
        setExistingLoans([])
        setPlatformDebt(0)
      }
    } catch (error: any) {
      // Silently handle - this is expected when borrower has no loans or API access is restricted
      setExistingLoans([])
      setPlatformDebt(0)
    } finally {
      setLoadingLoans(false)
    }
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
    } catch (error: any) {
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
    const baseRate = parseFloat(interestRate) || 15
    const extraRate = parseFloat(extraRatePerInstallment) || 0

    if (income === 0) {
      toast.error('Please enter monthly income')
      return
    }

    // Flat-interest model matching app/api/loans/create:
    //   total_rate = base_rate + extra_rate * (installments - 1)
    //   interest = principal * total_rate / 100
    //   total = principal + interest
    //   payment = total / installments
    // This mirrors how informal cashloan operators actually quote loans —
    // not APR amortization. See loan-create route for the canonical math.
    const totalRate = baseRate + extraRate * Math.max(0, term - 1)
    const interestAmount = amount * totalRate / 100
    const totalRepayable = amount + interestAmount
    const monthlyPayment = term > 0 ? totalRepayable / term : 0

    // Calculate payment based on frequency
    let paymentAmount = monthlyPayment
    let paymentFrequencyLabel = 'Monthly'

    switch (paymentFrequency) {
      case 'bi-weekly':
        paymentAmount = monthlyPayment / 2
        paymentFrequencyLabel = 'Bi-weekly'
        break
      case 'weekly':
        paymentAmount = monthlyPayment / 4
        paymentFrequencyLabel = 'Weekly'
        break
      case 'daily':
        paymentAmount = monthlyPayment / 30
        paymentFrequencyLabel = 'Daily'
        break
    }

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

    // Calculate maximum recommended loan using the same flat-interest model.
    // maxMonthlyPayment × term = principal × (1 + totalRate/100)
    // → principal = (maxMonthlyPayment × term) / (1 + totalRate/100)
    const maxMonthlyPayment = Math.max(0, income * 0.35 - debt) // 35% DTI is good target
    const maxRecommendedLoan = (maxMonthlyPayment * term) / (1 + totalRate / 100)

    // Stress test calculations
    const income10 = income * 0.9 // 10% income drop
    const income20 = income * 0.8 // 20% income drop

    const dti10 = (totalMonthlyDebt / income10) * 100
    const dti20 = (totalMonthlyDebt / income20) * 100

    const disposable10 = income10 - expenses - totalMonthlyDebt
    const disposable20 = income20 - expenses - totalMonthlyDebt

    const stressTest10 = {
      canAfford: dti10 <= 50 && disposable10 >= 0,
      dti: dti10,
      disposable: disposable10
    }

    const stressTest20 = {
      canAfford: dti20 <= 50 && disposable20 >= 0,
      dti: dti20,
      disposable: disposable20
    }

    setResult({
      monthlyPayment,
      paymentAmount,
      paymentFrequencyLabel,
      debtToIncome,
      disposableIncome,
      affordabilityScore,
      canAfford,
      maxRecommendedLoan: Math.max(0, maxRecommendedLoan),
      recommendation,
      stressTest10,
      stressTest20
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
      recommendation: getRecommendation(assessment.affordability_score as AffordabilityResult['affordabilityScore']),
      paymentAmount: assessment.monthly_payment,
      paymentFrequencyLabel: 'Monthly',
      stressTest10: 0,
      stressTest20: 0
    } as unknown as AffordabilityResult)
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
    const formatted = amount.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
    return `${currency.symbol}${formatted}`
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
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{selectedBorrower.full_name}</h3>
                    <p className="text-sm text-muted-foreground">{selectedBorrower.phone_e164}</p>
                  </div>
                  {selectedBorrower.credit_score && (
                    <div className="text-center px-4 py-2 rounded-lg bg-white border">
                      <p className="text-xs text-muted-foreground">Credit Score</p>
                      <p className={`text-2xl font-bold ${
                        selectedBorrower.credit_score >= 700 ? 'text-green-600' :
                        selectedBorrower.credit_score >= 600 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {selectedBorrower.credit_score}
                      </p>
                    </div>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedBorrower(null)
                      setResult(null)
                      setSavedAssessments([])
                      setExistingLoans([])
                      setPlatformDebt(0)
                    }}
                  >
                    Change Borrower
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Existing Platform Loans */}
          {selectedBorrower && (
            <Card className={existingLoans.length > 0 ? 'border-orange-200 bg-orange-50' : ''}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="h-5 w-5" />
                  Existing Loans on Platform
                  {existingLoans.length > 0 && (
                    <Badge variant="secondary" className="ml-2 bg-orange-200 text-orange-800">
                      {existingLoans.length} Active
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingLoans ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : existingLoans.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    <p>No existing loans on this platform</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {existingLoans.map((loan) => (
                      <div key={loan.id} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                        <div>
                          <p className="font-medium text-sm">{loan.lender_name}</p>
                          <p className="text-xs text-muted-foreground">
                            Principal: {formatCurrency(loan.principal_amount)} | Outstanding: {formatCurrency(loan.outstanding_balance)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-orange-600">{formatCurrency(loan.monthly_payment)}/mo</p>
                          <Badge variant="outline" className="text-xs">
                            {loan.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                    <div className="pt-3 border-t">
                      <div className="flex items-center justify-between font-medium">
                        <span>Total Monthly Debt (Platform)</span>
                        <span className="text-lg text-orange-600">{formatCurrency(platformDebt)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        This amount is auto-filled in the "Existing Debt" field below
                      </p>
                    </div>
                  </div>
                )}
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
                    <Label htmlFor="rate">Base Interest Rate (%)</Label>
                    <Input
                      id="rate"
                      type="number"
                      step="0.1"
                      placeholder="15"
                      value={interestRate}
                      onChange={(e) => setInterestRate(e.target.value)}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Flat % of principal for the whole loan (not APR).
                    </p>
                  </div>
                </div>
                <div>
                  <Label htmlFor="extraRate">Extra Rate Per Installment (%)</Label>
                  <Input
                    id="extraRate"
                    type="number"
                    step="0.1"
                    placeholder="0"
                    value={extraRatePerInstallment}
                    onChange={(e) => setExtraRatePerInstallment(e.target.value)}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Added per extra installment after the first. Leave at 0 for a flat-rate loan. Example: 30% base + 5% extra × 3 months = 45% total.
                  </p>
                </div>
                <div>
                  <Label htmlFor="frequency">Payment Frequency</Label>
                  <select
                    id="frequency"
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
                    value={paymentFrequency}
                    onChange={(e) => setPaymentFrequency(e.target.value as 'monthly' | 'bi-weekly' | 'weekly' | 'daily')}
                  >
                    <option value="monthly">Monthly</option>
                    <option value="bi-weekly">Bi-weekly (every 2 weeks)</option>
                    <option value="weekly">Weekly</option>
                    <option value="daily">Daily</option>
                  </select>
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
                    <div className="flex items-center justify-between p-4 border rounded-lg bg-primary/5">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">{result.paymentFrequencyLabel} Payment</span>
                      </div>
                      <span className="text-xl font-bold text-primary">{formatCurrency(result.paymentAmount)}</span>
                    </div>
                    {paymentFrequency !== 'monthly' && (
                      <div className="flex items-center justify-between p-3 border rounded-lg text-sm text-muted-foreground">
                        <span>Monthly equivalent</span>
                        <span>{formatCurrency(result.monthlyPayment)}</span>
                      </div>
                    )}

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

                  {/* Stress Test Results */}
                  <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg space-y-3">
                    <p className="font-medium text-orange-900 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Stress Test: What if income drops?
                    </p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className={`p-3 rounded-lg ${result.stressTest10.canAfford ? 'bg-green-100' : 'bg-red-100'}`}>
                        <p className="font-medium">-10% Income</p>
                        <p className={result.stressTest10.canAfford ? 'text-green-700' : 'text-red-700'}>
                          DTI: {result.stressTest10.dti.toFixed(1)}%
                        </p>
                        <p className={result.stressTest10.canAfford ? 'text-green-700' : 'text-red-700'}>
                          {result.stressTest10.canAfford ? '✓ Can still afford' : '✗ Cannot afford'}
                        </p>
                      </div>
                      <div className={`p-3 rounded-lg ${result.stressTest20.canAfford ? 'bg-green-100' : 'bg-red-100'}`}>
                        <p className="font-medium">-20% Income</p>
                        <p className={result.stressTest20.canAfford ? 'text-green-700' : 'text-red-700'}>
                          DTI: {result.stressTest20.dti.toFixed(1)}%
                        </p>
                        <p className={result.stressTest20.canAfford ? 'text-green-700' : 'text-red-700'}>
                          {result.stressTest20.canAfford ? '✓ Can still afford' : '✗ Cannot afford'}
                        </p>
                      </div>
                    </div>
                  </div>

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
