const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const pool = require('../db');
const { formatDate, addDays } = require('../utils/helpers');
const emailService = require('../services/emailService');

/**
 * Crear sesión de checkout para NUEVA tarjeta
 */
exports.createCheckoutSession = async (req, res) => {
  try {
    const { userId } = req.body;
    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (users.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    const user = users[0];
    if (!user.stripe_customer_id) return res.status(400).json({ error: 'Cliente Stripe no creado' });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'setup',
      customer: user.stripe_customer_id,
      success_url: process.env.SUCCESS_URL || 'https://tudominio.com/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: process.env.CANCEL_URL || 'https://tudominio.com/cancel',
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error en createCheckoutSession:', error);
    res.status(500).json({ error: 'Error al crear sesión' });
  }
};

/**
 * Reactivar suscripción:
 * - Si tiene tarjeta guardada → Cobro automático
 * - Si no tiene o falla → Devuelve URL de Stripe para nueva tarjeta
 */
exports.reactivateSubscription = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId es requerido' });
    }

    // Obtener usuario
    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (users.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    const user = users[0];

    // Obtener suscripción
    const [subscriptions] = await pool.query(`
      SELECT s.*, sp.name AS plan_name, sp.price, sp.billing_interval, sp.currency
      FROM subscriptions s
      JOIN subscription_plans sp ON s.plan_id = sp.id
      WHERE s.user_id = ? 
      ORDER BY s.id DESC 
      LIMIT 1
    `, [userId]);

    if (subscriptions.length === 0) {
      return res.status(404).json({ error: 'No se encontró suscripción para este usuario' });
    }

    const subscription = subscriptions[0];

    // Verificar si tiene método de pago guardado
    const [paymentMethods] = await pool.query(
      'SELECT * FROM payment_methods WHERE user_id = ? AND is_default = TRUE ORDER BY id DESC LIMIT 1',
      [userId]
    );

    // CASO 1: Tiene tarjeta guardada → Intentar cobro automático
    if (paymentMethods.length > 0 && user.stripe_customer_id) {
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(subscription.price * 100),
          currency: subscription.currency.toLowerCase(),
          customer: user.stripe_customer_id,
          payment_method: paymentMethods[0].processor_token,
          off_session: true,
          confirm: true,
          description: `Reactivación - ${subscription.plan_name}`,
        });

        // Cobro exitoso → Reactivar
        const newStart = formatDate(new Date());
        let daysToAdd = 14;
        switch (subscription.billing_interval) {
          case 'biweekly': daysToAdd = 14; break;
          case 'monthly': daysToAdd = 30; break;
          case 'yearly': daysToAdd = 365; break;
        }
        const newEnd = addDays(newStart, daysToAdd);

        await pool.query(
          `UPDATE subscriptions 
           SET status = 'active', cancel_at_period_end = FALSE, cancelled_at = NULL,
               current_period_start = ?, current_period_end = ?, payment_method_id = ?
           WHERE id = ?`,
          [newStart, newEnd, paymentMethods[0].id, subscription.id]
        );

        // Registrar transacción
        await pool.query(
          `INSERT INTO payment_transactions 
           (user_id, subscription_id, processor, processor_transaction_id, amount, currency, status, billing_period_start, billing_period_end)
           VALUES (?, ?, 'stripe', ?, ?, ?, 'succeeded', ?, ?)`,
          [userId, subscription.id, paymentIntent.id, subscription.price, subscription.currency, newStart, newEnd]
        );

        // Enviar correo
        try {
          await emailService.sendChargeSuccessEmail(user.email, user.full_name, subscription.price, newEnd);
        } catch (e) {
          console.error('Error enviando correo:', e.message);
        }

        return res.json({
          autoCharged: true,
          message: 'Suscripción reactivada con tu tarjeta guardada',
          planName: subscription.plan_name,
          price: subscription.price,
          cardLast4: paymentMethods[0].card_last4,
          newPeriod: { start: newStart, end: newEnd }
        });
      } catch (chargeError) {
        console.error('Cobro automático falló:', chargeError.message);
        // Continuar al flujo de nueva tarjeta
      }
    }

    // CASO 2: No tiene tarjeta o el cobro falló → Crear sesión de Stripe
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, name: user.full_name });
      customerId = customer.id;
      await pool.query('UPDATE users SET stripe_customer_id = ? WHERE id = ?', [customerId, userId]);
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'setup',
      customer: customerId,
      success_url: process.env.SUCCESS_URL || 'https://tudominio.com/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: process.env.CANCEL_URL || 'https://tudominio.com/cancel',
      metadata: {
        userId: userId.toString(),
        subscriptionId: subscription.id.toString(),
        type: 'reactivation'
      }
    });

    return res.json({
      autoCharged: false,
      needsNewCard: true,
      message: 'Necesitas registrar una tarjeta para reactivar',
      url: session.url,
      planName: subscription.plan_name,
      price: subscription.price
    });

  } catch (error) {
    console.error('Error en reactivateSubscription:', error);
    res.status(500).json({ error: 'Error al reactivar suscripción' });
  }
};

