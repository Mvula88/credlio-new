import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe, createCheckoutSession, SUBSCRIPTION_PLANS } from '@/lib/stripe/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { planId, billingPeriod, userRole } = await req.json()

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      )
    }

    // Get or create Stripe customer
    let stripeCustomerId = profile.stripe_customer_id

    if (!stripeCustomerId) {
      const customer = await getStripe().customers.create({
        email: profile.email,
        name: profile.full_name,
        metadata: {
          user_id: user.id,
          role: userRole
        }
      })

      stripeCustomerId = customer.id

      // Save Stripe customer ID
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('user_id', user.id)
    }

    // Get price ID based on plan and billing period
    let priceId: string | undefined
    const plan = SUBSCRIPTION_PLANS[planId as keyof typeof SUBSCRIPTION_PLANS]

    if (plan && 'stripePriceIdMonthly' in plan) {
      priceId = billingPeriod === 'monthly' 
        ? plan.stripePriceIdMonthly 
        : plan.stripePriceIdYearly
    }

    if (!priceId) {
      return NextResponse.json(
        { error: 'Invalid plan' },
        { status: 400 }
      )
    }

    // Create checkout session
    const session = await createCheckoutSession(
      stripeCustomerId,
      priceId,
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/subscription?success=true`,
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/subscription`,
      {
        user_id: user.id,
        plan_id: planId
      }
    )

    return NextResponse.json({ sessionId: session.id })
  } catch (error) {
    console.error('Checkout session error:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}