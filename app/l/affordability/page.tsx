'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  Target
} from 'lucide-react'

interface AffordabilityResult {
  monthlyPayment: number
  debtToIncome: number
  disposableIncome: number
  affordabilityScore: 'excellent' | 'good' | 'fair' | 'poor'
  canAfford: boolean
  maxRecommendedLoan: number
  recommendation: string
}

export default function LenderAffordabilityPage() {
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

  const calculateAffordability = () => {
    const income = parseFloat(monthlyIncome) || 0
    const expenses = parseFloat(monthlyExpenses) || 0
    const debt = parseFloat(existingDebt) || 0
    const amount = parseFloat(loanAmount) || 0
    const term = parseInt(loanTerm) || 12
    const rate = parseFloat(interestRate) || 15

    if (income === 0) {
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Affordability Assessment</h1>
          <p className="text-gray-600 mt-2">
            Calculate borrower affordability to make informed lending decisions
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Borrower Information
            </CardTitle>
            <CardDescription>
              Enter borrower financial details to assess loan affordability
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
        {result && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Assessment Results
              </CardTitle>
              <CardDescription>
                Comprehensive affordability analysis
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
      </div>
    </div>
  )
}
