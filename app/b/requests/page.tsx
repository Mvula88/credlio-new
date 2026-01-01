'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { z } from 'zod'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  ShoppingBag,
  Plus,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  CreditCard,
  Calendar,
  DollarSign,
  Percent,
  User,
  TrendingUp,
  Calculator,
  Loader2,
  FileText,
  Building2,
  Briefcase,
  Heart,
  GraduationCap,
  Home,
  RefreshCw
} from 'lucide-react'
import { format, addMonths } from 'date-fns'
import { toast } from 'sonner'
import { getCurrencyInfo, formatCurrency as formatCurrencyUtil, type CurrencyInfo } from '@/lib/utils/currency'

const requestSchema = z.object({
  amount: z.number().min(100, 'Minimum amount is 100'),
  purpose: z.string().min(10, 'Please describe the loan purpose'),
  termMonths: z.number().min(1).max(60),
  maxInterestRate: z.number().min(0).max(100),
  borrowerMessage: z.string().optional(),
})

type RequestInput = z.infer<typeof requestSchema>

export default function LoanRequestsPage() {
  const [loading, setLoading] = useState(true)
  // Track if borrower has a loan in progress (pending_signatures or pending_disbursement)
  // They can't request new loans until the current one becomes active
  const [pendingLoan, setPendingLoan] = useState<any>(null)
  const [myRequests, setMyRequests] = useState<any[]>([])
  const [offers, setOffers] = useState<any[]>([])
  const [selectedOffer, setSelectedOffer] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)
  const [borrower, setBorrower] = useState<any>(null)
  const [creditScore, setCreditScore] = useState<any>(null)
  const [defaultCurrency, setDefaultCurrency] = useState<string>('KES')
  const [currencyInfo, setCurrencyInfo] = useState<CurrencyInfo | null>(null)
  const [templates, setTemplates] = useState<any[]>([])
  const [showTemplates, setShowTemplates] = useState(false)
  const [verificationStatus, setVerificationStatus] = useState<any>(null)
  const [isVerified, setIsVerified] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<RequestInput>({
    resolver: zodResolver(requestSchema),
    defaultValues: {
      termMonths: 6,
      maxInterestRate: 15,
    },
  })

  const amount = watch('amount')
  const termMonths = watch('termMonths')
  const maxInterestRate = watch('maxInterestRate')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/b/login')
        return
      }

      // Get borrower record through borrower_user_links
      const { data: linkData, error: linkError } = await supabase
        .from('borrower_user_links')
        .select('borrower_id')
        .eq('user_id', user.id)
        .single()

      console.log('Loan requests - checking borrower link for user:', user.id)
      console.log('Link data:', linkData)
      console.log('Link error:', linkError)

      if (!linkData) {
        console.warn('No borrower link found, redirecting to onboarding')
        router.push('/b/onboarding')
        return
      }

      console.log('Fetching borrower data for borrower_id:', linkData.borrower_id)

      const { data: borrowerData, error: borrowerError } = await supabase
        .from('borrowers')
        .select(`
          *,
          borrower_scores(score),
          loans(status)
        `)
        .eq('id', linkData.borrower_id)
        .single()

      console.log('Borrower data:', borrowerData)
      console.log('Borrower error:', borrowerError)

      if (!borrowerData) {
        console.error('No borrower data found, redirecting to onboarding')
        router.push('/b/onboarding')
        return
      }

      // Check verification status - BLOCK if not verified
      const { data: verificationData } = await supabase
        .from('borrower_self_verification_status')
        .select('*')
        .eq('borrower_id', linkData.borrower_id)
        .maybeSingle()

      setVerificationStatus(verificationData)
      const verified = verificationData?.verification_status === 'approved'
      setIsVerified(verified)

      setBorrower(borrowerData)
      setCreditScore(borrowerData.borrower_scores?.[0]?.score || 500)

      // Get default currency for borrower's country
      const { data: currencyData } = await supabase
        .from('country_currency_allowed')
        .select('currency_code, currency_symbol, minor_units')
        .eq('country_code', borrowerData.country_code)
        .eq('is_default', true)
        .single()

      if (currencyData) {
        setDefaultCurrency(currencyData.currency_code)
        setCurrencyInfo({
          code: currencyData.currency_code,
          symbol: currencyData.currency_symbol,
          minorUnits: currencyData.minor_units,
          countryCode: borrowerData.country_code
        })
      }

      // Check for loans in pending_signatures or pending_disbursement status
      // Borrowers can't request new loans until current ones become active
      const { data: pendingLoans } = await supabase
        .from('loans')
        .select('id, status, principal_minor, currency, created_at, lenders(business_name)')
        .eq('borrower_id', linkData.borrower_id)
        .in('status', ['pending_signatures', 'pending_disbursement'])
        .limit(1)

      if (pendingLoans && pendingLoans.length > 0) {
        setPendingLoan(pendingLoans[0])
      } else {
        setPendingLoan(null)
      }

      // Get my loan requests
      // Use explicit foreign key since there are two relationships between loan_requests and loan_offers
      const { data: requests, error: requestsError } = await supabase
        .from('loan_requests')
        .select(`
          *,
          loan_offers!loan_offers_request_id_fkey(
            *,
            lenders(
              business_name
            )
          )
        `)
        .eq('borrower_id', borrowerData.id)
        .order('created_at', { ascending: false })

      console.log('Fetching requests for borrower_id:', borrowerData.id)
      console.log('Requests data:', requests)
      if (requestsError) {
        console.error('Requests error:', JSON.stringify(requestsError, null, 2))
      }

      // Keep amounts in minor units but convert interest rates
      const formattedRequests = requests?.map((r: any) => ({
        ...r,
        amount_minor: r.amount_minor, // Keep in minor units for formatCurrency
        max_interest_rate: r.max_apr_bps / 100, // Convert basis points to percentage
        loan_offers: r.loan_offers?.map((o: any) => ({
          ...o,
          amount_minor: o.amount_minor, // Keep in minor units
          interest_rate: o.apr_bps / 100,
        }))
      }))

      setMyRequests(formattedRequests || requests || [])

      // Get all offers for my requests
      const allOffers = formattedRequests?.flatMap((r: any) => r.loan_offers || []) || []
      setOffers(allOffers)

      // Load loan request templates
      const { data: templateData } = await supabase
        .from('loan_request_templates')
        .select('*')
        .eq('is_active', true)
        .order('purpose')

      setTemplates(templateData || [])
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const applyTemplate = (template: any) => {
    const minAmount = template.suggested_min_amount_minor / 100
    const maxAmount = template.suggested_max_amount_minor / 100
    const avgAmount = (minAmount + maxAmount) / 2

    setValue('amount', avgAmount)
    setValue('termMonths', template.suggested_term_months)
    setValue('maxInterestRate', template.typical_interest_rate_bps / 100)
    setValue('purpose', template.description || '')
    setShowTemplates(false)
  }

  const getTemplateIcon = (purpose: string) => {
    switch (purpose) {
      case 'business_expansion':
      case 'working_capital':
        return Briefcase
      case 'equipment_purchase':
      case 'inventory':
        return Building2
      case 'personal_emergency':
      case 'medical':
        return Heart
      case 'education':
        return GraduationCap
      case 'home_improvement':
        return Home
      case 'debt_consolidation':
        return RefreshCw
      default:
        return FileText
    }
  }

  const onSubmit = async (data: RequestInput) => {
    try {
      setSubmitting(true)

      if (!borrower) {
        return
      }

      // Get current user for borrower_user_id
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Create loan request
      const { error } = await supabase
        .from('loan_requests')
        .insert({
          borrower_id: borrower.id,
          borrower_user_id: user.id,
          country_code: borrower.country_code,
          currency: defaultCurrency, // Use the default currency from country config
          amount_minor: Math.round(data.amount * 100), // Convert dollars to cents
          purpose: data.purpose,
          term_months: data.termMonths,
          max_apr_bps: Math.round(data.maxInterestRate * 100), // Convert percentage to basis points
          borrower_message: data.borrowerMessage || null, // Personal message to lenders
          status: 'open',
        })

      if (error) {
        toast.error(error.message)
        return
      }

      toast.success('Loan request created successfully!')
      // Reload data
      await loadData()
      reset()
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const acceptOffer = async (offer: any) => {
    try {
      setSubmitting(true)

      // Accept the offer which will create the loan
      const { data, error } = await supabase.rpc('accept_offer', {
        p_offer_id: offer.id,
      })

      if (error) {
        console.error('Error accepting offer:', JSON.stringify(error, null, 2))
        const errorMsg = error.message || error.details || error.hint || 'Failed to accept offer'
        toast.error(errorMsg)
        return
      }

      toast.success('Offer accepted! Next step: Sign the loan agreement on your Loans page. Both you and the lender must sign before funds are sent.')
      // Redirect to loans page
      router.push('/b/loans')
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error?.message || 'An unexpected error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  const cancelRequest = async (requestId: string) => {
    try {
      const { error } = await supabase
        .from('loan_requests')
        .update({ status: 'cancelled' })
        .eq('id', requestId)

      if (error) {
        console.error('Error cancelling request:', error)
        return
      }

      await loadData()
    } catch (error) {
      console.error('Error:', error)
    }
  }

  // Typical extra rate per month (lenders usually charge more for longer terms)
  const EXTRA_RATE_PER_MONTH = 2 // 2% extra per additional month

  const calculateMonthlyPayment = (principalMinor: number, baseRate: number, months: number) => {
    // Convert minor units to major for calculation
    const principal = currencyInfo ? principalMinor / Math.pow(10, currencyInfo.minorUnits) : principalMinor / 100

    // Interest increases with term length:
    // Total Rate = Base Rate + (Extra Rate × (months - 1))
    // For 1 month: just base rate
    // For 6 months: base rate + 2% × 5 = base rate + 10%
    const totalRate = baseRate + (EXTRA_RATE_PER_MONTH * Math.max(0, months - 1))

    // Simple interest calculation:
    // Interest = Principal × Total Rate%
    // Total = Principal + Interest
    // Monthly Payment = Total / Months
    const interest = principal * (totalRate / 100)
    const total = principal + interest
    const payment = total / months

    // Convert back to minor units
    return currencyInfo ? Math.round(payment * Math.pow(10, currencyInfo.minorUnits)) : Math.round(payment * 100)
  }

  const calculateTotalInterest = (principalMinor: number, baseRate: number, months: number) => {
    const principal = currencyInfo ? principalMinor / Math.pow(10, currencyInfo.minorUnits) : principalMinor / 100
    const totalRate = baseRate + (EXTRA_RATE_PER_MONTH * Math.max(0, months - 1))
    const interest = principal * (totalRate / 100)
    return currencyInfo ? Math.round(interest * Math.pow(10, currencyInfo.minorUnits)) : Math.round(interest * 100)
  }

  const calculateTotalRate = (baseRate: number, months: number) => {
    return baseRate + (EXTRA_RATE_PER_MONTH * Math.max(0, months - 1))
  }

  const formatCurrency = (amountMinor: number) => {
    if (!currencyInfo) {
      // Fallback to USD if currency info not loaded yet
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
      }).format(amountMinor / 100)
    }
    return formatCurrencyUtil(amountMinor, currencyInfo)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // Show verification required message if not verified
  if (!isVerified) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-orange-600" />
            </div>
            <CardTitle className="text-2xl">Identity Verification Required</CardTitle>
            <CardDescription>
              Complete identity verification to access loan requests
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!verificationStatus && (
              <Alert className="border-orange-200 bg-orange-50">
                <AlertCircle className="h-4 w-4 text-orange-600" />
                <AlertTitle className="text-orange-900">Verification Not Started</AlertTitle>
                <AlertDescription className="text-orange-800">
                  You need to complete the identity verification process before you can request loans.
                  This helps protect both you and our lenders.
                </AlertDescription>
              </Alert>
            )}

            {verificationStatus?.verification_status === 'incomplete' && (
              <Alert className="border-orange-200 bg-orange-50">
                <AlertCircle className="h-4 w-4 text-orange-600" />
                <AlertTitle className="text-orange-900">Verification Incomplete</AlertTitle>
                <AlertDescription className="text-orange-800">
                  You started the verification process but haven't completed it yet.
                  Please complete all required steps to access loan requests.
                </AlertDescription>
              </Alert>
            )}

            {verificationStatus?.verification_status === 'pending' && (
              <Alert className="border-blue-200 bg-blue-50">
                <Clock className="h-4 w-4 text-blue-600" />
                <AlertTitle className="text-blue-900">Verification Under Review</AlertTitle>
                <AlertDescription className="text-blue-800">
                  Your identity verification documents are currently being reviewed by our team.
                  You'll be able to request loans once your verification is approved.
                  This usually takes 1-2 business days.
                </AlertDescription>
              </Alert>
            )}

            {verificationStatus?.verification_status === 'rejected' && (
              <Alert className="border-red-200 bg-red-50">
                <XCircle className="h-4 w-4 text-red-600" />
                <AlertTitle className="text-red-900">Verification Rejected</AlertTitle>
                <AlertDescription className="text-red-800">
                  Your verification was rejected. Please review the feedback and resubmit your documents.
                </AlertDescription>
              </Alert>
            )}

            {verificationStatus?.verification_status === 'banned' && (
              <Alert className="border-red-200 bg-red-50">
                <XCircle className="h-4 w-4 text-red-600" />
                <AlertTitle className="text-red-900">Account Suspended</AlertTitle>
                <AlertDescription className="text-red-800">
                  Your account has been suspended. Please contact support for more information.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-center space-x-3">
              {(!verificationStatus ||
                verificationStatus.verification_status === 'incomplete' ||
                verificationStatus.verification_status === 'rejected') && (
                <Button onClick={() => router.push('/b/onboarding')}>
                  {!verificationStatus || verificationStatus.verification_status === 'incomplete'
                    ? 'Complete Verification'
                    : 'Resubmit Documents'}
                </Button>
              )}
              <Button variant="outline" onClick={() => router.push('/b/overview')}>
                Back to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Removed active loan block - borrowers can have multiple active loans
  // The only restriction is one OPEN request at a time (handled in form section)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Loan Requests</h1>
        <p className="text-gray-600 mt-1">Request loans and review offers from lenders</p>
      </div>

      {/* Credit Score Alert */}
      <Alert className="border-blue-200 bg-blue-50">
        <TrendingUp className="h-4 w-4 text-blue-600" />
        <AlertDescription>
          Your current credit score is <strong>{creditScore}</strong>. 
          This score will be visible to lenders when you submit a loan request.
          <Button variant="link" className="ml-2 p-0 h-auto" onClick={() => router.push('/b/credit')}>
            View Credit Report →
          </Button>
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="new-request" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="new-request">
            <Plus className="mr-2 h-4 w-4" />
            New Request
          </TabsTrigger>
          <TabsTrigger value="my-requests">
            <ShoppingBag className="mr-2 h-4 w-4" />
            My Requests ({myRequests.filter(r => r.status === 'open').length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new-request" className="space-y-6">
          {/* Loan Request Templates */}
          {templates.length > 0 && (
            <Card className="border-2 border-primary/20">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center space-x-2">
                      <FileText className="h-5 w-5 text-primary" />
                      <span>Quick Start Templates</span>
                    </CardTitle>
                    <CardDescription>
                      Choose a template to pre-fill your loan request
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowTemplates(!showTemplates)}
                  >
                    {showTemplates ? 'Hide' : 'Show'} Templates
                  </Button>
                </div>
              </CardHeader>
              {showTemplates && (
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {templates.map((template) => {
                      const Icon = getTemplateIcon(template.purpose)
                      return (
                        <Card
                          key={template.id}
                          className="cursor-pointer hover:shadow-md hover:border-primary transition-all"
                          onClick={() => applyTemplate(template)}
                        >
                          <CardHeader className="pb-3">
                            <div className="flex items-center space-x-2">
                              <div className="p-2 bg-primary/10 rounded-lg">
                                <Icon className="h-4 w-4 text-primary" />
                              </div>
                              <CardTitle className="text-sm">{template.template_name}</CardTitle>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Amount Range:</span>
                              <span className="font-medium">
                                {formatCurrency(template.suggested_min_amount_minor)} -{' '}
                                {formatCurrency(template.suggested_max_amount_minor)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Term:</span>
                              <span className="font-medium">{template.suggested_term_months} months</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Typical Rate:</span>
                              <span className="font-medium">{template.typical_interest_rate_bps / 100}%</span>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* Block if there's a loan in progress (pending_signatures or pending_disbursement) */}
          {pendingLoan ? (
            <Card className="border-2 border-purple-300 bg-purple-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-purple-900">
                  <Clock className="h-5 w-5 text-purple-600 animate-pulse" />
                  Loan In Progress - Complete Current Process First
                </CardTitle>
                <CardDescription className="text-purple-700">
                  You have a loan that is waiting to be finalized. You can request a new loan once your current loan becomes active.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-white rounded-lg p-4 border border-purple-200">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Loan Amount</p>
                      <p className="font-bold text-lg">{formatCurrency(pendingLoan.principal_minor)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Status</p>
                      <Badge className={pendingLoan.status === 'pending_signatures' ? 'bg-purple-100 text-purple-800' : 'bg-orange-100 text-orange-800'}>
                        {pendingLoan.status === 'pending_signatures' ? '✍️ Awaiting Signatures' : '💸 Awaiting Disbursement'}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-gray-600">Lender</p>
                      <p className="font-medium">{pendingLoan.lenders?.business_name || 'Unknown'}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Created</p>
                      <p className="font-medium">{format(new Date(pendingLoan.created_at), 'MMM d, yyyy')}</p>
                    </div>
                  </div>
                </div>
                <Alert className="border-purple-200 bg-purple-50">
                  <AlertCircle className="h-4 w-4 text-purple-600" />
                  <AlertTitle className="text-purple-900">What to do next?</AlertTitle>
                  <AlertDescription className="text-purple-800">
                    {pendingLoan.status === 'pending_signatures'
                      ? 'Go to your Loans page to sign the loan agreement. Both you and the lender must sign before the loan can proceed.'
                      : 'The lender will send you the money. Once you receive it, confirm receipt on your Loans page to activate the loan.'}
                  </AlertDescription>
                </Alert>
                <Button onClick={() => router.push('/b/loans')} className="w-full bg-purple-600 hover:bg-purple-700">
                  Go to My Loans
                </Button>
              </CardContent>
            </Card>
          ) : myRequests.some(r => r.status === 'open') ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-blue-500" />
                  Active Request In Progress
                </CardTitle>
                <CardDescription>
                  You already have an open loan request. You can create a new request once your current request is closed, accepted, or expired.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Check the "My Requests" tab to view your active request and any offers you've received.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          ) : (
          <Card>
            <CardHeader>
              <CardTitle>Create Loan Request</CardTitle>
              <CardDescription>
                Submit your loan requirements and receive offers from multiple lenders
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit(onSubmit)}>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="amount">
                      Loan Amount ({currencyInfo?.symbol || '$'})
                    </Label>
                    <Input
                      id="amount"
                      type="number"
                      step="100"
                      min="100"
                      {...register('amount', { valueAsNumber: true })}
                    />
                    {errors.amount && (
                      <p className="text-sm text-red-500">{errors.amount.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="termMonths">Loan Term (Months)</Label>
                    <Input
                      id="termMonths"
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
                    <Label htmlFor="maxInterestRate">Maximum Interest Rate (%)</Label>
                    <Input
                      id="maxInterestRate"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      {...register('maxInterestRate', { valueAsNumber: true })}
                    />
                    {errors.maxInterestRate && (
                      <p className="text-sm text-red-500">{errors.maxInterestRate.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="purpose">Loan Purpose</Label>
                  <Textarea
                    id="purpose"
                    placeholder="Describe what you need the loan for..."
                    rows={3}
                    {...register('purpose')}
                  />
                  {errors.purpose && (
                    <p className="text-sm text-red-500">{errors.purpose.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="borrowerMessage">
                    Message to Lenders <span className="text-gray-400 text-sm">(Optional)</span>
                  </Label>
                  <Textarea
                    id="borrowerMessage"
                    placeholder="Add a personal message to potential lenders. Explain your situation, why you need the loan, or any other details that might help them understand your request better..."
                    rows={4}
                    {...register('borrowerMessage')}
                  />
                  <p className="text-xs text-gray-500">
                    This message will be visible to all lenders viewing your request
                  </p>
                </div>

                {amount && termMonths && maxInterestRate && currencyInfo && (
                  <Alert className="bg-blue-50 border-blue-200">
                    <Calculator className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="space-y-2">
                      <div className="text-sm text-gray-600">
                        <strong>Estimated Loan Breakdown:</strong>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>Principal:</div>
                        <div className="font-medium">{formatCurrency(Math.round(amount * Math.pow(10, currencyInfo.minorUnits)))}</div>

                        <div>Base Rate:</div>
                        <div className="font-medium">{maxInterestRate}%</div>

                        <div>Term Extra (+2%/month):</div>
                        <div className="font-medium">+{(EXTRA_RATE_PER_MONTH * Math.max(0, termMonths - 1))}%</div>

                        <div>Total Interest Rate:</div>
                        <div className="font-medium text-orange-600">{calculateTotalRate(maxInterestRate, termMonths)}%</div>

                        <div>Total Interest:</div>
                        <div className="font-medium text-orange-600">
                          {formatCurrency(calculateTotalInterest(
                            Math.round(amount * Math.pow(10, currencyInfo.minorUnits)),
                            maxInterestRate,
                            termMonths
                          ))}
                        </div>

                        <div className="font-semibold border-t pt-1">Total to Pay:</div>
                        <div className="font-bold text-blue-700 border-t pt-1">
                          {formatCurrency(
                            Math.round(amount * Math.pow(10, currencyInfo.minorUnits)) +
                            calculateTotalInterest(
                              Math.round(amount * Math.pow(10, currencyInfo.minorUnits)),
                              maxInterestRate,
                              termMonths
                            )
                          )}
                        </div>

                        <div className="font-semibold">Monthly Payment:</div>
                        <div className="font-bold text-green-700">
                          {formatCurrency(calculateMonthlyPayment(
                            Math.round(amount * Math.pow(10, currencyInfo.minorUnits)),
                            maxInterestRate,
                            termMonths
                          ))} × {termMonths}
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        Note: Actual rate may vary based on lender's offer. Longer terms typically have higher rates.
                      </p>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
              <CardContent>
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating Request...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Submit Loan Request
                    </>
                  )}
                </Button>
              </CardContent>
            </form>
          </Card>
          )}
        </TabsContent>

        <TabsContent value="my-requests" className="space-y-4">
          {myRequests.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-gray-500">You haven't made any loan requests yet</p>
                <Button 
                  className="mt-4"
                  onClick={() => setValue('amount', 1000)}
                >
                  Create Your First Request
                </Button>
              </CardContent>
            </Card>
          ) : (
            myRequests.map((request) => (
              <Card key={request.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>{formatCurrency(request.amount_minor)}</CardTitle>
                      <CardDescription>{request.purpose}</CardDescription>
                    </div>
                    <Badge
                      className={
                        request.status === 'open'
                          ? 'bg-green-100 text-green-800'
                          : request.status === 'accepted'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }
                    >
                      {request.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Term</p>
                      <p className="font-medium">{request.term_months} months</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Max Rate</p>
                      <p className="font-medium">{request.max_interest_rate}%</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Created</p>
                      <p className="font-medium">
                        {format(new Date(request.created_at), 'MMM dd')}
                      </p>
                    </div>
                  </div>

                  {/* Offers */}
                  {request.loan_offers && request.loan_offers.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-medium flex items-center">
                        <CreditCard className="mr-2 h-4 w-4" />
                        Offers Received ({request.loan_offers.length})
                      </h4>
                      {request.loan_offers.map((offer: any) => {
                        // Calculate new interest system values
                        const baseRate = offer.base_rate_percent || offer.interest_rate || 0
                        const extraRate = offer.extra_rate_per_installment || 0
                        const numInstallments = offer.num_installments || offer.term_months || 1
                        const paymentType = offer.payment_type || (numInstallments <= 1 ? 'once_off' : 'installments')
                        const totalRate = paymentType === 'once_off' ? baseRate : baseRate + (extraRate * (numInstallments - 1))
                        const principal = offer.amount_minor / 100
                        const interestAmount = principal * (totalRate / 100)
                        const totalAmount = principal + interestAmount
                        const perInstallment = totalAmount / numInstallments

                        return (
                        <div key={offer.id} className="border rounded-lg p-3 space-y-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium">
                                {offer.lenders?.business_name || 'Lender'}
                              </p>
                              <p className="text-sm text-gray-600">
                                {formatCurrency(offer.amount_minor)} • {totalRate}% interest • {paymentType === 'once_off' ? 'Once-off' : `${numInstallments} installments`}
                              </p>
                            </div>
                            <Badge
                              className={
                                offer.status === 'accepted'
                                  ? 'bg-green-100 text-green-800'
                                  : offer.status === 'rejected'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }
                            >
                              {offer.status}
                            </Badge>
                          </div>

                          {/* Lender's Message */}
                          {offer.lender_message && (
                            <div className="border-l-4 border-green-400 bg-green-50 p-2 rounded-r-lg">
                              <p className="text-xs text-green-600 font-medium mb-1">Message from Lender</p>
                              <p className="text-sm text-green-900">{offer.lender_message}</p>
                            </div>
                          )}
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-600">
                              {paymentType === 'once_off'
                                ? 'Single payment:'
                                : `Per installment (${numInstallments}x):`}
                            </span>
                            <span className="font-bold text-green-700">
                              {formatCurrency(perInstallment * 100)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            {offer.status === 'pending' && request.status === 'open' && (
                              <div className="flex space-x-2">
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button 
                                      size="sm"
                                      onClick={() => setSelectedOffer(offer)}
                                    >
                                      Review
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-md">
                                    <DialogHeader>
                                      <DialogTitle>Review Loan Offer</DialogTitle>
                                      <DialogDescription>
                                        Carefully review what you will pay before accepting
                                      </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                      {/* Lender's Message */}
                                      {offer.lender_message && (
                                        <div className="border-l-4 border-green-400 bg-green-50 p-3 rounded-r-lg">
                                          <p className="text-xs text-green-600 font-medium mb-1">Message from {offer.lenders?.business_name || 'Lender'}</p>
                                          <p className="text-sm text-green-900">{offer.lender_message}</p>
                                        </div>
                                      )}

                                      {/* Clear Breakdown Card */}
                                      <div className="border-2 border-blue-300 rounded-lg p-4 bg-blue-50">
                                        <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                                          <Calculator className="h-4 w-4" />
                                          What You Will Pay
                                        </h4>
                                        <div className="space-y-2 text-sm">
                                          <div className="flex justify-between">
                                            <span className="text-gray-600">Loan Amount (Principal):</span>
                                            <span className="font-medium">{formatCurrency(offer.amount_minor)}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-gray-600">Interest Rate:</span>
                                            <span className="font-medium text-orange-600">{totalRate}%</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-gray-600">Interest Amount:</span>
                                            <span className="font-medium text-orange-600">{formatCurrency(interestAmount * 100)}</span>
                                          </div>
                                          <div className="border-t pt-2 mt-2">
                                            <div className="flex justify-between text-lg">
                                              <span className="font-bold text-blue-900">TOTAL TO PAY:</span>
                                              <span className="font-bold text-blue-900">{formatCurrency(totalAmount * 100)}</span>
                                            </div>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Payment Schedule */}
                                      <div className="border rounded-lg p-4 bg-gray-50">
                                        <h4 className="font-semibold mb-3 flex items-center gap-2">
                                          <Calendar className="h-4 w-4" />
                                          How You Will Pay
                                        </h4>
                                        <div className="space-y-2 text-sm">
                                          <div className="flex justify-between">
                                            <span className="text-gray-600">Payment Type:</span>
                                            <span className="font-medium">
                                              {paymentType === 'once_off' ? 'Single Payment' : `${numInstallments} Installments`}
                                            </span>
                                          </div>
                                          {paymentType === 'once_off' ? (
                                            <div className="bg-green-100 rounded p-2 mt-2">
                                              <div className="flex justify-between">
                                                <span className="text-green-800">Pay once after 1 month:</span>
                                                <span className="font-bold text-green-900">{formatCurrency(totalAmount * 100)}</span>
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="bg-green-100 rounded p-2 mt-2 space-y-1">
                                              <div className="flex justify-between">
                                                <span className="text-green-800">Pay each month:</span>
                                                <span className="font-bold text-green-900">{formatCurrency(perInstallment * 100)}</span>
                                              </div>
                                              <div className="flex justify-between text-xs">
                                                <span className="text-green-700">For {numInstallments} months</span>
                                                <span className="text-green-700">= {formatCurrency(totalAmount * 100)} total</span>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      <Alert>
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertDescription>
                                          By accepting, you agree to pay {formatCurrency(totalAmount * 100)} in total.
                                          The lender will disburse {formatCurrency(offer.amount_minor)} to you.
                                        </AlertDescription>
                                      </Alert>
                                    </div>
                                    <DialogFooter>
                                      <Button
                                        variant="outline"
                                        onClick={() => setSelectedOffer(null)}
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        onClick={() => acceptOffer(offer)}
                                        disabled={submitting}
                                      >
                                        {submitting ? 'Processing...' : 'Accept Offer'}
                                      </Button>
                                    </DialogFooter>
                                  </DialogContent>
                                </Dialog>
                              </div>
                            )}
                          </div>
                        </div>
                      )})}
                    </div>
                  )}

                  {request.status === 'open' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => cancelRequest(request.id)}
                      className="w-full"
                    >
                      Cancel Request
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}