import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getStripe, verifyWebhookSignature } from '@/lib/stripe/server'
import Stripe from 'stripe'

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
        
        // Update user subscription status
        if (session.metadata?.user_id) {
          await supabase
            .from('profiles')
            .update({
              subscription_status: 'active',
              subscription_plan: session.metadata.plan_id,
              subscription_period_end: new Date(session.expires_at * 1000).toISOString()
            })
            .eq('user_id', session.metadata.user_id)
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        
        // Get customer
        const customer = await getStripe().customers.retrieve(subscription.customer as string)
        
        if ('metadata' in customer && customer.metadata?.user_id) {
          await supabase
            .from('profiles')
            .update({
              subscription_status: subscription.status,
              subscription_id: subscription.id,
              subscription_period_end: new Date(((subscription as any).current_period_end || 0) * 1000).toISOString()
            })
            .eq('user_id', customer.metadata.user_id)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        
        // Get customer
        const customer = await getStripe().customers.retrieve(subscription.customer as string)
        
        if ('metadata' in customer && customer.metadata?.user_id) {
          await supabase
            .from('profiles')
            .update({
              subscription_status: 'canceled',
              subscription_period_end: new Date(((subscription as any).current_period_end || 0) * 1000).toISOString()
            })
            .eq('user_id', customer.metadata.user_id)
        }
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        
        // Record payment
        if (invoice.metadata?.user_id) {
          await supabase
            .from('payments')
            .insert({
              user_id: invoice.metadata.user_id,
              amount: invoice.amount_paid / 100,
              currency: invoice.currency,
              status: 'completed',
              stripe_invoice_id: invoice.id,
              type: 'subscription'
            })
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        
        // Record failed payment
        if (invoice.metadata?.user_id) {
          await supabase
            .from('payments')
            .insert({
              user_id: invoice.metadata.user_id,
              amount: invoice.amount_due / 100,
              currency: invoice.currency,
              status: 'failed',
              stripe_invoice_id: invoice.id,
              type: 'subscription'
            })

          // Update subscription status
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
        
        if (paymentIntent.metadata?.type === 'loan_repayment') {
          // Update loan repayment
          await supabase
            .from('repayment_events')
            .insert({
              loan_id: paymentIntent.metadata.loan_id,
              amount: paymentIntent.amount / 100,
              status: 'completed',
              payment_method: 'stripe',
              transaction_reference: paymentIntent.id
            })

          // Update loan total repaid
          const { data: loan } = await supabase
            .from('loans')
            .select('total_repaid')
            .eq('id', paymentIntent.metadata.loan_id)
            .single()

          if (loan) {
            await supabase
              .from('loans')
              .update({
                total_repaid: loan.total_repaid + (paymentIntent.amount / 100)
              })
              .eq('id', paymentIntent.metadata.loan_id)
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