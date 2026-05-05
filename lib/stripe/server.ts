import Stripe from 'stripe'

// Lazy initialization to avoid build-time errors when env vars aren't available
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(
      process.env.STRIPE_SECRET_KEY!,
      {
        apiVersion: '2025-10-29.clover',
        typescript: true,
      }
    )
  }
  return _stripe
}

export async function createCustomer(
  email: string,
  name: string,
  metadata: Record<string, string>
) {
  return await getStripe().customers.create({
    email,
    name,
    metadata
  })
}

export async function createSubscription(
  customerId: string,
  priceId: string,
  trialDays?: number
) {
  return await getStripe().subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    trial_period_days: trialDays,
    payment_behavior: 'default_incomplete',
    expand: ['latest_invoice.payment_intent', 'pending_setup_intent']
  })
}

export async function cancelSubscription(subscriptionId: string) {
  return await getStripe().subscriptions.update(subscriptionId, {
    cancel_at_period_end: true
  })
}

export async function reactivateSubscription(subscriptionId: string) {
  return await getStripe().subscriptions.update(subscriptionId, {
    cancel_at_period_end: false
  })
}

export async function updateSubscription(
  subscriptionId: string,
  newPriceId: string
) {
  const subscription = await getStripe().subscriptions.retrieve(subscriptionId)

  return await getStripe().subscriptions.update(subscriptionId, {
    items: [{
      id: subscription.items.data[0].id,
      price: newPriceId
    }],
    proration_behavior: 'create_prorations'
  })
}

export async function createPaymentIntent(
  amount: number,
  currency: string,
  metadata: Record<string, string>
) {
  return await getStripe().paymentIntents.create({
    amount: amount * 100, // Convert to cents
    currency,
    metadata,
    automatic_payment_methods: {
      enabled: true
    }
  })
}

export async function createCheckoutSession(
  customerId: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string,
  metadata?: Record<string, string>
) {
  return await getStripe().checkout.sessions.create({
    customer: customerId,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    mode: 'subscription',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
    subscription_data: {
      trial_period_days: 14,
    }
  })
}

export async function createPortalSession(
  customerId: string,
  returnUrl: string
) {
  return await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  })
}

export async function getSubscription(subscriptionId: string) {
  return await getStripe().subscriptions.retrieve(subscriptionId, {
    expand: ['customer', 'items.data.price.product']
  })
}

export async function getCustomer(customerId: string) {
  return await getStripe().customers.retrieve(customerId, {
    expand: ['subscriptions']
  })
}

export async function createSetupIntent(customerId: string) {
  return await getStripe().setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
    usage: 'off_session'
  })
}

export async function attachPaymentMethod(
  paymentMethodId: string,
  customerId: string
) {
  await getStripe().paymentMethods.attach(paymentMethodId, {
    customer: customerId
  })

  // Set as default payment method
  await getStripe().customers.update(customerId, {
    invoice_settings: {
      default_payment_method: paymentMethodId
    }
  })
}

export async function processLoanRepayment(
  amount: number,
  currency: string,
  borrowerId: string,
  loanId: string,
  paymentMethodId: string
) {
  return await getStripe().paymentIntents.create({
    amount: amount * 100,
    currency,
    customer: borrowerId,
    payment_method: paymentMethodId,
    off_session: true,
    confirm: true,
    metadata: {
      type: 'loan_repayment',
      loan_id: loanId,
      borrower_id: borrowerId
    }
  })
}

export async function createPayout(
  amount: number,
  currency: string,
  destinationAccountId: string,
  metadata: Record<string, string>
) {
  return await getStripe().transfers.create({
    amount: amount * 100,
    currency,
    destination: destinationAccountId,
    metadata
  })
}

// Subscription plan → Stripe Price ID mapping
// Set STRIPE_PRICE_* env vars in your Stripe dashboard
export const SUBSCRIPTION_PLANS = {
  PRO: {
    stripePriceIdMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY || '',
    stripePriceIdYearly: process.env.STRIPE_PRICE_PRO_YEARLY || '',
  },
  BUSINESS: {
    stripePriceIdMonthly: process.env.STRIPE_PRICE_BUSINESS_MONTHLY || '',
    stripePriceIdYearly: process.env.STRIPE_PRICE_BUSINESS_YEARLY || '',
  },
}

export async function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  endpointSecret: string
): Promise<Stripe.Event> {
  return getStripe().webhooks.constructEvent(
    payload,
    signature,
    endpointSecret
  )
}