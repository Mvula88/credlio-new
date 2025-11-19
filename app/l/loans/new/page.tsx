'use client'

import { useState, useEffect } from 'react'
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
  interestRate: z.number().min(0).max(100),
  termMonths: z.number().min(1).max(60),
  repaymentFrequency: z.enum(['weekly', 'biweekly', 'monthly']),
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

export default function NewLoanPage() {
  const [loading, setLoading] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [borrower, setBorrower] = useState<any>(null)
  const [currency, setCurrency] = useState<any>(null)
  const [calculation, setCalculation] = useState<any>(null)
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
      repaymentFrequency: 'monthly',
      termMonths: 6,
      interestRate: 10,
    },
  })

  const principalAmount = watch('principalAmount')
  const interestRate = watch('interestRate')
  const termMonths = watch('termMonths')
  const repaymentFrequency = watch('repaymentFrequency')
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
    if (principalAmount && interestRate !== undefined && termMonths) {
      calculateLoan()
    }
  }, [principalAmount, interestRate, termMonths, repaymentFrequency])

  const loadLenderProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('country_code')
        .eq('user_id', user.id)
        .single()
      
      if (profile && CURRENCIES[profile.country_code]) {
        setCurrency(CURRENCIES[profile.country_code])
      }
    }
  }

  const loadBorrower = async (borrowerId: string) => {
    const { data } = await supabase
      .from('borrowers')
      .select(`
        *,
        borrower_scores(score),
        loans!inner(status)
      `)
      .eq('id', borrowerId)
      .single()
    
    if (data) {
      setBorrower(data)
      setValue('borrowerId', borrowerId)
      
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
    const rate = (interestRate || 0) / 100
    const months = termMonths || 1

    // Simple interest calculation
    const totalInterest = principal * rate * (months / 12)
    const totalAmount = principal + totalInterest

    // Calculate payment frequency
    let paymentsPerMonth = 1
    if (repaymentFrequency === 'weekly') paymentsPerMonth = 4
    if (repaymentFrequency === 'biweekly') paymentsPerMonth = 2
    
    const totalPayments = months * paymentsPerMonth
    const paymentAmount = totalAmount / totalPayments

    setCalculation({
      totalInterest,
      totalAmount,
      paymentAmount,
      totalPayments,
      firstPaymentDate: getFirstPaymentDate(),
      lastPaymentDate: addMonths(new Date(), months),
    })
  }

  const getFirstPaymentDate = () => {
    const today = new Date()
    switch (repaymentFrequency) {
      case 'weekly':
        return new Date(today.setDate(today.getDate() + 7))
      case 'biweekly':
        return new Date(today.setDate(today.getDate() + 14))
      case 'monthly':
        return new Date(today.setMonth(today.getMonth() + 1))
      default:
        return new Date(today.setMonth(today.getMonth() + 1))
    }
  }

  const onSubmit = async (data: LoanInput) => {
    try {
      setLoading(true)
      setError(null)

      if (!borrower) {
        setError('Please select a borrower first')
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

      // Create the loan
      const { data: loan, error: loanError } = await supabase
        .from('loans')
        .insert({
          borrower_id: borrower.id,
          lender_id: lender.user_id,
          principal_amount: data.principalAmount,
          interest_rate: data.interestRate,
          term_months: data.termMonths,
          repayment_frequency: data.repaymentFrequency,
          currency: currency?.code || 'USD',
          total_amount: calculation.totalAmount,
          purpose: data.purpose,
          status: 'active',
          disbursement_date: new Date().toISOString(),
          next_payment_date: calculation.firstPaymentDate.toISOString(),
        })
        .select()
        .single()

      if (loanError) {
        if (loanError.message.includes('already have an active loan')) {
          setError('This borrower already has an active loan. They must repay it before taking a new one.')
        } else {
          setError('Failed to create loan. Please try again.')
        }
        console.error('Loan error:', loanError)
        return
      }

      // Create repayment schedule
      const schedules = []
      let currentDate = calculation.firstPaymentDate
      
      for (let i = 0; i < calculation.totalPayments; i++) {
        schedules.push({
          loan_id: loan.id,
          due_date: new Date(currentDate).toISOString(),
          amount: calculation.paymentAmount,
          principal_portion: data.principalAmount / calculation.totalPayments,
          interest_portion: calculation.totalInterest / calculation.totalPayments,
          status: 'pending',
        })

        // Move to next payment date
        switch (data.repaymentFrequency) {
          case 'weekly':
            currentDate.setDate(currentDate.getDate() + 7)
            break
          case 'biweekly':
            currentDate.setDate(currentDate.getDate() + 14)
            break
          case 'monthly':
            currentDate.setMonth(currentDate.getMonth() + 1)
            break
        }
      }

      const { error: scheduleError } = await supabase
        .from('repayment_schedules')
        .insert(schedules)

      if (scheduleError) {
        console.error('Schedule error:', scheduleError)
      }

      // Update borrower's credit utilization
      await supabase.rpc('update_credit_score', {
        p_borrower_id: borrower.id,
        p_event_type: 'loan_taken',
        p_amount: data.principalAmount,
      })

      router.push(`/l/loans/${loan.id}`)
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

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
                      setValue('borrowerId', '')
                      setValue('nationalId', '')
                    }}
                  >
                    Change
                  </Button>
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
                Configure the loan terms and conditions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="principal">Principal Amount ({currency?.symbol || '$'})</Label>
                  <Input
                    id="principal"
                    type="number"
                    step="100"
                    min="100"
                    {...register('principalAmount', { valueAsNumber: true })}
                  />
                  {errors.principalAmount && (
                    <p className="text-sm text-red-500">{errors.principalAmount.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="interest">Interest Rate (%)</Label>
                  <Input
                    id="interest"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    {...register('interestRate', { valueAsNumber: true })}
                  />
                  {errors.interestRate && (
                    <p className="text-sm text-red-500">{errors.interestRate.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="term">Term (Months)</Label>
                  <Input
                    id="term"
                    type="number"
                    min="1"
                    max="60"
                    {...register('termMonths', { valueAsNumber: true })}
                  />
                  {errors.termMonths && (
                    <p className="text-sm text-red-500">{errors.termMonths.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Repayment Frequency</Label>
                  <RadioGroup
                    value={repaymentFrequency}
                    onValueChange={(value) => setValue('repaymentFrequency', value as any)}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="weekly" id="weekly" />
                      <Label htmlFor="weekly">Weekly</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="biweekly" id="biweekly" />
                      <Label htmlFor="biweekly">Bi-weekly</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="monthly" id="monthly" />
                      <Label htmlFor="monthly">Monthly</Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="purpose">Loan Purpose</Label>
                <Textarea
                  id="purpose"
                  placeholder="Describe what the loan will be used for..."
                  rows={3}
                  {...register('purpose')}
                />
                {errors.purpose && (
                  <p className="text-sm text-red-500">{errors.purpose.message}</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loan Calculation */}
        {calculation && borrower && !error && (
          <Card>
            <CardHeader>
              <CardTitle>Loan Summary</CardTitle>
              <CardDescription>
                Review the calculated loan details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Principal Amount:</span>
                    <span className="font-medium">
                      {currency?.symbol}{principalAmount?.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Interest:</span>
                    <span className="font-medium">
                      {currency?.symbol}{calculation.totalInterest.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total Amount:</span>
                    <span>
                      {currency?.symbol}{calculation.totalAmount.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Payment Amount:</span>
                    <span className="font-medium">
                      {currency?.symbol}{calculation.paymentAmount.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Payments:</span>
                    <span className="font-medium">{calculation.totalPayments}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">First Payment:</span>
                    <span className="font-medium">
                      {format(calculation.firstPaymentDate, 'MMM dd, yyyy')}
                    </span>
                  </div>
                </div>
              </div>

              <Alert className="mt-4">
                <Calculator className="h-4 w-4" />
                <AlertDescription>
                  The borrower will pay {currency?.symbol}{calculation.paymentAmount.toFixed(2)} {repaymentFrequency} for {termMonths} months,
                  totaling {currency?.symbol}{calculation.totalAmount.toLocaleString()}
                </AlertDescription>
              </Alert>
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
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Loan...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Create Loan
                </>
              )}
            </Button>
          </div>
        )}
      </form>
    </div>
  )
}