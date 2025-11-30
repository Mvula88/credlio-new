'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  CreditCard,
  Calendar,
  Percent,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  Calculator,
  User,
  Building,
  X,
  ThumbsUp,
  ThumbsDown,
  Info,
  ArrowLeft
} from 'lucide-react'
import { format, addMonths } from 'date-fns'
import { getCurrencyByCountry, getCurrencyInfo, formatCurrency as formatCurrencyUtil, type CurrencyInfo } from '@/lib/utils/currency'

export default function PendingLoanOffersPage() {
  const [loading, setLoading] = useState(true)
  const [pendingOffers, setPendingOffers] = useState<any[]>([])
  const [selectedOffer, setSelectedOffer] = useState<any>(null)
  const [borrowerCurrency, setBorrowerCurrency] = useState<CurrencyInfo | null>(null)
  const [showDeclineDialog, setShowDeclineDialog] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [processing, setProcessing] = useState(false)
  const [actionResult, setActionResult] = useState<{ success: boolean; message: string } | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadPendingOffers()
  }, [])

  const loadPendingOffers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/b/login')
        return
      }

      // Get borrower link
      const { data: linkData } = await supabase
        .from('borrower_user_links')
        .select('borrower_id')
        .eq('user_id', user.id)
        .single()

      if (!linkData) {
        setLoading(false)
        return
      }

      // Get borrower record for currency
      const { data: borrowerData } = await supabase
        .from('borrowers')
        .select('country_code')
        .eq('id', linkData.borrower_id)
        .single()

      if (borrowerData) {
        const currency = getCurrencyByCountry(borrowerData.country_code)
        if (currency) {
          setBorrowerCurrency(currency)
        }
      }

      // Get pending loan offers
      const { data: offers } = await supabase
        .from('loans')
        .select(`
          *,
          lenders!inner(
            user_id,
            business_name,
            verification_status
          ),
          profiles:lenders!inner(
            user_id,
            profiles!inner(full_name, phone_e164)
          )
        `)
        .eq('borrower_id', linkData.borrower_id)
        .eq('status', 'pending_offer')
        .order('created_at', { ascending: false })

      if (offers) {
        setPendingOffers(offers)
      }
    } catch (error) {
      console.error('Error loading pending offers:', error)
    } finally {
      setLoading(false)
    }
  }

  // Format currency based on the loan's currency (not borrower's default)
  const formatCurrency = (amountMinor: number, currencyCode?: string) => {
    // Try to get currency from the loan's currency code first
    if (currencyCode) {
      const loanCurrency = getCurrencyInfo(currencyCode)
      if (loanCurrency) {
        return formatCurrencyUtil(amountMinor, loanCurrency)
      }
    }

    // Fall back to borrower's currency
    if (borrowerCurrency) {
      return formatCurrencyUtil(amountMinor, borrowerCurrency)
    }

    // Last resort fallback to USD
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amountMinor / 100)
  }

  const handleAcceptOffer = async (loanId: string) => {
    setProcessing(true)
    setActionResult(null)

    try {
      const { data, error } = await supabase.rpc('accept_loan_offer', {
        p_loan_id: loanId
      })

      if (error) {
        console.error('RPC accept_loan_offer error:', JSON.stringify(error))
        throw error
      }

      const result = data as { success: boolean; message?: string; error?: string }

      if (result.success) {
        setActionResult({ success: true, message: result.message || 'Loan offer accepted successfully!' })
        // Remove from list
        setPendingOffers(prev => prev.filter(o => o.id !== loanId))
        setSelectedOffer(null)
        // Redirect to loans page after a short delay
        setTimeout(() => {
          router.push('/b/loans')
        }, 2000)
      } else {
        setActionResult({ success: false, message: result.error || 'Failed to accept offer' })
      }
    } catch (error: any) {
      console.error('Error accepting offer:', error)
      setActionResult({ success: false, message: error.message || 'An error occurred' })
    } finally {
      setProcessing(false)
    }
  }

  const handleDeclineOffer = async () => {
    if (!selectedOffer) return

    setProcessing(true)
    setActionResult(null)

    try {
      const { data, error } = await supabase.rpc('decline_loan_offer', {
        p_loan_id: selectedOffer.id,
        p_reason: declineReason || null
      })

      if (error) throw error

      const result = data as { success: boolean; message?: string; error?: string }

      if (result.success) {
        setActionResult({ success: true, message: 'Loan offer declined' })
        // Remove from list
        setPendingOffers(prev => prev.filter(o => o.id !== selectedOffer.id))
        setSelectedOffer(null)
        setShowDeclineDialog(false)
        setDeclineReason('')
      } else {
        setActionResult({ success: false, message: result.error || 'Failed to decline offer' })
      }
    } catch (error: any) {
      console.error('Error declining offer:', error)
      setActionResult({ success: false, message: error.message || 'An error occurred' })
    } finally {
      setProcessing(false)
    }
  }

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
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/b/loans')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Pending Loan Offers</h1>
          <p className="text-gray-600 mt-1">
            Review and accept or decline loan offers from lenders
          </p>
        </div>
      </div>

      {/* Action Result Alert */}
      {actionResult && (
        <Alert variant={actionResult.success ? 'default' : 'destructive'}>
          {actionResult.success ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertTitle>{actionResult.success ? 'Success' : 'Error'}</AlertTitle>
          <AlertDescription>{actionResult.message}</AlertDescription>
        </Alert>
      )}

      {pendingOffers.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Pending Offers</h3>
            <p className="text-gray-600 mb-4">You don't have any loan offers waiting for your approval.</p>
            <Button onClick={() => router.push('/b/loans')}>
              View My Loans
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {pendingOffers.map((offer) => (
            <Card key={offer.id} className="border-2 border-yellow-300 bg-yellow-50/30">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className="bg-yellow-100 text-yellow-800">
                        <Clock className="h-3 w-3 mr-1" />
                        Awaiting Your Decision
                      </Badge>
                    </div>
                    <CardTitle className="text-xl">
                      Loan Offer of {formatCurrency(offer.principal_minor || offer.principal_amount * 100, offer.currency)}
                    </CardTitle>
                    <CardDescription>
                      From: {offer.lenders?.business_name || 'Lender'}
                      {offer.lenders?.verification_status === 'verified' && (
                        <Badge className="ml-2 bg-green-100 text-green-800">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Verified Lender
                        </Badge>
                      )}
                    </CardDescription>
                  </div>
                  <div className="text-right text-sm text-gray-500">
                    <p>Offered on</p>
                    <p className="font-medium">{format(new Date(offer.created_at), 'MMM dd, yyyy')}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Loan Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 bg-white rounded-lg border">
                    <div className="flex items-center gap-2 text-gray-600 mb-1">
                      <CreditCard className="h-4 w-4" />
                      <span className="text-sm">Amount</span>
                    </div>
                    <p className="text-2xl font-bold">
                      {formatCurrency(offer.principal_minor || offer.principal_amount * 100, offer.currency)}
                    </p>
                  </div>

                  <div className="p-4 bg-white rounded-lg border">
                    <div className="flex items-center gap-2 text-gray-600 mb-1">
                      <Percent className="h-4 w-4" />
                      <span className="text-sm">Interest Rate</span>
                    </div>
                    <p className="text-2xl font-bold text-orange-600">
                      {offer.total_interest_percent || offer.base_rate_percent || offer.interest_rate}%
                    </p>
                    {offer.payment_type === 'installments' && offer.extra_rate_per_installment > 0 && (
                      <p className="text-xs text-gray-500">
                        {offer.base_rate_percent}% base + {offer.extra_rate_per_installment}% per extra month
                      </p>
                    )}
                  </div>

                  <div className="p-4 bg-white rounded-lg border">
                    <div className="flex items-center gap-2 text-gray-600 mb-1">
                      <Calendar className="h-4 w-4" />
                      <span className="text-sm">Payment Type</span>
                    </div>
                    <p className="text-2xl font-bold">
                      {offer.payment_type === 'once_off'
                        ? 'Once-off'
                        : `${offer.num_installments || offer.term_months} months`}
                    </p>
                  </div>

                  <div className="p-4 bg-white rounded-lg border">
                    <div className="flex items-center gap-2 text-gray-600 mb-1">
                      <Calculator className="h-4 w-4" />
                      <span className="text-sm">Total to Repay</span>
                    </div>
                    <p className="text-2xl font-bold text-green-700">
                      {formatCurrency(offer.total_amount_minor || offer.total_amount * 100, offer.currency)}
                    </p>
                  </div>
                </div>

                {/* Breakdown */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    <Calculator className="h-4 w-4" />
                    Payment Breakdown
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">You'll Borrow:</p>
                      <p className="font-semibold text-lg">
                        {formatCurrency(offer.principal_minor || offer.principal_amount * 100, offer.currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Interest You'll Pay:</p>
                      <p className="font-semibold text-lg text-orange-600">
                        {formatCurrency(offer.interest_amount_minor || ((offer.total_amount - offer.principal_amount) * 100), offer.currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">
                        {offer.payment_type === 'once_off' ? 'Total Due (Single Payment):' : 'Per Installment:'}
                      </p>
                      <p className="font-semibold text-lg text-green-700">
                        {offer.payment_type === 'once_off'
                          ? formatCurrency(offer.total_amount_minor || offer.total_amount * 100, offer.currency)
                          : formatCurrency(Math.ceil((offer.total_amount_minor || offer.total_amount * 100) / (offer.num_installments || offer.term_months)), offer.currency)
                        }
                        {offer.payment_type !== 'once_off' && (
                          <span className="text-sm font-normal text-gray-500">
                            {' '}× {offer.num_installments || offer.term_months} months
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Purpose */}
                {offer.purpose && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-700 mb-2">Loan Purpose</h4>
                    <p className="text-gray-600">{offer.purpose}</p>
                  </div>
                )}

                {/* Important Notice */}
                <Alert className="bg-amber-50 border-amber-200">
                  <Info className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-amber-900">Before You Accept</AlertTitle>
                  <AlertDescription className="text-amber-800">
                    By accepting this loan offer, you agree to repay the total amount of{' '}
                    <strong>{formatCurrency(offer.total_amount_minor || offer.total_amount * 100, offer.currency)}</strong> according to the payment schedule.
                    Make sure you can afford the repayments before accepting.
                  </AlertDescription>
                </Alert>
              </CardContent>
              <CardFooter className="flex justify-end gap-4 border-t pt-6">
                <Button
                  variant="outline"
                  size="lg"
                  className="text-red-600 border-red-300 hover:bg-red-50"
                  onClick={() => {
                    setSelectedOffer(offer)
                    setShowDeclineDialog(true)
                  }}
                  disabled={processing}
                >
                  <ThumbsDown className="h-4 w-4 mr-2" />
                  Decline Offer
                </Button>
                <Button
                  size="lg"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => handleAcceptOffer(offer.id)}
                  disabled={processing}
                >
                  {processing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <ThumbsUp className="h-4 w-4 mr-2" />
                      Accept Offer
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Decline Dialog */}
      <Dialog open={showDeclineDialog} onOpenChange={setShowDeclineDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline Loan Offer</DialogTitle>
            <DialogDescription>
              Are you sure you want to decline this loan offer? You can optionally provide a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="decline-reason">Reason for declining (optional)</Label>
              <Textarea
                id="decline-reason"
                placeholder="e.g., Interest rate too high, terms don't suit my needs, etc."
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeclineDialog(false)
                setDeclineReason('')
              }}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeclineOffer}
              disabled={processing}
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Declining...
                </>
              ) : (
                <>
                  <X className="h-4 w-4 mr-2" />
                  Decline Offer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