/**
 * Webhook de Stripe
 */
exports.webhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Error verificando webhook:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    if (session.mode === 'setup' && session.setup_intent) {
      const setupIntent = await stripe.setupIntents.retrieve(session.setup_intent);
      const paymentMethodId = setupIntent.payment_method;
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      const customerId = session.customer;

      const [users] = await pool.query('SELECT id FROM users WHERE stripe_customer_id = ?', [customerId]);
      if (users.length === 0) {
        console.error('No se encontró usuario con ese customer_id');
        return res.json({ received: true });
      }
      const userId = users[0].id;

      // Desmarcar otros métodos
      await pool.query('UPDATE payment_methods SET is_default = FALSE WHERE user_id = ?', [userId]);

      // Guardar nuevo método
      await pool.query(
        `INSERT INTO payment_methods 
         (user_id, processor, processor_token, card_brand, card_last4, card_exp_month, card_exp_year, is_default)
         VALUES (?, 'stripe', ?, ?, ?, ?, ?, TRUE)`,
        [userId, paymentMethodId, paymentMethod.card.brand, paymentMethod.card.last4,
          paymentMethod.card.exp_month, paymentMethod.card.exp_year]
      );

      const [pm] = await pool.query(
        'SELECT id FROM payment_methods WHERE user_id = ? AND processor_token = ? ORDER BY id DESC LIMIT 1',
        [userId, paymentMethodId]
      );
      const pmId = pm.length > 0 ? pm[0].id : null;

      // Si es reactivación
      if (session.metadata && session.metadata.type === 'reactivation') {
        const subId = session.metadata.subscriptionId;
        const [subData] = await pool.query(
          'SELECT s.*, sp.billing_interval FROM subscriptions s JOIN subscription_plans sp ON s.plan_id = sp.id WHERE s.id = ?',
          [subId]
        );

        if (subData.length > 0) {
          const newStart = formatDate(new Date());
          let daysToAdd = 14;
          switch (subData[0].billing_interval) {
            case 'biweekly': daysToAdd = 14; break;
            case 'monthly': daysToAdd = 30; break;
            case 'yearly': daysToAdd = 365; break;
          }
          const newEnd = addDays(newStart, daysToAdd);

          await pool.query(
            `UPDATE subscriptions 
             SET status = 'active', cancel_at_period_end = FALSE, cancelled_at = NULL,
                 current_period_start = ?, current_period_end = ?, payment_method_id = ?
             WHERE id = ?`,
            [newStart, newEnd, pmId, subId]
          );
          console.log(`✅ Suscripción ${subId} reactivada`);
        }
      } else if (pmId) {
        const [subs] = await pool.query(
          'SELECT id FROM subscriptions WHERE user_id = ? AND status = "active" ORDER BY id DESC LIMIT 1',
          [userId]
        );
        if (subs.length > 0) {
          await pool.query('UPDATE subscriptions SET payment_method_id = ? WHERE id = ?', [pmId, subs[0].id]);
        }
      }
    }
  }

  res.json({ received: true });
};