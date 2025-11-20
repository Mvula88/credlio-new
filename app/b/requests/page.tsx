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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
import { getCurrencyInfo, formatCurrency as formatCurrencyUtil, type CurrencyInfo } from '@/lib/utils/currency'

const requestSchema = z.object({
  amount: z.number().min(100, 'Minimum amount is 100'),
  purpose: z.string().min(10, 'Please describe the loan purpose'),
  termMonths: z.number().min(1).max(60),
  maxInterestRate: z.number().min(0).max(100),
})

type RequestInput = z.infer<typeof requestSchema>

export default function LoanRequestsPage() {
  const [loading, setLoading] = useState(true)
  const [hasActiveLoan, setHasActiveLoan] = useState(false)
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

      // Check for active loan
      const activeLoan = borrowerData.loans?.find((l: any) => l.status === 'active')
      setHasActiveLoan(!!activeLoan)

      // Get my loan requests
      const { data: requests } = await supabase
        .from('loan_requests')
        .select(`
          *,
          loan_offers(
            *,
            lenders(
              business_name
            )
          )
        `)
        .eq('borrower_id', borrowerData.id)
        .order('created_at', { ascending: false })

      // Keep amounts in minor units but convert interest rates
      const formattedRequests = requests?.map(r => ({
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
      const allOffers = formattedRequests?.flatMap(r => r.loan_offers || []) || []
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
          status: 'open',
        })

      if (error) {
        console.error('Error creating request:', error)
        return
      }

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
      const { error } = await supabase.rpc('accept_offer', {
        p_offer_id: offer.id,
      })

      if (error) {
        console.error('Error accepting offer:', error)
        return
      }

      // Redirect to loans page
      router.push('/b/loans')
    } catch (error) {
      console.error('Error:', error)
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

  const calculateMonthlyPayment = (principalMinor: number, rate: number, months: number) => {
    // Convert minor units to major for calculation
    const principal = currencyInfo ? principalMinor / Math.pow(10, currencyInfo.minorUnits) : principalMinor / 100

    const monthlyRate = rate / 100 / 12
    if (monthlyRate === 0) {
      const payment = principal / months
      // Convert back to minor units
      return currencyInfo ? Math.round(payment * Math.pow(10, currencyInfo.minorUnits)) : Math.round(payment * 100)
    }

    const payment = principal *
      (monthlyRate * Math.pow(1 + monthlyRate, months)) /
      (Math.pow(1 + monthlyRate, months) - 1)

    // Convert back to minor units
    return currencyInfo ? Math.round(payment * Math.pow(10, currencyInfo.minorUnits)) : Math.round(payment * 100)
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

  if (hasActiveLoan) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-yellow-100 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-yellow-600" />
            </div>
            <CardTitle className="text-2xl">Active Loan Detected</CardTitle>
            <CardDescription>
              You currently have an active loan
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Single Loan Policy</AlertTitle>
              <AlertDescription>
                To maintain a healthy credit profile and prevent over-borrowing, 
                you can only have one active loan at a time. Please complete your 
                current loan repayments before requesting a new loan.
              </AlertDescription>
            </Alert>
            <div className="flex justify-center space-x-3">
              <Button onClick={() => router.push('/b/loans')}>
                View Current Loan
              </Button>
              <Button variant="outline" onClick={() => router.push('/b/repayments')}>
                Payment Schedule
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

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
                                {formatCurrency(template.suggested_min_amount_minor / 100)} -{' '}
                                {formatCurrency(template.suggested_max_amount_minor / 100)}
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

                {amount && termMonths && maxInterestRate && currencyInfo && (
                  <Alert>
                    <Calculator className="h-4 w-4" />
                    <AlertDescription>
                      Estimated monthly payment: {' '}
                      <strong>
                        {formatCurrency(calculateMonthlyPayment(
                          Math.round(amount * Math.pow(10, currencyInfo.minorUnits)),
                          maxInterestRate,
                          termMonths
                        ))}
                      </strong>
                      {' '}(at maximum {maxInterestRate}% interest rate)
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
                      {request.loan_offers.map((offer: any) => (
                        <div key={offer.id} className="border rounded-lg p-3 space-y-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium">
                                {offer.lenders?.business_name || 'Lender'}
                              </p>
                              <p className="text-sm text-gray-600">
                                {formatCurrency(offer.amount_minor)} at {offer.interest_rate}% for {offer.term_months} months
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
                          <div className="flex justify-between items-center">
                            <p className="text-sm">
                              Monthly: {formatCurrency(
                                calculateMonthlyPayment(
                                  offer.amount_minor,
                                  offer.interest_rate,
                                  offer.term_months
                                )
                              )}
                            </p>
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
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Review Loan Offer</DialogTitle>
                                      <DialogDescription>
                                        Carefully review the terms before accepting
                                      </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                      <div className="space-y-3">
                                        <div className="flex justify-between">
                                          <span className="text-gray-600">Loan Amount:</span>
                                          <span className="font-medium">
                                            {formatCurrency(offer.amount_minor)}
                                          </span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-gray-600">Interest Rate:</span>
                                          <span className="font-medium">{offer.interest_rate}%</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-gray-600">Term:</span>
                                          <span className="font-medium">{offer.term_months} months</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-gray-600">Monthly Payment:</span>
                                          <span className="font-medium">
                                            {formatCurrency(
                                              calculateMonthlyPayment(
                                                offer.amount_minor,
                                                offer.interest_rate,
                                                offer.term_months
                                              )
                                            )}
                                          </span>
                                        </div>
                                        <div className="flex justify-between text-lg font-bold">
                                          <span>Total Repayment:</span>
                                          <span>
                                            {formatCurrency(
                                              calculateMonthlyPayment(
                                                offer.amount_minor,
                                                offer.interest_rate,
                                                offer.term_months
                                              ) * offer.term_months
                                            )}
                                          </span>
                                        </div>
                                      </div>

                                      <Alert>
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertDescription>
                                          By accepting this offer, you agree to the loan terms. 
                                          The loan will be disbursed immediately and you'll need to 
                                          start repayments as scheduled.
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
                      ))}
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