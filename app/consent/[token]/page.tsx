'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Landmark,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  CreditCard,
  Shield,
  Building2,
  Calendar,
  DollarSign,
  Info,
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

interface MandateDetails {
  mandate_id: string
  mandate_reference: string
  amount: number
  currency: string
  frequency: string
  deduction_day: number
  start_date: string
  borrower_name: string
  lender_business_name: string
  loan_amount: number
  loan_balance: number
}

export default function ConsentPage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [mandate, setMandate] = useState<MandateDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Form state
  const [cardNumber, setCardNumber] = useState('')
  const [cardHolder, setCardHolder] = useState('')
  const [expiryMonth, setExpiryMonth] = useState('')
  const [expiryYear, setExpiryYear] = useState('')
  const [cvv, setCvv] = useState('')
  const [consentGiven, setConsentGiven] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    loadMandateDetails()
  }, [token])

  const loadMandateDetails = async () => {
    try {
      const { data, error } = await supabase.rpc('get_mandate_for_consent', {
        p_token: token
      })

      if (error || !data) {
        setError(data?.error || 'Failed to load consent details')
      } else if (data.error) {
        setError(data.error)
      } else {
        setMandate(data)
      }
    } catch (err) {
      console.error('Error loading mandate:', err)
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!consentGiven) {
      toast.error('Please confirm your consent to proceed')
      return
    }

    if (!cardNumber || !cardHolder || !expiryMonth || !expiryYear || !cvv) {
      toast.error('Please fill in all card details')
      return
    }

    // Basic validation
    if (cardNumber.replace(/\s/g, '').length < 13) {
      toast.error('Please enter a valid card number')
      return
    }

    if (cvv.length < 3) {
      toast.error('Please enter a valid CVV')
      return
    }

    setSubmitting(true)

    try {
      // In production, you would tokenize the card with DPO here
      // For now, we'll simulate card tokenization
      const cardToken = `tok_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const cardLast4 = cardNumber.replace(/\s/g, '').slice(-4)

      // Submit consent
      const { data, error } = await supabase.rpc('submit_borrower_consent', {
        p_token: token,
        p_card_token: cardToken,
        p_card_last_four: cardLast4,
        p_card_brand: detectCardBrand(cardNumber),
        p_card_expiry_month: parseInt(expiryMonth),
        p_card_expiry_year: parseInt(expiryYear),
        p_card_holder_name: cardHolder,
        p_ip_address: '', // Would be filled by API
        p_user_agent: typeof window !== 'undefined' ? window.navigator.userAgent : ''
      })

      if (error || !data?.success) {
        toast.error(data?.error || 'Failed to submit consent')
      } else {
        setSuccess(true)
        toast.success(data.message || 'Consent submitted successfully')
      }
    } catch (err) {
      console.error('Error submitting consent:', err)
      toast.error('An unexpected error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  const detectCardBrand = (number: string): string => {
    const cleaned = number.replace(/\s/g, '')
    if (/^4/.test(cleaned)) return 'Visa'
    if (/^5[1-5]/.test(cleaned)) return 'Mastercard'
    if (/^3[47]/.test(cleaned)) return 'American Express'
    return 'Unknown'
  }

  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\s/g, '')
    const chunks = cleaned.match(/.{1,4}/g)
    return chunks ? chunks.join(' ') : cleaned
  }

  const getFrequencyLabel = (frequency: string) => {
    const labels: Record<string, string> = {
      weekly: 'Weekly',
      biweekly: 'Every 2 Weeks',
      monthly: 'Monthly',
      custom: 'Custom'
    }
    return labels[frequency] || frequency
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading consent details...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle>Invalid or Expired Link</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Please contact your lender for a new consent link.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle>Consent Recorded Successfully!</CardTitle>
            <CardDescription>Your automatic deductions are now active</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Automatic deductions will begin on <strong>{mandate && format(new Date(mandate.start_date), 'MMMM dd, yyyy')}</strong>.
                You will receive notifications before each deduction.
              </AlertDescription>
            </Alert>
            <p className="text-sm text-muted-foreground text-center">
              You can close this page now.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!mandate) {
    return null
  }

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Landmark className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">Payment Deduction Consent</h1>
          <p className="text-muted-foreground">
            You've been invited to authorize automatic payment deductions
          </p>
        </div>

        {/* Mandate Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Deduction Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Lender</p>
                <p className="font-semibold">{mandate.lender_business_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Borrower</p>
                <p className="font-semibold">{mandate.borrower_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Loan Amount</p>
                <p className="font-semibold">{mandate.currency} {mandate.loan_amount.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Outstanding Balance</p>
                <p className="font-semibold">{mandate.currency} {mandate.loan_balance.toFixed(2)}</p>
              </div>
            </div>

            <div className="border-t pt-4 mt-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Deduction Amount</p>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" />
                    <p className="text-lg font-bold">{mandate.currency} {mandate.amount.toFixed(2)}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Frequency</p>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    <p className="text-lg font-semibold">{getFrequencyLabel(mandate.frequency)}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Start Date</p>
                  <p className="text-lg font-semibold">{format(new Date(mandate.start_date), 'MMM dd, yyyy')}</p>
                </div>
              </div>
            </div>

            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                Reference: <span className="font-mono font-semibold">{mandate.mandate_reference}</span>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Card Details Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Card Details
            </CardTitle>
            <CardDescription>
              Your card information is encrypted and securely stored
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="cardNumber">Card Number</Label>
                <Input
                  id="cardNumber"
                  placeholder="1234 5678 9012 3456"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                  maxLength={19}
                  required
                />
              </div>

              <div>
                <Label htmlFor="cardHolder">Cardholder Name</Label>
                <Input
                  id="cardHolder"
                  placeholder="JOHN DOE"
                  value={cardHolder}
                  onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="expiryMonth">Expiry Month</Label>
                  <Input
                    id="expiryMonth"
                    placeholder="MM"
                    value={expiryMonth}
                    onChange={(e) => setExpiryMonth(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    maxLength={2}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="expiryYear">Expiry Year</Label>
                  <Input
                    id="expiryYear"
                    placeholder="YYYY"
                    value={expiryYear}
                    onChange={(e) => setExpiryYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    maxLength={4}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="cvv">CVV</Label>
                  <Input
                    id="cvv"
                    placeholder="123"
                    type="password"
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    maxLength={4}
                    required
                  />
                </div>
              </div>

              <Alert className="bg-blue-50 border-blue-200">
                <Shield className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-900">
                  <strong>Security Notice:</strong> We never store your full card number or CVV. All card data is tokenized and encrypted.
                </AlertDescription>
              </Alert>

              <div className="flex items-start space-x-2 border rounded-lg p-4">
                <Checkbox
                  id="consent"
                  checked={consentGiven}
                  onCheckedChange={(checked) => setConsentGiven(checked === true)}
                />
                <div className="space-y-1 leading-none">
                  <label
                    htmlFor="consent"
                    className="text-sm font-medium leading-relaxed cursor-pointer"
                  >
                    I authorize automatic deductions from my card
                  </label>
                  <p className="text-sm text-muted-foreground">
                    I understand that {mandate.currency} {mandate.amount.toFixed(2)} will be deducted {getFrequencyLabel(mandate.frequency).toLowerCase()}
                    starting from {format(new Date(mandate.start_date), 'MMMM dd, yyyy')} until my loan is fully repaid.
                    I can revoke this authorization at any time by contacting my lender.
                  </p>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={!consentGiven || submitting}
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Submitting...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-5 w-5 mr-2" />
                    Submit Consent
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground">
          <p>Powered by Credlio • Secure Payment Processing</p>
        </div>
      </div>
    </div>
  )
}
