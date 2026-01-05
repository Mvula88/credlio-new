'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { loadStripe } from '@stripe/stripe-js'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Check,
  Loader2,
  CreditCard,
  AlertCircle,
  Star,
  TrendingUp,
  Zap,
  Shield
} from 'lucide-react'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const PLANS = [
  {
    id: 'FREE',
    name: 'Free',
    price: 0,
    description: 'Try the full platform with limited usage',
    features: [
      'Manage your own borrowers',
      'Create and track loans',
      'Search up to 2 borrowers/month (full details)',
      '2 document verifications/month',
      'See credit scores & risk flags',
      'View defaulter warnings',
      'Email support'
    ],
    limitations: [
      'No marketplace access'
    ],
    stripePriceId: null,
    popular: false
  },
  {
    id: 'PRO',
    name: 'Pro',
    price: 9.99,
    description: 'Unlimited searches for active lenders',
    features: [
      'Everything in Free',
      'Search unlimited borrowers',
      'Unlimited document verifications',
      'Advanced analytics & reports',
      'Risk assessment tools',
      'Export to CSV/PDF',
      '1 marketplace offer/month',
      'Priority email support'
    ],
    limitations: [
      'Limited marketplace access'
    ],
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID,
    popular: true
  },
  {
    id: 'BUSINESS',
    name: 'Business',
    price: 17.99,
    description: 'Full marketplace + unlimited everything',
    features: [
      'Everything in Pro',
      'Unlimited marketplace offers',
      'Browse all loan requests',
      'Bid on any borrower request',
      'Advanced borrower filtering',
      'Dedicated account manager',
      'Lower platform fees',
      'Phone support'
    ],
    limitations: [],
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_BUSINESS_PRICE_ID,
    popular: false
  }
]

