import Stripe from 'stripe'

export const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY!,
  {
    apiVersion: '2024-10-28.acacia',
    typescript: true,
  }
)

export const SUBSCRIPTION_PLANS = {
  borrower_basic: {
    name: 'Borrower Basic',
    description: 'Basic access to loan marketplace',
    price: 0,
    features: [
      'Access to loan marketplace',
      'Basic credit score monitoring',
      'Apply for up to 1 active loan',
      'Email support'
    ]
  },
  borrower_premium: {
    name: 'Borrower Premium',
    description: 'Premium features for serious borrowers',
    priceMonthly: 9.99,
    priceYearly: 99.99,
    stripePriceIdMonthly: process.env.STRIPE_BORROWER_PREMIUM_MONTHLY,
    stripePriceIdYearly: process.env.STRIPE_BORROWER_PREMIUM_YEARLY,
    features: [
      'Everything in Basic',
      'Advanced credit score insights',
      'Apply for multiple loans',
      'Priority loan processing',
      'Dedicated support',
      'Lower interest rates',
      'Financial planning tools'
    ]
  },
  lender_starter: {
    name: 'Lender Starter',
    description: 'Start lending with basic features',
    priceMonthly: 29.99,
    priceYearly: 299.99,
    stripePriceIdMonthly: process.env.STRIPE_LENDER_STARTER_MONTHLY,
    stripePriceIdYearly: process.env.STRIPE_LENDER_STARTER_YEARLY,
    features: [
      'List up to 10 loan offers',
      'Basic borrower filtering',
      'Standard verification badge',
      'Email support',
      '3% platform fee'
    ]
  },
  lender_professional: {
    name: 'Lender Professional',
    description: 'Professional tools for serious lenders',
    priceMonthly: 99.99,
    priceYearly: 999.99,
    stripePriceIdMonthly: process.env.STRIPE_LENDER_PRO_MONTHLY,
    stripePriceIdYearly: process.env.STRIPE_LENDER_PRO_YEARLY,
    features: [
      'Unlimited loan offers',
      'Advanced borrower analytics',
      'Premium verification badge',
      'Priority support',
      '2% platform fee',
      'API access',
      'Custom branding',
      'Bulk loan management'
    ]
  },
  lender_enterprise: {
    name: 'Lender Enterprise',
    description: 'Enterprise solution for institutions',
    custom: true,
    features: [
      'Everything in Professional',
      'Dedicated account manager',
      'Custom integration',
      'SLA guarantee',
      '1% platform fee',
      'White-label option',
      'Advanced reporting',
      'Compliance tools'
    ]
  }
}

export async function createCustomer(
  email: string,
  name: string,
  metadata: Record<string, string>
) {
  return await stripe.customers.create({
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
  return await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    trial_period_days: trialDays,
    payment_behavior: 'default_incomplete',
    expand: ['latest_invoice.payment_intent', 'pending_setup_intent']
  })
}

export async function cancelSubscription(subscriptionId: string) {
  return await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true
  })
}

export async function reactivateSubscription(subscriptionId: string) {
  return await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false
  })
}

export async function updateSubscription(
  subscriptionId: string,
  newPriceId: string
) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  
  return await stripe.subscriptions.update(subscriptionId, {
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
  return await stripe.paymentIntents.create({
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
  return await stripe.checkout.sessions.create({
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
  return await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  })
}

export async function getSubscription(subscriptionId: string) {
  return await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['customer', 'items.data.price.product']
  })
}

export async function getCustomer(customerId: string) {
  return await stripe.customers.retrieve(customerId, {
    expand: ['subscriptions']
  })
}

export async function createSetupIntent(customerId: string) {
  return await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
    usage: 'off_session'
  })
}

export async function attachPaymentMethod(
  paymentMethodId: string,
  customerId: string
) {
  await stripe.paymentMethods.attach(paymentMethodId, {
    customer: customerId
  })
  
  // Set as default payment method
  await stripe.customers.update(customerId, {
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
  return await stripe.paymentIntents.create({
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
  return await stripe.transfers.create({
    amount: amount * 100,
    currency,
    destination: destinationAccountId,
    metadata
  })
}

export async function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  endpointSecret: string
): Promise<Stripe.Event> {
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    endpointSecret
  )
}