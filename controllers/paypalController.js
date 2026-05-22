const paypalService = require('../services/paypalService');
const pool = require('../db');
const { formatDate, addDays } = require('../utils/helpers');
const emailService = require('../services/emailService');

/**
 * Crear suscripción de PayPal para un usuario
 * POST /api/paypal/create-subscription
 */
exports.createPayPalSubscription = async (req, res) => {
  try {
    const { userId, planId } = req.body;

    if (!userId || !planId) {
      return res.status(400).json({ error: 'userId y planId son requeridos' });
    }

    // Obtener usuario
    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    const user = users[0];

    // Obtener plan
    const [plans] = await pool.query('SELECT * FROM subscription_plans WHERE id = ?', [planId]);
    if (plans.length === 0) {
      return res.status(404).json({ error: 'Plan no encontrado' });
    }
    const plan = plans[0];

    // Verificar si ya existe un plan de PayPal para este plan de MOVIA
    let paypalPlanId = plan.paypal_plan_id;

    if (!paypalPlanId) {
      console.log(`🅿️ Creando producto PayPal para: ${plan.name}`);
      
      // Crear producto en PayPal
      const productId = await paypalService.createProduct(plan.name, plan.description);
      
      // Determinar el precio en DOP
      let priceDOP = parseFloat(plan.price);
      
      // Si el plan está en USD, convertir a DOP
      if (plan.currency === 'USD') {
        const tasaDOP = 58; // 1 USD ≈ 58 DOP (aproximado)
        priceDOP = parseFloat((plan.price * tasaDOP).toFixed(2));
        console.log(`💱 Convirtiendo: USD ${plan.price} → DOP ${priceDOP}`);
      }

      console.log(`🅿️ Creando plan PayPal: ${plan.name} - RD$${priceDOP} DOP (${plan.billing_interval})`);
      
      // Crear plan de facturación en PayPal
      paypalPlanId = await paypalService.createBillingPlan(
        productId,
        plan.name,
        priceDOP,
        plan.billing_interval
      );

      // Guardar el ID del plan de PayPal en la BD
      await pool.query(
        'UPDATE subscription_plans SET paypal_plan_id = ? WHERE id = ?',
        [paypalPlanId, planId]
      );
      
      console.log(`✅ Plan PayPal guardado: ${paypalPlanId}`);
    }

    // Crear suscripción en PayPal
    const result = await paypalService.createSubscription(
      paypalPlanId,
      user.email,
      user.full_name,
      process.env.PAYPAL_RETURN_URL || 'https://tudominio.com/success',
      process.env.PAYPAL_CANCEL_URL || 'https://tudominio.com/cancel'
    );

    if (!result.approveUrl) {
      return res.status(500).json({ error: 'No se pudo crear la suscripción en PayPal' });
    }

    console.log(`✅ Suscripción PayPal creada: ${result.subscriptionId} para ${user.email}`);

    res.json({
      success: true,
      approveUrl: result.approveUrl,
      paypalSubscriptionId: result.subscriptionId,
      message: 'Redirige al usuario a esta URL para aprobar la suscripción',
      planName: plan.name,
      price: plan.price,
      currency: plan.currency
    });

  } catch (error) {
    console.error('❌ Error al crear suscripción PayPal:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Error al crear suscripción PayPal',
      details: error.response?.data?.message || error.message 
    });
  }
};

/**
 * Webhook de PayPal
 * POST /api/paypal/webhook
 */
