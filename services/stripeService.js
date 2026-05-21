const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function createCustomer(email, name) {
  return stripe.customers.create({ email, name });
}

async function createSetupSession(customerId, successUrl, cancelUrl) {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'setup',
    customer: customerId,
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
  return session;
}

async function chargeCustomer(customerId, paymentMethodId, amount, description = 'Pago de suscripción') {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100),
    currency: 'usd',
    customer: customerId,
    payment_method: paymentMethodId,
    off_session: true,
    confirm: true,
    description,
  });
  return paymentIntent;
}

module.exports = { createCustomer, createSetupSession, chargeCustomer };