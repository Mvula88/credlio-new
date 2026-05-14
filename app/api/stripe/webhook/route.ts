import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getStripe, verifyWebhookSignature } from '@/lib/stripe/server'
import Stripe from 'stripe'

// Map Stripe price IDs to subscription tiers
function getTierFromPriceId(priceId: string): string {
  // You can configure these in env vars for flexibility
  const proPrice = process.env.STRIPE_PRO_PRICE_ID
  const proPlusPrice = process.env.STRIPE_PRO_PLUS_PRICE_ID
  const businessPrice = process.env.STRIPE_BUSINESS_PRICE_ID

  if (priceId === proPlusPrice) return 'PRO_PLUS'
  if (priceId === businessPrice) return 'BUSINESS'
  return 'PRO' // Default to PRO
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = (await headers()).get('stripe-signature')

  if (!signature) {
    return NextResponse.json(
      { error: 'No signature' },
      { status: 400 }
    )
  }

  let event: Stripe.Event

  try {
    event = await verifyWebhookSignature(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (error) {
    console.error('Webhook signature verification failed:', error)
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    )
  }

  const supabase = await createClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        if (session.metadata?.user_id) {
          const userId = session.metadata.user_id
          const tier = getTierFromPriceId(session.metadata.plan_id || '')

          // If admin manually activated this user, do NOT overwrite their
          // tier from Stripe — only attach the Stripe IDs so the manual
          // activation stays authoritative.
          const { data: existing } = await supabase
            .from('subscriptions')
            .select('manually_activated_by')
            .eq('user_id', userId)
            .maybeSingle()

          const payload: Record<string, unknown> = {
            user_id: userId,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            updated_at: new Date().toISOString()
          }
          if (!existing?.manually_activated_by) {
            payload.tier = tier
          }

          await supabase
            .from('subscriptions')
            .upsert(payload, { onConflict: 'user_id' })

          // Also update profiles for backwards compatibility
          await supabase
            .from('profiles')
            .update({
              stripe_customer_id: session.customer as string,
              subscription_status: 'active',
              subscription_plan: session.metadata.plan_id
            })
            .eq('user_id', userId)
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customer = await getStripe().customers.retrieve(subscription.customer as string)

        if ('metadata' in customer && customer.metadata?.user_id) {
          const userId = customer.metadata.user_id
          const priceId = subscription.items.data[0]?.price?.id || ''
          const tier = getTierFromPriceId(priceId)

          // Defer to manual activation if present (see checkout.session.completed).
          const { data: existing } = await supabase
            .from('subscriptions')
            .select('manually_activated_by')
            .eq('user_id', userId)
            .maybeSingle()

          const payload: Record<string, unknown> = {
            user_id: userId,
            stripe_customer_id: subscription.customer as string,
            stripe_subscription_id: subscription.id,
            stripe_price_id: priceId,
            current_period_start: new Date(((subscription as any).current_period_start || 0) * 1000).toISOString(),
            current_period_end: new Date(((subscription as any).current_period_end || 0) * 1000).toISOString(),
            cancel_at_period_end: (subscription as any).cancel_at_period_end || false,
            updated_at: new Date().toISOString()
          }
          if (!existing?.manually_activated_by) {
            payload.tier = tier
          }

          await supabase
            .from('subscriptions')
            .upsert(payload, { onConflict: 'user_id' })

          // Also update profiles
          await supabase
            .from('profiles')
            .update({
              subscription_status: subscription.status,
              subscription_id: subscription.id
            })
            .eq('user_id', userId)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customer = await getStripe().customers.retrieve(subscription.customer as string)

        if ('metadata' in customer && customer.metadata?.user_id) {
          const userId = customer.metadata.user_id

          // Update subscriptions table - downgrade to FREE tier
          await supabase
            .from('subscriptions')
            .upsert({
              user_id: userId,
              tier: 'FREE',
              stripe_subscription_id: null,
              stripe_price_id: null,
              cancel_at_period_end: false,
              current_period_end: new Date(((subscription as any).current_period_end || 0) * 1000).toISOString(),
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' })

          // Also update profiles
          await supabase
            .from('profiles')
            .update({
              subscription_status: 'canceled'
            })
            .eq('user_id', userId)
        }
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice

        // Record successful payment for audit trail
        if (invoice.metadata?.user_id) {
          console.log(`Payment succeeded for user ${invoice.metadata.user_id}: ${invoice.amount_paid / 100} ${invoice.currency}`)
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice

        if (invoice.metadata?.user_id) {
          console.error(`Payment failed for user ${invoice.metadata.user_id}: ${invoice.amount_due / 100} ${invoice.currency}`)

          // Update profiles with past_due status
          await supabase
            .from('profiles')
            .update({
              subscription_status: 'past_due'
            })
            .eq('user_id', invoice.metadata.user_id)
        }
        break
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent

        if (paymentIntent.metadata?.type === 'loan_repayment' && paymentIntent.metadata?.loan_id) {
          // Use the process_repayment RPC for proper handling
          const amountInMajorUnits = paymentIntent.amount / 100

          const { error } = await supabase
            .rpc('process_repayment', {
              p_loan_id: paymentIntent.metadata.loan_id,
              p_amount: amountInMajorUnits
            })

          if (error) {
            console.error('Failed to process loan repayment via webhook:', error)
          }
        }
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook processing error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}