exports.paypalWebhook = async (req, res) => {
  try {
    // Verificar firma del webhook
    const isValid = await paypalService.verifyWebhook(req.headers, req.body);
    
    if (!isValid) {
      console.error('❌ Webhook de PayPal no verificado');
      return res.status(400).json({ error: 'Webhook no verificado' });
    }

    const event = req.body;
    const eventType = event.event_type;

    console.log(`📩 Evento PayPal recibido: ${eventType}`);
    console.log(`   ID: ${event.resource?.id}`);

    // ──────────────────────────────────────────────
    // EVENTO: SUSCRIPCIÓN ACTIVADA
    // ──────────────────────────────────────────────
    if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED') {
      const paypalSubscriptionId = event.resource.id;
      const subscriberEmail = event.resource.subscriber?.email_address;
      const planId = event.resource.plan_id;

      console.log(`🔔 Suscripción activada: ${paypalSubscriptionId}`);
      console.log(`   Email: ${subscriberEmail}`);

      // Buscar usuario por email
      const [users] = await pool.query('SELECT id FROM users WHERE email = ?', [subscriberEmail]);
      
      if (users.length === 0) {
        console.error(`❌ Usuario no encontrado para email: ${subscriberEmail}`);
        return res.json({ received: true });
      }

      const userId = users[0].id;
      const nextBillingDate = event.resource.billing_info?.next_billing_time;
      const nextDate = nextBillingDate ? formatDate(new Date(nextBillingDate)) : addDays(new Date(), 14);

      // Buscar el plan_id de MOVIA por el paypal_plan_id
      const [moviaPlans] = await pool.query(
        'SELECT id FROM subscription_plans WHERE paypal_plan_id = ?',
        [planId]
      );
      const moviaPlanId = moviaPlans.length > 0 ? moviaPlans[0].id : 1;

      // Verificar si ya tiene una suscripción activa
      const [existingSub] = await pool.query(
        "SELECT id FROM subscriptions WHERE user_id = ? AND status = 'active'",
        [userId]
      );

      if (existingSub.length > 0) {
        // Actualizar suscripción existente
        await pool.query(
          `UPDATE subscriptions 
           SET paypal_subscription_id = ?, 
               plan_id = ?,
               current_period_start = NOW(), 
               current_period_end = ?,
               status = 'active',
               cancel_at_period_end = FALSE,
               cancelled_at = NULL
           WHERE id = ?`,
          [paypalSubscriptionId, moviaPlanId, nextDate, existingSub[0].id]
        );
        console.log(`✅ Suscripción ${existingSub[0].id} actualizada para usuario ${userId}`);
      } else {
        // Crear nueva suscripción
        const [newSub] = await pool.query(
          `INSERT INTO subscriptions 
           (user_id, plan_id, payment_method_id, paypal_subscription_id, status, current_period_start, current_period_end, cancel_at_period_end)
           VALUES (?, ?, NULL, ?, 'active', NOW(), ?, FALSE)`,
          [userId, moviaPlanId, paypalSubscriptionId, nextDate]
        );
        console.log(`✅ Nueva suscripción ${newSub.insertId} creada para usuario ${userId}`);
      }

      console.log(`✅ Suscripción PayPal activada para usuario ${userId}`);
    }

    // ──────────────────────────────────────────────
    // EVENTO: PAGO COMPLETADO
    // ──────────────────────────────────────────────
    if (eventType === 'PAYMENT.SALE.COMPLETED') {
      const amount = event.resource.amount?.total;
      const currency = event.resource.amount?.currency || 'DOP';
      const payerEmail = event.resource.payer?.email_address;
      const transactionId = event.resource.id;
      const billingAgreementId = event.resource.billing_agreement_id;

      console.log(`💰 Pago completado: ${transactionId}`);
      console.log(`   Monto: ${amount} ${currency}`);
      console.log(`   Email: ${payerEmail}`);

      const [users] = await pool.query(
        'SELECT id, full_name FROM users WHERE email = ?',
        [payerEmail]
      );

      if (users.length > 0) {
        const userId = users[0].id;
        
        // Buscar suscripción activa
        const [subscriptions] = await pool.query(
          "SELECT id FROM subscriptions WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1",
          [userId]
        );

        if (subscriptions.length > 0) {
          const subscriptionId = subscriptions[0].id;

          // Verificar si ya se registró esta transacción
          const [existingTx] = await pool.query(
            'SELECT id FROM payment_transactions WHERE processor_transaction_id = ?',
            [transactionId]
          );

          if (existingTx.length === 0) {
            // Registrar transacción
            await pool.query(
              `INSERT INTO payment_transactions 
               (user_id, subscription_id, processor, processor_transaction_id, amount, currency, status, billing_period_start, billing_period_end)
               VALUES (?, ?, 'paypal', ?, ?, ?, 'succeeded', NOW(), DATE_ADD(NOW(), INTERVAL 14 DAY))`,
              [userId, subscriptionId, transactionId, amount, currency]
            );

            console.log(`✅ Transacción registrada: ${transactionId}`);

            // Enviar correo de éxito
            try {
              await emailService.sendChargeSuccessEmail(
                payerEmail,
                users[0].full_name,
                amount,
                'próximo ciclo'
              );
              console.log(`📧 Correo enviado a ${payerEmail}`);
            } catch (e) {
              console.error('Error enviando correo:', e.message);
            }
          }
        }
      }
    }

    // ──────────────────────────────────────────────
    // EVENTO: PAGO FALLIDO
    // ──────────────────────────────────────────────
    if (eventType === 'BILLING.SUBSCRIPTION.PAYMENT.FAILED') {
      const subscriberEmail = event.resource.subscriber?.email_address;
      const paypalSubscriptionId = event.resource.id;

      console.log(`❌ Pago fallido para: ${subscriberEmail}`);
      console.log(`   Suscripción PayPal: ${paypalSubscriptionId}`);

      const [users] = await pool.query(
        'SELECT id, full_name FROM users WHERE email = ?',
        [subscriberEmail]
      );

      if (users.length > 0) {
        // Enviar correo de fallo
        try {
          await emailService.sendChargeFailedEmail(
            subscriberEmail,
            users[0].full_name,
            0
          );
          console.log(`📧 Correo de fallo enviado a ${subscriberEmail}`);
        } catch (e) {
          console.error('Error enviando correo:', e.message);
        }

        // Marcar suscripción como past_due
        await pool.query(
          "UPDATE subscriptions SET status = 'past_due' WHERE paypal_subscription_id = ?",
          [paypalSubscriptionId]
        );
      }
    }

    // ──────────────────────────────────────────────
    // EVENTO: SUSCRIPCIÓN CANCELADA
    // ──────────────────────────────────────────────
    if (eventType === 'BILLING.SUBSCRIPTION.CANCELLED') {
      const paypalSubscriptionId = event.resource.id;

      console.log(`🗑️ Suscripción cancelada: ${paypalSubscriptionId}`);

      await pool.query(
        "UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW() WHERE paypal_subscription_id = ?",
        [paypalSubscriptionId]
      );

      console.log(`✅ Suscripción ${paypalSubscriptionId} marcada como cancelada en BD`);
    }

    // ──────────────────────────────────────────────
    // EVENTO: SUSCRIPCIÓN EXPIRADA
    // ──────────────────────────────────────────────
    if (eventType === 'BILLING.SUBSCRIPTION.EXPIRED') {
      const paypalSubscriptionId = event.resource.id;

      console.log(`⏰ Suscripción expirada: ${paypalSubscriptionId}`);

      await pool.query(
        "UPDATE subscriptions SET status = 'expired' WHERE paypal_subscription_id = ?",
        [paypalSubscriptionId]
      );
    }

    // ──────────────────────────────────────────────
    // EVENTO: SUSCRIPCIÓN ACTUALIZADA
    // ──────────────────────────────────────────────
    if (eventType === 'BILLING.SUBSCRIPTION.UPDATED') {
      const paypalSubscriptionId = event.resource.id;
      const nextBillingDate = event.resource.billing_info?.next_billing_time;

      console.log(`🔄 Suscripción actualizada: ${paypalSubscriptionId}`);

      if (nextBillingDate) {
        await pool.query(
          'UPDATE subscriptions SET current_period_end = ? WHERE paypal_subscription_id = ?',
          [formatDate(new Date(nextBillingDate)), paypalSubscriptionId]
        );
      }
    }

    res.json({ received: true });

  } catch (error) {
    console.error('❌ Error en webhook PayPal:', error);
    // Siempre responder 200 para que PayPal no reintente
    res.status(200).json({ received: true, error: error.message });
  }
};