function BillingPageContent() {
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [currentPlan, setCurrentPlan] = useState<string>('FREE')
  const [subscription, setSubscription] = useState<any>(null)
  const [usageStatus, setUsageStatus] = useState<any>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    if (searchParams?.get('success') === 'true') {
      setShowSuccess(true)
      // Reload subscription data
      setTimeout(() => {
        loadSubscription()
      }, 2000)
    } else {
      loadSubscription()
    }
  }, [searchParams])

  const loadSubscription = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/l/login')
        return
      }

      // Load subscription
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (sub) {
        setSubscription(sub)
        setCurrentPlan(sub.tier?.toUpperCase() || 'FREE')
      } else {
        setCurrentPlan('FREE')
      }

      // Load usage status
      const { data: usage } = await supabase.rpc('get_usage_status', { p_user_id: user.id })
      if (usage) {
        setUsageStatus(usage)
        // Use the effective tier from usage status (considers launch period)
        setCurrentPlan(usage.tier || 'FREE')
      }
    } catch (error) {
      console.error('Error loading subscription:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUpgrade = async (planId: string) => {
    if (planId === 'FREE' || planId === currentPlan) return

    try {
      setProcessing(true)

      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId,
          userRole: 'lender'
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session')
      }

      const stripe = await stripePromise
      if (!stripe) {
        throw new Error('Stripe failed to load')
      }

      const { error } = await (stripe as any).redirectToCheckout({
        sessionId: data.sessionId
      })

      if (error) {
        throw error
      }
    } catch (error: any) {
      console.error('Checkout error:', error)
      alert(error.message || 'Failed to start checkout process')
    } finally {
      setProcessing(false)
    }
  }

  const handleManageSubscription = async () => {
    try {
      setProcessing(true)

      const response = await fetch('/api/stripe/create-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          returnUrl: window.location.href
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create portal session')
      }

      window.location.href = data.url
    } catch (error: any) {
      console.error('Portal error:', error)
      alert(error.message || 'Failed to open billing portal')
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Billing & Subscription</h1>
        <p className="text-gray-600 mt-1">Manage your subscription and billing details</p>
      </div>

      {/* Success Alert */}
      {showSuccess && (
        <Alert className="border-green-200 bg-green-50">
          <Check className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-800">Subscription Updated!</AlertTitle>
          <AlertDescription className="text-green-700">
            Your subscription has been successfully updated. You now have access to all the features of your plan.
          </AlertDescription>
        </Alert>
      )}

      {/* Launch Period Banner */}
      {usageStatus?.is_launch_period && (
        <Alert className="border-blue-200 bg-blue-50">
          <Zap className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-800">Launch Period Active!</AlertTitle>
          <AlertDescription className="text-blue-700">
            You have full Business-level access for {usageStatus.launch_days_remaining} more days as part of our country launch promotion.
          </AlertDescription>
        </Alert>
      )}

      {/* Current Usage Status */}
      {usageStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              This Month&apos;s Usage
            </CardTitle>
            <CardDescription>
              Your current plan: <Badge variant="secondary">{currentPlan}</Badge>
              {usageStatus.is_launch_period && <Badge className="ml-2 bg-blue-100 text-blue-800">Launch Bonus</Badge>}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-gray-50">
                <p className="text-sm text-gray-600">Borrowers Searched</p>
                <p className="text-2xl font-bold">
                  {usageStatus.unique_borrowers_searched?.used || 0}
                  <span className="text-sm font-normal text-gray-500">
                    {' '}/ {usageStatus.unique_borrowers_searched?.limit || '0'}
                  </span>
                </p>
                <p className="text-xs text-gray-400 mt-1">Same borrower = unlimited re-searches</p>
              </div>
              <div className="p-4 rounded-lg bg-gray-50">
                <p className="text-sm text-gray-600">Document Verifications</p>
                <p className="text-2xl font-bold">
                  {usageStatus.document_checks?.used || 0}
                  <span className="text-sm font-normal text-gray-500">
                    {' '}/ {usageStatus.document_checks?.limit || '0'}
                  </span>
                </p>
              </div>
              <div className="p-4 rounded-lg bg-gray-50">
                <p className="text-sm text-gray-600">Marketplace Offers</p>
                <p className="text-2xl font-bold">
                  {usageStatus.marketplace_offers?.used || 0}
                  <span className="text-sm font-normal text-gray-500">
                    {' '}/ {usageStatus.marketplace_offers?.limit || '0'}
                  </span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Subscription */}
      {currentPlan !== 'FREE' && subscription && (
        <Card>
          <CardHeader>
            <CardTitle>Current Subscription</CardTitle>
            <CardDescription>Your active plan and billing information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-lg">
                  {PLANS.find(p => p.id === currentPlan)?.name}
                </p>
                <p className="text-sm text-gray-600">Billed monthly</p>
              </div>
              <Badge className="bg-green-100 text-green-800">Active</Badge>
            </div>
            {subscription.end_date && (
              <div>
                <p className="text-sm text-gray-600">
                  Next billing date: {new Date(subscription.end_date).toLocaleDateString()}
                </p>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button
              variant="outline"
              onClick={handleManageSubscription}
              disabled={processing}
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Manage Subscription
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan) => {
          const isCurrentPlan = plan.id === currentPlan
          const canUpgrade = plan.price > (PLANS.find(p => p.id === currentPlan)?.price || 0)

          return (
            <Card key={plan.id} className={`relative ${
              plan.popular ? 'border-green-500 border-2' : ''
            }`}>
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-green-600 text-white">
                    <Star className="mr-1 h-3 w-3" />
                    Most Popular
                  </Badge>
                </div>
              )}
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {plan.name}
                  {isCurrentPlan && (
                    <Badge variant="secondary">Current</Badge>
                  )}
                </CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-4xl font-bold">${plan.price}</span>
                  {plan.price > 0 && (
                    <span className="text-gray-600">/month</span>
                  )}
                </div>
                <ul className="space-y-2">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start text-sm">
                      <Check className="h-4 w-4 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                {isCurrentPlan ? (
                  <Button className="w-full" disabled>
                    Current Plan
                  </Button>
                ) : plan.id === 'FREE' ? (
                  <Button className="w-full" variant="outline" disabled>
                    Free Forever
                  </Button>
                ) : canUpgrade ? (
                  <Button
                    className="w-full"
                    onClick={() => handleUpgrade(plan.id)}
                    disabled={processing}
                  >
                    {processing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <TrendingUp className="mr-2 h-4 w-4" />
                        Upgrade to {plan.name}
                      </>
                    )}
                  </Button>
                ) : (
                  <Button className="w-full" variant="outline" disabled>
                    Downgrade
                  </Button>
                )}
              </CardFooter>
            </Card>
          )
        })}
      </div>

      {/* FAQ */}
      <Card>
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">Can I change my plan later?</h4>
            <p className="text-sm text-gray-600">
              Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately and you'll be charged or credited pro-rata.
            </p>
          </div>
          <div>
            <h4 className="font-medium mb-2">What happens if I cancel?</h4>
            <p className="text-sm text-gray-600">
              You'll retain access to your current plan until the end of your billing period. After that, you'll be moved to the free Basic plan.
            </p>
          </div>
          <div>
            <h4 className="font-medium mb-2">Is there a free trial?</h4>
            <p className="text-sm text-gray-600">
              Yes! All paid plans come with a 14-day free trial. No credit card required to start the trial.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div></div>}>
      <BillingPageContent />
    </Suspense>
  )
}
