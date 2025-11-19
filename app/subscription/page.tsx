'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { 
  Check,
  X,
  Star,
  Zap,
  Shield,
  CreditCard,
  ChevronRight,
  Info,
  TrendingUp,
  Users,
  Building2,
  Rocket,
  Crown,
  Gift,
  ArrowRight,
  Calendar,
  DollarSign,
  Percent,
  Award,
  Target,
  BarChart3,
  Lock,
  Unlock,
  AlertCircle,
  CheckCircle
} from 'lucide-react'
import { loadStripe } from '@stripe/stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

export default function SubscriptionPage() {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [currentPlan, setCurrentPlan] = useState<any>(null)
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly')
  const [selectedPlan, setSelectedPlan] = useState<string>('')
  const [processing, setProcessing] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const borrowerPlans = [
    {
      id: 'borrower_basic',
      name: 'Basic',
      description: 'Get started with essential features',
      priceMonthly: 0,
      priceYearly: 0,
      color: 'gray',
      icon: Zap,
      features: [
        { name: 'Access to loan marketplace', included: true },
        { name: 'Basic credit score monitoring', included: true },
        { name: 'Apply for 1 active loan', included: true },
        { name: 'Email support', included: true },
        { name: 'Advanced credit insights', included: false },
        { name: 'Multiple loan applications', included: false },
        { name: 'Priority processing', included: false },
        { name: 'Lower interest rates', included: false }
      ]
    },
    {
      id: 'borrower_premium',
      name: 'Premium',
      description: 'Unlock advanced features and benefits',
      priceMonthly: 9.99,
      priceYearly: 99.99,
      color: 'blue',
      icon: Crown,
      popular: true,
      features: [
        { name: 'Everything in Basic', included: true },
        { name: 'Advanced credit score insights', included: true },
        { name: 'Apply for multiple loans', included: true },
        { name: 'Priority loan processing', included: true },
        { name: 'Dedicated support', included: true },
        { name: 'Lower interest rates (up to 2%)', included: true },
        { name: 'Financial planning tools', included: true },
        { name: 'Early access to new features', included: true }
      ],
      savings: '17% savings'
    }
  ]

  const lenderPlans = [
    {
      id: 'lender_starter',
      name: 'Starter',
      description: 'Perfect for individual lenders',
      priceMonthly: 29.99,
      priceYearly: 299.99,
      color: 'green',
      icon: Rocket,
      features: [
        { name: 'List up to 10 loan offers', included: true },
        { name: 'Basic borrower filtering', included: true },
        { name: 'Standard verification badge', included: true },
        { name: 'Email support', included: true },
        { name: '3% platform fee', included: true },
        { name: 'Advanced analytics', included: false },
        { name: 'API access', included: false },
        { name: 'Custom branding', included: false }
      ]
    },
    {
      id: 'lender_professional',
      name: 'Professional',
      description: 'Scale your lending business',
      priceMonthly: 99.99,
      priceYearly: 999.99,
      color: 'purple',
      icon: Star,
      popular: true,
      features: [
        { name: 'Unlimited loan offers', included: true },
        { name: 'Advanced borrower analytics', included: true },
        { name: 'Premium verification badge', included: true },
        { name: 'Priority support', included: true },
        { name: '2% platform fee', included: true },
        { name: 'API access', included: true },
        { name: 'Custom branding', included: true },
        { name: 'Bulk loan management', included: true }
      ],
      savings: '17% savings'
    },
    {
      id: 'lender_enterprise',
      name: 'Enterprise',
      description: 'For financial institutions',
      custom: true,
      color: 'indigo',
      icon: Building2,
      features: [
        { name: 'Everything in Professional', included: true },
        { name: 'Dedicated account manager', included: true },
        { name: 'Custom integration', included: true },
        { name: 'SLA guarantee', included: true },
        { name: '1% platform fee', included: true },
        { name: 'White-label option', included: true },
        { name: 'Advanced reporting', included: true },
        { name: 'Compliance tools', included: true }
      ]
    }
  ]

  useEffect(() => {
    loadSubscriptionData()
  }, [])

  const loadSubscriptionData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (profileData) {
        setProfile(profileData)
        // In production, fetch actual subscription from database
        setCurrentPlan(profileData.subscription_plan || 'free')
      }
    } catch (error) {
      console.error('Error loading subscription:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubscribe = async (planId: string) => {
    setProcessing(true)
    try {
      // Call API to create checkout session
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planId,
          billingPeriod,
          userRole: profile?.role
        })
      })

      const { sessionId } = await response.json()

      // Redirect to Stripe Checkout
      const stripe = await stripePromise
      if (stripe) {
        const { error } = await stripe.redirectToCheckout({ sessionId })
        if (error) {
          console.error('Stripe error:', error)
        }
      }
    } catch (error) {
      console.error('Subscription error:', error)
    } finally {
      setProcessing(false)
    }
  }

  const handleManageSubscription = async () => {
    setProcessing(true)
    try {
      // Call API to create portal session
      const response = await fetch('/api/stripe/create-portal', {
        method: 'POST'
      })

      const { url } = await response.json()
      window.location.href = url
    } catch (error) {
      console.error('Portal error:', error)
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

  const plans = profile?.role === 'lender' ? lenderPlans : borrowerPlans

  return (
    <div className="max-w-7xl mx-auto px-4 py-12 space-y-12">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-gray-900">
          Choose Your Plan
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Unlock powerful features to {profile?.role === 'lender' ? 'grow your lending business' : 'improve your borrowing experience'}
        </p>
        
        {/* Billing Toggle */}
        <div className="flex items-center justify-center space-x-4">
          <span className={billingPeriod === 'monthly' ? 'font-semibold' : 'text-gray-600'}>
            Monthly
          </span>
          <Switch
            checked={billingPeriod === 'yearly'}
            onCheckedChange={(checked) => setBillingPeriod(checked ? 'yearly' : 'monthly')}
          />
          <span className={billingPeriod === 'yearly' ? 'font-semibold' : 'text-gray-600'}>
            Yearly
          </span>
          {billingPeriod === 'yearly' && (
            <Badge className="bg-green-100 text-green-800">Save up to 17%</Badge>
          )}
        </div>
      </div>

      {/* Current Plan Alert */}
      {currentPlan && currentPlan !== 'free' && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Current Plan</AlertTitle>
          <AlertDescription>
            You are currently on the {currentPlan} plan. 
            <Button 
              variant="link" 
              className="p-0 h-auto ml-2"
              onClick={handleManageSubscription}
            >
              Manage subscription
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Promotion Banner */}
      <Card className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <CardContent className="flex items-center justify-between py-6">
          <div className="flex items-center space-x-4">
            <Gift className="h-8 w-8" />
            <div>
              <p className="text-lg font-semibold">Limited Time Offer!</p>
              <p className="text-blue-100">Get 2 months free with yearly plans</p>
            </div>
          </div>
          <Badge className="bg-white text-blue-600 hover:bg-gray-100">
            Ends Soon
          </Badge>
        </CardContent>
      </Card>

      {/* Plans Grid */}
      <div className={`grid grid-cols-1 ${plans.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-8`}>
        {plans.map((plan) => (
          <Card 
            key={plan.id}
            className={`relative ${plan.popular ? 'border-blue-600 shadow-xl' : ''}`}
          >
            {plan.popular && (
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <Badge className="bg-blue-600 text-white px-3 py-1">
                  Most Popular
                </Badge>
              </div>
            )}
            
            <CardHeader>
              <div className="flex items-center justify-between mb-4">
                <plan.icon className={`h-8 w-8 text-${plan.color}-600`} />
                {plan.savings && billingPeriod === 'yearly' && (
                  <Badge variant="outline" className="text-green-600 border-green-600">
                    {plan.savings}
                  </Badge>
                )}
              </div>
              <CardTitle className="text-2xl">{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-6">
              {/* Pricing */}
              <div>
                {plan.custom ? (
                  <div>
                    <p className="text-3xl font-bold">Custom</p>
                    <p className="text-gray-600">Contact sales</p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-baseline">
                      <span className="text-4xl font-bold">
                        ${billingPeriod === 'monthly' ? plan.priceMonthly : plan.priceYearly}
                      </span>
                      <span className="text-gray-600 ml-2">
                        /{billingPeriod === 'monthly' ? 'month' : 'year'}
                      </span>
                    </div>
                    {billingPeriod === 'yearly' && plan.priceYearly > 0 && (
                      <p className="text-sm text-gray-600 mt-1">
                        ${(plan.priceYearly / 12).toFixed(2)}/month billed annually
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Features */}
              <div className="space-y-3">
                {plan.features.map((feature, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    {feature.included ? (
                      <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                    ) : (
                      <X className="h-5 w-5 text-gray-300 mt-0.5" />
                    )}
                    <span className={`text-sm ${feature.included ? '' : 'text-gray-400'}`}>
                      {feature.name}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>

            <CardFooter>
              {plan.custom ? (
                <Button className="w-full" variant="outline">
                  Contact Sales
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              ) : currentPlan === plan.id ? (
                <Button className="w-full" disabled>
                  Current Plan
                </Button>
              ) : (
                <Button 
                  className="w-full"
                  variant={plan.popular ? 'default' : 'outline'}
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={processing}
                >
                  {plan.priceMonthly === 0 ? 'Get Started' : 'Subscribe'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Benefits Section */}
      <Card>
        <CardHeader>
          <CardTitle>Why Upgrade?</CardTitle>
          <CardDescription>
            Unlock these benefits with a premium subscription
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="text-center space-y-2">
              <div className="bg-blue-100 p-3 rounded-full w-12 h-12 mx-auto flex items-center justify-center">
                <Percent className="h-6 w-6 text-blue-600" />
              </div>
              <p className="font-semibold">Better Rates</p>
              <p className="text-sm text-gray-600">
                {profile?.role === 'lender' ? 'Lower platform fees' : 'Reduced interest rates'}
              </p>
            </div>
            <div className="text-center space-y-2">
              <div className="bg-green-100 p-3 rounded-full w-12 h-12 mx-auto flex items-center justify-center">
                <Zap className="h-6 w-6 text-green-600" />
              </div>
              <p className="font-semibold">Priority Processing</p>
              <p className="text-sm text-gray-600">
                Get your applications processed faster
              </p>
            </div>
            <div className="text-center space-y-2">
              <div className="bg-purple-100 p-3 rounded-full w-12 h-12 mx-auto flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-purple-600" />
              </div>
              <p className="font-semibold">Advanced Analytics</p>
              <p className="text-sm text-gray-600">
                Detailed insights and reporting
              </p>
            </div>
            <div className="text-center space-y-2">
              <div className="bg-yellow-100 p-3 rounded-full w-12 h-12 mx-auto flex items-center justify-center">
                <Shield className="h-6 w-6 text-yellow-600" />
              </div>
              <p className="font-semibold">Premium Support</p>
              <p className="text-sm text-gray-600">
                Dedicated support when you need it
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* FAQ Section */}
      <Card>
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="font-semibold">Can I change plans anytime?</p>
            <p className="text-gray-600">
              Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately.
            </p>
          </div>
          <div>
            <p className="font-semibold">Is there a free trial?</p>
            <p className="text-gray-600">
              Yes, all paid plans come with a 14-day free trial. No credit card required to start.
            </p>
          </div>
          <div>
            <p className="font-semibold">What payment methods do you accept?</p>
            <p className="text-gray-600">
              We accept all major credit cards, debit cards, and bank transfers through Stripe.
            </p>
          </div>
          <div>
            <p className="font-semibold">Can I cancel my subscription?</p>
            <p className="text-gray-600">
              Yes, you can cancel anytime. You'll continue to have access until the end of your billing period.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}