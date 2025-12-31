'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  CreditCard,
  User,
  Calendar,
  DollarSign,
  Percent,
  AlertCircle,
  CheckCircle,
  Loader2,
  Calculator,
  TrendingUp
} from 'lucide-react'
import { format, addMonths } from 'date-fns'
import { hashNationalIdAsync } from '@/lib/auth'

const loanSchema = z.object({
  borrowerId: z.string().optional(),
  nationalId: z.string().optional(),
  principalAmount: z.number().min(100, 'Minimum loan amount is 100'),
  baseRatePercent: z.number().min(0).max(100, 'Interest rate must be between 0-100%'),
  extraRatePerInstallment: z.number().min(0).max(50, 'Extra rate must be between 0-50%'),
  paymentType: z.enum(['once_off', 'installments']),
  numInstallments: z.number().min(1).max(12),
  purpose: z.string().min(10, 'Please describe the loan purpose'),
})

type LoanInput = z.infer<typeof loanSchema>

const CURRENCIES: Record<string, { code: string, symbol: string, name: string }> = {
  NG: { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
  KE: { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
  ZA: { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  GH: { code: 'GHS', symbol: '₵', name: 'Ghanaian Cedi' },
  TZ: { code: 'TZS', symbol: 'TSh', name: 'Tanzanian Shilling' },
  UG: { code: 'UGX', symbol: 'USh', name: 'Ugandan Shilling' },
  NA: { code: 'NAD', symbol: 'N$', name: 'Namibian Dollar' },
  ZM: { code: 'ZMW', symbol: 'K', name: 'Zambian Kwacha' },
  MW: { code: 'MWK', symbol: 'MK', name: 'Malawian Kwacha' },
  RW: { code: 'RWF', symbol: 'RF', name: 'Rwandan Franc' },
  CM: { code: 'XAF', symbol: 'FCFA', name: 'Central African CFA Franc' },
  CI: { code: 'XOF', symbol: 'CFA', name: 'West African CFA Franc' },
}

function NewLoanPageContent() {
  const [loading, setLoading] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [borrower, setBorrower] = useState<any>(null)
  const [borrowerHasAccount, setBorrowerHasAccount] = useState<boolean>(false)
  const [currency, setCurrency] = useState<any>(null)
  const [lenderCountryCode, setLenderCountryCode] = useState<string | null>(null)
  const [calculation, setCalculation] = useState<any>(null)

  // Separate state for form fields to ensure reactivity
  const [principalAmount, setPrincipalAmount] = useState<number>(0)
  const [baseRatePercent, setBaseRatePercent] = useState<number>(30)
  const [extraRatePerInstallment, setExtraRatePerInstallment] = useState<number>(2)
  const [paymentType, setPaymentType] = useState<'once_off' | 'installments'>('once_off')
  const [numInstallments, setNumInstallments] = useState<number>(1)
  const [purpose, setPurpose] = useState<string>('')
  const [nationalIdInput, setNationalIdInput] = useState<string>('')

  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<LoanInput>({
    resolver: zodResolver(loanSchema),
    defaultValues: {
      paymentType: 'once_off',
      numInstallments: 1,
      baseRatePercent: 30,
      extraRatePerInstallment: 2,
    },
  })

  const nationalId = watch('nationalId')

  useEffect(() => {
    // Check if borrower ID was passed in URL
    const borrowerId = searchParams.get('borrower')
    if (borrowerId) {
      loadBorrower(borrowerId)
    }
    loadLenderProfile()
  }, [searchParams])

  useEffect(() => {
    // Calculate loan details whenever inputs change
    calculateLoan()
  }, [principalAmount, baseRatePercent, extraRatePerInstallment, paymentType, numInstallments])

  const loadLenderProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('country_code')
        .eq('user_id', user.id)
        .single()

      if (profile) {
        setLenderCountryCode(profile.country_code)
        if (CURRENCIES[profile.country_code]) {
          setCurrency(CURRENCIES[profile.country_code])
        }
      }
    }
  }

  const loadBorrower = async (borrowerId: string) => {
    // Use left join (no !inner) so borrowers without loans are still returned
    const { data } = await supabase
      .from('borrowers')
      .select(`
        *,
        borrower_scores(score),
        loans(status)
      `)
      .eq('id', borrowerId)
      .single()

    if (data) {
      setBorrower(data)
      setValue('borrowerId', borrowerId)

      // Check if borrower has a user account
      const { data: borrowerLink } = await supabase
        .from('borrower_user_links')
        .select('user_id')
        .eq('borrower_id', borrowerId)
        .maybeSingle()

      setBorrowerHasAccount(!!borrowerLink?.user_id)

      // Check for active loan
      const hasActiveLoan = data.loans?.some((l: any) => l.status === 'active')
      if (hasActiveLoan) {
        setError('This borrower has an active loan and cannot take a new one.')
      }
    }
  }

  const searchBorrower = async () => {
    if (!nationalId) return

    try {
      setSearchLoading(true)
      setError(null)

      const idHash = await hashNationalIdAsync(nationalId)
      
      const { data, error: searchError } = await supabase
        .from('borrowers')
        .select(`
          *,
          borrower_scores(score),
          loans(id, status)
        `)
        .eq('national_id_hash', idHash)
        .maybeSingle()

      if (searchError) {
        console.error('Search error:', searchError)
        setError('Search failed. Please try again.')
        setBorrower(null)
        return
      }

      if (!data) {
        setError('Borrower not found. Please check the ID or register them first.')
        setBorrower(null)
        return
      }

      setBorrower(data)
      setValue('borrowerId', data.id)

      // Check if borrower has a user account
      const { data: borrowerLink } = await supabase
        .from('borrower_user_links')
        .select('user_id')
        .eq('borrower_id', data.id)
        .maybeSingle()

      setBorrowerHasAccount(!!borrowerLink?.user_id)

      // Check for active loan
      const hasActiveLoan = data.loans?.some((l: any) => l.status === 'active')
      if (hasActiveLoan) {
        setError('This borrower has an active loan and cannot take a new one.')
      }
    } catch (err) {
      console.error('Search error:', err)
      setError('Search failed. Please try again.')
    } finally {
      setSearchLoading(false)
    }
  }

  const calculateLoan = () => {
    const principal = principalAmount || 0
    const baseRate = baseRatePercent || 30
    const extraRate = extraRatePerInstallment || 2
    const installments = paymentType === 'once_off' ? 1 : (numInstallments || 1)

    // Don't calculate if no principal
    if (principal <= 0) {
      setCalculation(null)
      return
    }

    // Calculate total interest rate based on payment type
    // Once-off: just base rate
    // Installments: base rate + (extra rate × (installments - 1))
    const totalInterestRate = paymentType === 'once_off'
      ? baseRate
      : baseRate + (extraRate * (installments - 1))

    // Calculate interest amount
    const interestAmount = principal * (totalInterestRate / 100)
    const totalAmount = principal + interestAmount

    // Calculate per-installment payment
    const paymentAmountCalc = installments > 0 ? totalAmount / installments : totalAmount

    setCalculation({
      totalInterestRate,
      interestAmount,
      totalAmount,
      paymentAmount: paymentAmountCalc,
      totalPayments: installments,
      firstPaymentDate: addMonths(new Date(), 1),
      lastPaymentDate: addMonths(new Date(), installments),
    })
  }

  const onSubmit = async () => {
    try {
      setLoading(true)
      setError(null)

      // Validate
      if (!borrower) {
        setError('Please select a borrower first')
        return
      }

      if (principalAmount < 100) {
        setError('Minimum loan amount is 100')
        return
      }

      if (purpose.length < 10) {
        setError('Please describe the loan purpose (at least 10 characters)')
        return
      }

      // Get current user and lender
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Please login to continue')
        return
      }

      const { data: lender } = await supabase
        .from('lenders')
        .select('user_id')
        .eq('user_id', user.id)
        .single()

      if (!lender) {
        setError('Lender profile not found')
        return
      }

      // Calculate values for database using state values
      const installments = paymentType === 'once_off' ? 1 : numInstallments
      const totalInterestRate = paymentType === 'once_off'
        ? baseRatePercent
        : baseRatePercent + (extraRatePerInstallment * (installments - 1))
      const interestAmountMinor = Math.round(principalAmount * 100 * totalInterestRate / 100)
      const totalAmountMinor = Math.round(principalAmount * 100) + interestAmountMinor

      // Check if borrower has a user account (requires confirmation)
      const { data: borrowerLink } = await supabase
        .from('borrower_user_links')
        .select('user_id')
        .eq('borrower_id', borrower.id)
        .maybeSingle()

      const borrowerHasAccount = !!borrowerLink?.user_id
      const loanStatus = borrowerHasAccount ? 'pending_offer' : 'active'

      // Debug: Log what we're sending
      console.log('Creating loan with:', {
        lender_id: lender.user_id,
        lenderCountryCode,
        borrowerCountryCode: borrower.country_code,
        finalCountryCode: lenderCountryCode || borrower.country_code,
        currency: currency?.code,
        user_id: user.id
      })

      // Create the loan with new interest rate system
      const { data: loan, error: loanError } = await supabase
        .from('loans')
        .insert({
          borrower_id: borrower.id,
          lender_id: lender.user_id,
          principal_minor: Math.round(principalAmount * 100),
          // New interest rate fields
          base_rate_percent: baseRatePercent,
          extra_rate_per_installment: extraRatePerInstallment,
          payment_type: paymentType,
          num_installments: installments,
          total_interest_percent: totalInterestRate,
          interest_amount_minor: interestAmountMinor,
          total_amount_minor: totalAmountMinor,
          // Legacy fields for backwards compatibility
          apr_bps: Math.round(totalInterestRate * 100),
          term_months: installments,
          currency: currency?.code || 'USD',
          country_code: lenderCountryCode || borrower.country_code,
          purpose: purpose,
          // If borrower has account, set to pending_offer for them to accept
          // Otherwise, set to active for tracked borrowers
          status: loanStatus,
          requires_borrower_acceptance: borrowerHasAccount,
          start_date: new Date().toISOString(),
          end_date: addMonths(new Date(), installments).toISOString(),
        })
        .select()
        .single()

      if (loanError) {
        // Try multiple ways to extract error info
        const errorStr = JSON.stringify(loanError)
        const errorKeys = Object.keys(loanError)
        console.error('Loan error RAW:', loanError)
        console.error('Loan error STRING:', errorStr)
        console.error('Loan error KEYS:', errorKeys)
        console.error('Loan error entries:', Object.entries(loanError))

        const errorMessage = loanError.message || (loanError as any).error || errorStr || 'Unknown error'

        if (errorMessage.includes('already have an active loan')) {
          setError('This borrower already has an active loan. They must repay it before taking a new one.')
        } else {
          setError(`Failed to create loan: ${errorMessage}`)
        }
        return
      }

      // Create repayment schedule using new system
      const schedules = []
      const principalMinor = Math.round(principalAmount * 100)
      const installmentAmountMinor = Math.ceil(totalAmountMinor / installments)
      const principalPerInstallment = Math.ceil(principalMinor / installments)
      const interestPerInstallment = Math.ceil(interestAmountMinor / installments)

      for (let i = 0; i < installments; i++) {
        const dueDate = addMonths(new Date(), i + 1)
        const isLast = i === installments - 1

        // Last installment gets the remainder to ensure exact total
        const thisAmount = isLast
          ? totalAmountMinor - (installmentAmountMinor * (installments - 1))
          : installmentAmountMinor
        const thisPrincipal = isLast
          ? principalMinor - (principalPerInstallment * (installments - 1))
          : principalPerInstallment
        const thisInterest = isLast
          ? interestAmountMinor - (interestPerInstallment * (installments - 1))
          : interestPerInstallment

        schedules.push({
          loan_id: loan.id,
          installment_no: i + 1,
          due_date: dueDate.toISOString(),
          amount_due_minor: thisAmount,
          principal_minor: thisPrincipal,
          interest_minor: thisInterest,
          status: 'pending',
        })
      }

      // Only create repayment schedule if loan is active (tracked borrowers)
      // For pending_offer loans, schedule will be created when borrower accepts
      if (!borrowerHasAccount) {
        const { error: scheduleError } = await supabase
          .from('repayment_schedules')
          .insert(schedules)

        if (scheduleError) {
          console.error('Schedule error:', scheduleError)
        }
      }

      // Show appropriate message based on whether borrower needs to confirm
      if (borrowerHasAccount) {
        // Redirect with success message about pending confirmation
        router.push(`/l/loans/${loan.id}?status=pending_offer`)
      } else {
        router.push(`/l/loans/${loan.id}`)
      }
    } catch (err) {
      console.error('Submit error:', err)
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Create New Loan</h1>
        <p className="text-gray-600 mt-1">Set up a new loan for a borrower</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="space-y-6">
        {/* Borrower Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Select Borrower</CardTitle>
            <CardDescription>
              Search for an existing borrower by their national ID
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!borrower ? (
              <div className="space-y-4">
                <div className="flex space-x-2">
                  <Input
                    placeholder="Enter National ID"
                    value={nationalId || ''}
                    onChange={(e) => setValue('nationalId', e.target.value)}
                  />
                  <Button 
                    type="button"
                    onClick={searchBorrower}
                    disabled={searchLoading || !nationalId}
                  >
                    {searchLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Search'
                    )}
                  </Button>
                </div>
                <p className="text-sm text-gray-500">
                  Or <Button variant="link" className="p-0 h-auto" onClick={() => router.push('/l/borrowers')}>
                    register a new borrower
                  </Button> first
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <User className="h-5 w-5 text-gray-400" />
                        <span className="font-medium">{borrower.full_name}</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        <p>Phone: {borrower.phone_e164}</p>
                        <p>DOB: {format(new Date(borrower.date_of_birth), 'MMM dd, yyyy')}</p>
                        {borrower.borrower_scores?.[0] && (
                          <p>Credit Score: <span className="font-medium">{borrower.borrower_scores[0].score}</span></p>
                        )}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setBorrower(null)
                        setBorrowerHasAccount(false)
                        setValue('borrowerId', '')
                        setValue('nationalId', '')
                      }}
                    >
                      Change
                    </Button>
                  </div>
                </div>

              </div>
            )}
          </CardContent>
        </Card>

        {/* Loan Details */}
        {borrower && !error && (
          <Card>
            <CardHeader>
              <CardTitle>Loan Details</CardTitle>
              <CardDescription>
                Configure the loan terms and interest rates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Principal Amount */}
              <div className="space-y-2">
                <Label htmlFor="principal">Loan Amount ({currency?.symbol || '$'})</Label>
                <Input
                  id="principal"
                  type="number"
                  step="100"
                  min="100"
                  placeholder="e.g., 1000"
                  value={principalAmount || ''}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0
                    setPrincipalAmount(val)
                    setValue('principalAmount', val)
                  }}
                />
                {principalAmount < 100 && principalAmount > 0 && (
                  <p className="text-sm text-red-500">Minimum loan amount is 100</p>
                )}
              </div>

              {/* Interest Rate Section */}
              <div className="border-2 border-green-200 rounded-lg p-4 bg-green-50/30">
                <h4 className="font-semibold text-sm text-green-900 mb-4 flex items-center gap-2">
                  <Percent className="h-4 w-4" />
                  Interest Rate Settings
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="baseRate">
                      Base Interest Rate (%)
                      <span className="text-xs text-gray-500 block">For 1-month / once-off payment</span>
                    </Label>
                    <Input
                      id="baseRate"
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      placeholder="e.g., 30"
                      value={baseRatePercent}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0
                        setBaseRatePercent(val)
                        setValue('baseRatePercent', val)
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="extraRate" className={paymentType === 'once_off' ? 'text-gray-400' : ''}>
                      Extra Rate Per Installment (%)
                      <span className="text-xs text-gray-500 block">
                        {paymentType === 'once_off'
                          ? 'Not applicable for once-off payments'
                          : 'Added for each extra month'}
                      </span>
                    </Label>
                    <Input
                      id="extraRate"
                      type="number"
                      step="0.5"
                      min="0"
                      max="50"
                      placeholder="e.g., 2"
                      value={extraRatePerInstallment}
                      disabled={paymentType === 'once_off'}
                      className={paymentType === 'once_off' ? 'bg-gray-100 cursor-not-allowed opacity-50' : ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0
                        setExtraRatePerInstallment(val)
                        setValue('extraRatePerInstallment', val)
                      }}
                    />
                  </div>
                </div>

                {/* Interest Rate Explanation */}
                <Alert className="mt-4 bg-blue-50 border-blue-200">
                  <Calculator className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-xs text-blue-800">
                    <strong>How it works:</strong> If borrower pays once (single payment), they pay Base Rate.
                    For installments, add Extra Rate for each month beyond the first.
                    <br />
                    Example: 30% base + 2% extra = 30% for 1 month, 32% for 2 months, 34% for 3 months, etc.
                  </AlertDescription>
                </Alert>
              </div>

              {/* Payment Type Selection */}
              <div className="space-y-4">
                <Label>Payment Type</Label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentType('once_off')
                      setNumInstallments(1)
                      setValue('paymentType', 'once_off')
                      setValue('numInstallments', 1)
                    }}
                    className={`flex items-center space-x-3 border-2 rounded-lg p-4 cursor-pointer transition-colors text-left ${paymentType === 'once_off' ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${paymentType === 'once_off' ? 'border-green-500' : 'border-gray-300'}`}>
                      {paymentType === 'once_off' && <div className="w-2 h-2 rounded-full bg-green-500" />}
                    </div>
                    <div>
                      <span className="font-medium">Once-off</span>
                      <p className="text-xs text-gray-500">Single payment at end of term</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentType('installments')
                      setNumInstallments(2)
                      setValue('paymentType', 'installments')
                      setValue('numInstallments', 2)
                    }}
                    className={`flex items-center space-x-3 border-2 rounded-lg p-4 cursor-pointer transition-colors text-left ${paymentType === 'installments' ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${paymentType === 'installments' ? 'border-green-500' : 'border-gray-300'}`}>
                      {paymentType === 'installments' && <div className="w-2 h-2 rounded-full bg-green-500" />}
                    </div>
                    <div>
                      <span className="font-medium">Installments</span>
                      <p className="text-xs text-gray-500">Multiple monthly payments</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Number of Installments - only show if installments selected */}
              {paymentType === 'installments' && (
                <div className="space-y-2">
                  <Label htmlFor="numInstallments">Number of Installments</Label>
                  <Select
                    value={String(numInstallments)}
                    onValueChange={(value) => {
                      const num = parseInt(value)
                      setNumInstallments(num)
                      setValue('numInstallments', num)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select number of installments" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 months</SelectItem>
                      <SelectItem value="3">3 months</SelectItem>
                      <SelectItem value="4">4 months</SelectItem>
                      <SelectItem value="5">5 months</SelectItem>
                      <SelectItem value="6">6 months</SelectItem>
                      <SelectItem value="7">7 months</SelectItem>
                      <SelectItem value="8">8 months</SelectItem>
                      <SelectItem value="9">9 months</SelectItem>
                      <SelectItem value="10">10 months</SelectItem>
                      <SelectItem value="11">11 months</SelectItem>
                      <SelectItem value="12">12 months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Loan Purpose */}
              <div className="space-y-2">
                <Label htmlFor="purpose">Loan Purpose</Label>
                <Textarea
                  id="purpose"
                  placeholder="Describe what the loan will be used for..."
                  rows={3}
                  value={purpose}
                  onChange={(e) => {
                    setPurpose(e.target.value)
                    setValue('purpose', e.target.value)
                  }}
                />
                {purpose.length > 0 && purpose.length < 10 && (
                  <p className="text-sm text-red-500">Please describe the loan purpose (at least 10 characters)</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loan Calculation - Live Preview */}
        {calculation && borrower && !error && (
          <Card className="border-2 border-blue-300">
            <CardHeader className="bg-blue-50">
              <CardTitle className="flex items-center gap-2 text-blue-900">
                <TrendingUp className="h-5 w-5" />
                Loan Summary - What Borrower Will Pay
              </CardTitle>
              <CardDescription>
                Review the calculated loan details before creating
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {/* Main Breakdown */}
              <div className="border-2 border-green-200 rounded-lg p-4 bg-green-50/30 mb-4">
                <h4 className="font-semibold text-green-900 mb-3">Amount Breakdown</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Principal (Amount Borrowed):</span>
                    <span className="font-medium">
                      {currency?.symbol || ''}{principalAmount?.toLocaleString()} {currency?.code || ''}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">
                      Interest Rate:
                      {paymentType === 'installments' && numInstallments > 1 && (
                        <span className="text-xs ml-1">
                          ({baseRatePercent}% + {extraRatePerInstallment}% × {numInstallments - 1})
                        </span>
                      )}
                    </span>
                    <span className="font-medium text-orange-600">
                      {calculation.totalInterestRate?.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Interest Amount:</span>
                    <span className="font-medium text-orange-600">
                      {currency?.symbol || ''}{calculation.interestAmount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency?.code || ''}
                    </span>
                  </div>
                  <div className="border-t pt-2 mt-2">
                    <div className="flex justify-between text-lg font-bold text-green-900">
                      <span>TOTAL TO REPAY:</span>
                      <span>
                        {currency?.symbol || ''}{calculation.totalAmount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency?.code || ''}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment Schedule */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border rounded-lg p-3 bg-gray-50">
                  <p className="text-sm text-gray-600">Payment Type</p>
                  <p className="font-bold text-lg">
                    {paymentType === 'once_off' ? 'Single Payment' : `${calculation.totalPayments} Installments`}
                  </p>
                </div>

                <div className="border rounded-lg p-3 bg-gray-50">
                  <p className="text-sm text-gray-600">
                    {paymentType === 'once_off' ? 'Full Amount Due' : 'Per Installment'}
                  </p>
                  <p className="font-bold text-lg text-green-700">
                    {currency?.symbol || ''}{calculation.paymentAmount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    {paymentType === 'installments' && (
                      <span className="text-sm font-normal text-gray-500"> × {calculation.totalPayments}</span>
                    )}
                    <span className="text-sm font-normal text-gray-500"> {currency?.code || ''}</span>
                  </p>
                </div>

                <div className="border rounded-lg p-3 bg-gray-50">
                  <p className="text-sm text-gray-600">First Payment Due</p>
                  <p className="font-medium">
                    {format(calculation.firstPaymentDate, 'MMM dd, yyyy')}
                  </p>
                </div>

                <div className="border rounded-lg p-3 bg-gray-50">
                  <p className="text-sm text-gray-600">Last Payment Due</p>
                  <p className="font-medium">
                    {format(calculation.lastPaymentDate, 'MMM dd, yyyy')}
                  </p>
                </div>
              </div>

              {borrowerHasAccount ? (
                <Alert className="mt-4 bg-blue-50 border-blue-200">
                  <User className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800">
                    <strong>Borrower has an account:</strong> This borrower will receive a notification to review and confirm this loan offer.
                    The loan will only become active after they accept it. Total amount:{' '}
                    <strong>{currency?.symbol || ''}{calculation.totalAmount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency?.code || ''}</strong>
                    {paymentType === 'installments' && (
                      <> in {calculation.totalPayments} monthly installments</>
                    )}.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert className="mt-4 bg-yellow-50 border-yellow-200">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-yellow-800">
                    <strong>Tracked borrower only:</strong> This borrower does not have an account. Please confirm the loan details with them directly before creating.
                    Total to repay:{' '}
                    <strong>{currency?.symbol || ''}{calculation.totalAmount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency?.code || ''}</strong>
                    {paymentType === 'installments' && (
                      <> in {calculation.totalPayments} monthly installments of <strong>{currency?.symbol || ''}{calculation.paymentAmount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency?.code || ''}</strong></>
                    )}.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        {borrower && !error && (
          <div className="flex justify-end space-x-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/l/loans')}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className={borrowerHasAccount ? 'bg-blue-600 hover:bg-blue-700' : ''}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {borrowerHasAccount ? 'Sending Offer...' : 'Creating Loan...'}
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  {borrowerHasAccount ? 'Send Loan Offer' : 'Create Loan'}
                </>
              )}
            </Button>
          </div>
        )}
      </form>
    </div>
  )
}

export default function NewLoanPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
      <NewLoanPageContent />
    </Suspense>
  )
}