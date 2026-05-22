const axios = require('axios');

const PAYPAL_API = process.env.PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

/**
 * Obtener token de acceso de PayPal
 */
async function getAccessToken() {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString('base64');
  
  const response = await axios({
    method: 'post',
    url: `${PAYPAL_API}/v1/oauth2/token`,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    data: 'grant_type=client_credentials'
  });

  return response.data.access_token;
}

/**
 * Crear un producto en PayPal
 */
async function createProduct(name, description) {
  const token = await getAccessToken();
  
  const response = await axios({
    method: 'post',
    url: `${PAYPAL_API}/v1/catalogs/products`,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    data: {
      name: name,
      description: description || name,
      type: 'SERVICE',
      category: 'SOFTWARE'
    }
  });

  return response.data.id;
}

/**
 * Crear un plan de suscripción en PayPal
 * SIEMPRE en DOP (pesos dominicanos)
 */
async function createBillingPlan(productId, planName, price, interval) {
  const token = await getAccessToken();
  
  // Mapear intervalo de MOVIA a PayPal
  const intervalMap = {
    'biweekly': { interval_unit: 'WEEK', interval_count: 2 },
    'monthly': { interval_unit: 'MONTH', interval_count: 1 },
    'yearly': { interval_unit: 'YEAR', interval_count: 1 }
  };

  const billingInterval = intervalMap[interval] || intervalMap['monthly'];

  console.log(`🅿️ Creando plan PayPal: ${planName} - ${price} DOP (${interval})`);

  const response = await axios({
    method: 'post',
    url: `${PAYPAL_API}/v1/billing/plans`,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    data: {
      product_id: productId,
      name: planName,
      description: `Plan ${planName} - RD$${price} pesos dominicanos`,
      status: 'ACTIVE',
      billing_cycles: [
        {
          frequency: {
            interval_unit: billingInterval.interval_unit,
            interval_count: billingInterval.interval_count
          },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: {
              value: price.toString(),        // ← 250.00
              currency_code: 'DOP'             // ← PESOS DOMINICANOS
            }
          }
        }
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: 'CONTINUE',
        payment_failure_threshold: 3
      }
    }
  });

  console.log(`✅ Plan PayPal creado: ${response.data.id}`);
  return response.data.id;
}

/**
 * Crear una suscripción en PayPal
 */
async function createSubscription(paypalPlanId, subscriberEmail, subscriberName, returnUrl, cancelUrl) {
  const token = await getAccessToken();
  
  const response = await axios({
    method: 'post',
    url: `${PAYPAL_API}/v1/billing/subscriptions`,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    data: {
      plan_id: paypalPlanId,
      subscriber: {
        name: {
          given_name: subscriberName.split(' ')[0] || subscriberName,
          surname: subscriberName.split(' ').slice(1).join(' ') || '.'
        },
        email_address: subscriberEmail
      },
      application_context: {
        brand_name: 'MOVIA',
        locale: 'es-DO',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'SUBSCRIBE_NOW',
        return_url: returnUrl,
        cancel_url: cancelUrl,
        payment_method: {
          payer_selected: 'PAYPAL',
          payee_preferred: 'IMMEDIATE_PAYMENT_REQUIRED'
        },
        landing_page: 'BILLING'
      }
    }
  });

  const approveLink = response.data.links.find(link => link.rel === 'approve');
  
  return {
    subscriptionId: response.data.id,
    approveUrl: approveLink ? approveLink.href : null,
    status: response.data.status
  };
}

/**
 * Cancelar suscripción en PayPal
 */
async function cancelSubscription(paypalSubscriptionId) {
  const token = await getAccessToken();
  
  await axios({
    method: 'post',
    url: `${PAYPAL_API}/v1/billing/subscriptions/${paypalSubscriptionId}/cancel`,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    data: {
      reason: 'Cancelado por el administrador'
    }
  });
}

/**
 * Verificar webhook de PayPal
 */
async function verifyWebhook(headers, body) {
  const token = await getAccessToken();
  
  try {
    const response = await axios({
      method: 'post',
      url: `${PAYPAL_API}/v1/notifications/verify-webhook-signature`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        auth_algo: headers['paypal-auth-algo'],
        cert_url: headers['paypal-cert-url'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: process.env.PAYPAL_WEBHOOK_ID,
        webhook_event: body
      }
    });
    
    return response.data.verification_status === 'SUCCESS';
  } catch (error) {
    console.error('Error verificando webhook:', error.message);
    return false;
  }
}

module.exports = {
  getAccessToken,
  createProduct,
  createBillingPlan,
  createSubscription,
  cancelSubscription,
  verifyWebhook
};