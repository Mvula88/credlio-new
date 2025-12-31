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
    id: 'BASIC',
    name: 'Basic (Free)',
    price: 0,
    priceYearly: 0,
    description: 'Start lending with registered borrowers',
    features: [
      'Register and manage your own borrowers',
      'Create loan offers',
      'Track repayments',
      'Basic analytics',
      'Email support'
    ],
    stripePriceIdMonthly: null,
    stripePriceIdYearly: null,
    popular: false
  },
  {
    id: 'PRO',
    name: 'Pro',
    price: 19.99,
    priceYearly: 199.99,
    description: 'Professional lending tools',
    features: [
      'Everything in Basic',
      'Advanced borrower analytics',
      'Risk assessment tools',
      'Priority support',
      'Export reports',
      'API access'
    ],
    stripePriceIdMonthly: process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY!,
    stripePriceIdYearly: process.env.NEXT_PUBLIC_STRIPE_PRO_YEARLY!,
    popular: false
  },
  {
    id: 'PRO_PLUS',
    name: 'Pro+',
    price: 49.99,
    priceYearly: 499.99,
    description: 'Access marketplace and expand your portfolio',
    features: [
      'Everything in Pro',
      'Access to loan marketplace',
      'Browse all loan requests',
      'Make competitive offers',
      'Advanced filtering',
      'Dedicated account manager',
      'Custom branding',
      'Lower platform fees'
    ],
    stripePriceIdMonthly: process.env.NEXT_PUBLIC_STRIPE_PRO_PLUS_MONTHLY!,
    stripePriceIdYearly: process.env.NEXT_PUBLIC_STRIPE_PRO_PLUS_YEARLY!,
    popular: true
  }
]

function BillingPageContent() {
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [currentPlan, setCurrentPlan] = useState<string>('BASIC')
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly')
  const [subscription, setSubscription] = useState<any>(null)
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

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (sub) {
        setSubscription(sub)
        setCurrentPlan(sub.tier || 'BASIC')
      } else {
        setCurrentPlan('BASIC')
      }
    } catch (error) {
      console.error('Error loading subscription:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUpgrade = async (planId: string) => {
    if (planId === 'BASIC' || planId === currentPlan) return

    try {
      setProcessing(true)

      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId,
          billingPeriod,
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

      {/* Current Subscription */}
      {currentPlan !== 'BASIC' && subscription && (
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
                <p className="text-sm text-gray-600">
                  {subscription.billing_cycle === 'yearly' ? 'Billed annually' : 'Billed monthly'}
                </p>
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

      {/* Billing Period Toggle */}
      <div className="flex items-center justify-center space-x-4">
        <span className={billingPeriod === 'monthly' ? 'font-medium' : 'text-gray-500'}>
          Monthly
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'yearly' : 'monthly')}
          className="relative"
        >
          <div className={`w-12 h-6 rounded-full transition-colors ${
            billingPeriod === 'yearly' ? 'bg-green-600' : 'bg-gray-300'
          }`}>
            <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
              billingPeriod === 'yearly' ? 'translate-x-6' : ''
            }`}></div>
          </div>
        </Button>
        <span className={billingPeriod === 'yearly' ? 'font-medium' : 'text-gray-500'}>
          Yearly
          <Badge variant="secondary" className="ml-2">Save 17%</Badge>
        </span>
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan) => {
          const price = billingPeriod === 'yearly' ? plan.priceYearly : plan.price
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
                  <span className="text-4xl font-bold">${price}</span>
                  {plan.price > 0 && (
                    <span className="text-gray-600">
                      /{billingPeriod === 'yearly' ? 'year' : 'month'}
                    </span>
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
                ) : plan.id === 'BASIC' ? (
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
