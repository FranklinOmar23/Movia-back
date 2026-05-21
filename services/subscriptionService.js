const pool = require('../db');
const { formatDate, addDays, todayDate } = require('../utils/helpers');

/**
 * Obtiene suscripciones activas cuyo periodo termina hoy o antes, 
 * y tienen un método de pago asignado.
 */
async function getDueUsers() {
  const today = todayDate();
  const [rows] = await pool.query(`
    SELECT 
      u.id AS user_id, u.email, u.full_name,
      s.id AS subscription_id, s.plan_id, s.current_period_end,
      sp.price, sp.currency, sp.billing_interval AS billing_interval,
      pm.processor, pm.processor_token, pm.card_last4
    FROM subscriptions s
    JOIN users u ON u.id = s.user_id
    JOIN subscription_plans sp ON sp.id = s.plan_id
    JOIN payment_methods pm ON pm.id = s.payment_method_id
    WHERE s.status = 'active'
      AND s.cancel_at_period_end = FALSE
      AND s.current_period_end <= ?
  `, [today]);
  return rows;
}

/**
 * Registra un pago en payment_transactions
 */
async function recordPayment(userId, subscriptionId, amount, currency, stripePaymentIntentId, status, billingPeriodStart, billingPeriodEnd) {
  await pool.query(
    `INSERT INTO payment_transactions 
     (user_id, subscription_id, payment_method_id, processor, processor_transaction_id, amount, currency, status, billing_period_start, billing_period_end)
     VALUES (?, ?, NULL, 'stripe', ?, ?, ?, ?, ?, ?)`,
    [userId, subscriptionId, stripePaymentIntentId, amount, currency, status, billingPeriodStart, billingPeriodEnd]
  );
}

/**
 * Actualiza el periodo de suscripción después de un cobro exitoso
 */
async function renewSubscription(subscriptionId, currentPeriodEnd, interval) {
  // Calcula nuevo periodo: start = día siguiente al end anterior, end = start + intervalo
  const newStart = addDays(new Date(currentPeriodEnd), 1);
  let newEnd;
  switch (interval) {
    case 'biweekly':
      newEnd = addDays(newStart, 14);
      break;
    case 'monthly':
      // Aproximado: sumar 30 días, se puede refinar
      newEnd = addDays(newStart, 30);
      break;
    case 'yearly':
      newEnd = addDays(newStart, 365);
      break;
    default:
      newEnd = addDays(newStart, 14);
  }

  await pool.query(
    'UPDATE subscriptions SET current_period_start = ?, current_period_end = ? WHERE id = ?',
    [formatDate(newStart), formatDate(newEnd), subscriptionId]
  );
  return { newStart: formatDate(newStart), newEnd: formatDate(newEnd) };
}

module.exports = { getDueUsers, recordPayment, renewSubscription };