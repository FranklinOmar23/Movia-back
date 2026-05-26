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

        console.log(`\n🅿️ ===== NUEVA SUSCRIPCIÓN PAYPAL =====`);
        console.log(`   Usuario: ${user.full_name} (${user.email})`);
        console.log(`   Plan: ${plan.name} - ${plan.price} ${plan.currency}`);

        // Verificar si ya existe suscripción activa
        const [existingActive] = await pool.query(
            `SELECT id FROM subscriptions 
             WHERE user_id = ? AND status IN ('active', 'pending')`,
            [userId]
        );

        if (existingActive.length > 0) {
            return res.status(400).json({
                error: 'Ya tienes una suscripción pendiente o activa',
                subscriptionId: existingActive[0].id
            });
        }

        // Obtener o crear plan PayPal
        let paypalPlanId = plan.paypal_plan_id;

        if (!paypalPlanId) {
            const productId = await paypalService.createProduct(plan.name, plan.description);
            const planResult = await paypalService.createBillingPlan(
                productId,
                plan.name,
                parseFloat(plan.price),
                plan.billing_interval
            );
            paypalPlanId = planResult.planId;
            await pool.query(
                'UPDATE subscription_plans SET paypal_plan_id = ? WHERE id = ?',
                [paypalPlanId, planId]
            );
        }

        // Crear suscripción en PayPal
        const baseUrl = process.env.APP_URL || 'https://maroon-goshawk-691607.hostingersite.com';
        const frontendUrl = process.env.FRONTEND_URL || 'https://tu-frontend.com';

        const result = await paypalService.createSubscription(
            paypalPlanId,
            user.email,
            user.full_name,
            `${frontendUrl}/payment/success`,
            `${frontendUrl}/payment/cancel`
        );

        if (!result.approveUrl) {
            return res.status(500).json({ error: 'No se pudo crear la suscripción en PayPal' });
        }

        // Guardar suscripción en BD con estado PENDING
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);

        const [newSubscription] = await pool.query(
            `INSERT INTO subscriptions 
             (user_id, plan_id, paypal_subscription_id, status, 
              current_period_start, current_period_end, created_at)
             VALUES (?, ?, ?, 'pending', ?, ?, NOW())`,
            [userId, planId, result.subscriptionId, formatDate(startDate), formatDate(endDate)]
        );

        console.log(`✅ Suscripción pendiente creada en BD: ${newSubscription.insertId}`);

        try {
            await emailService.sendWelcomeEmail(
                user.email,
                user.full_name,
                result.approveUrl,
                plan.name,
                plan.price,
                plan.currency
            );
            console.log(`📧 Bienvenida con link de pago enviada a ${user.email}`);
        } catch (emailError) {
            console.error('❌ Error enviando correo:', emailError.message);
        }

        res.json({
            success: true,
            message: 'Suscripción creada. Revisa tu correo para completar el pago.',
            paypalSubscriptionId: result.subscriptionId,
            subscriptionId: newSubscription.insertId,
            approveUrl: result.approveUrl,
            planName: plan.name,
            price: plan.price,
            currency: plan.currency
        });

    } catch (error) {
        console.error('\n❌ Error en createPayPalSubscription:', error);
        res.status(500).json({
            error: 'Error al crear suscripción PayPal',
            details: error.message
        });
    }
};

/**
 * ✅ NUEVO: Guardar método de pago del usuario en BD
 * @param {number} userId
 * @param {string} paypalSubscriptionId
 */
async function savePaymentMethod(userId, paypalSubscriptionId) {
    try {
        const subDetails = await paypalService.getSubscriptionDetails(paypalSubscriptionId);
        const paymentSource = subDetails.payment_source;

        let card_last4   = null;
        let card_brand   = null;
        let card_exp_month = null;
        let card_exp_year  = null;
        let processor_token = null;

        if (paymentSource?.card) {
            // Usuario pagó con tarjeta directa
            card_last4   = paymentSource.card.last_digits   || null;
            card_brand   = paymentSource.card.brand         || null; // VISA, MASTERCARD, etc.
            processor_token = paymentSource.card.vault_id   || paypalSubscriptionId;

            // PayPal devuelve expiry como "2027-05"
            if (paymentSource.card.expiry) {
                const parts = paymentSource.card.expiry.split('-');
                card_exp_year  = parts[0] || null; // 2027
                card_exp_month = parts[1] || null; // 05
            }

            console.log(`💳 Tarjeta detectada: ${card_brand} **** ${card_last4} vence ${card_exp_month}/${card_exp_year}`);

        } else if (paymentSource?.paypal) {
            // Usuario pagó con cuenta PayPal (no tarjeta directa)
            processor_token = paymentSource.paypal.vault_id || paypalSubscriptionId;
            card_brand = 'PAYPAL';
            console.log(`💳 Pago via cuenta PayPal (vault_id: ${processor_token})`);
        } else {
            // Fallback: guardar solo el subscription ID como token
            processor_token = paypalSubscriptionId;
            card_brand = 'PAYPAL';
            console.log(`⚠️ No se encontró payment_source, guardando subscription ID como token`);
        }

        // Insertar o actualizar en payment_methods
        await pool.query(
            `INSERT INTO payment_methods 
             (user_id, processor, processor_token, card_brand, card_last4, card_exp_month, card_exp_year, is_default)
             VALUES (?, 'paypal', ?, ?, ?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE
                 card_brand     = VALUES(card_brand),
                 card_last4     = VALUES(card_last4),
                 card_exp_month = VALUES(card_exp_month),
                 card_exp_year  = VALUES(card_exp_year),
                 is_default     = 1`,
            [userId, processor_token, card_brand, card_last4, card_exp_month, card_exp_year]
        );

        console.log(`✅ Método de pago guardado para usuario ${userId}`);
    } catch (err) {
        // No interrumpir el flujo si falla guardar la tarjeta
        console.error(`⚠️ No se pudo guardar el método de pago:`, err.message);
    }
}

/**
 * Webhook de PayPal
 * POST /api/paypal/webhook
 */
exports.paypalWebhook = async (req, res) => {
    console.log('🔔 WEBHOOK RECIBIDO');

    try {
        let isValid = true;

        if (process.env.NODE_ENV === 'production') {
            isValid = await paypalService.verifyWebhook(req.headers, req.body);
            if (!isValid) {
                console.error('❌ Webhook de PayPal no verificado');
                return res.status(400).json({ error: 'Webhook no verificado' });
            }
        }

        const event = req.body;
        const eventType = event.event_type;

        console.log(`\n📩 ===== WEBHOOK PAYPAL =====`);
        console.log(`   Evento: ${eventType}`);
        console.log(`   Evento completo:`, JSON.stringify(event, null, 2));

        // ──────────────────────────────────────────────
        // EVENTO: SUSCRIPCIÓN APROBADA (APPROVED)
        // ──────────────────────────────────────────────
        if (eventType === 'BILLING.SUBSCRIPTION.APPROVED') {
            const paypalSubscriptionId = event.resource.id;

            console.log(`✅ Suscripción aprobada por el usuario: ${paypalSubscriptionId}`);

            const [subscriptions] = await pool.query(
                `SELECT id, user_id, plan_id FROM subscriptions 
                 WHERE paypal_subscription_id = ? AND status = 'pending'`,
                [paypalSubscriptionId]
            );

            if (subscriptions.length > 0) {
                const newEndDate = new Date();
                newEndDate.setDate(newEndDate.getDate() + 30);

                await pool.query(
                    `UPDATE subscriptions 
                     SET status = 'active',
                         current_period_start = NOW(),
                         current_period_end = ?
                     WHERE id = ?`,
                    [formatDate(newEndDate), subscriptions[0].id]
                );
                console.log(`✅ Suscripción ${subscriptions[0].id} activada en BD`);
            } else {
                console.log(`⚠️ No se encontró suscripción pendiente para ${paypalSubscriptionId}`);
            }
        }

        // ──────────────────────────────────────────────
        // EVENTO: SUSCRIPCIÓN ACTIVADA
        // ──────────────────────────────────────────────
        if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED') {
            const paypalSubscriptionId = event.resource.id;

            await pool.query(
                `UPDATE subscriptions 
                 SET status = 'active', 
                     current_period_start = NOW(),
                     current_period_end = DATE_ADD(NOW(), INTERVAL 30 DAY)
                 WHERE paypal_subscription_id = ?`,
                [paypalSubscriptionId]
            );

            const [subscriptions] = await pool.query(
                `SELECT s.*, u.email, u.full_name, p.name as plan_name, p.price 
                 FROM subscriptions s
                 JOIN users u ON s.user_id = u.id
                 JOIN subscription_plans p ON s.plan_id = p.id
                 WHERE s.paypal_subscription_id = ?`,
                [paypalSubscriptionId]
            );

            if (subscriptions.length > 0) {
                const sub = subscriptions[0];

                // Activar usuario
                await pool.query(
                    'UPDATE users SET is_active = 1, updated_at = NOW() WHERE id = ?',
                    [sub.user_id]
                );
                console.log(`✅ Usuario ${sub.user_id} activado tras el pago`);

                // ✅ NUEVO: Guardar método de pago (tarjeta)
                await savePaymentMethod(sub.user_id, paypalSubscriptionId);

                // Correo de éxito
                try {
                    await emailService.sendPaymentSuccessEmail(
                        sub.email,
                        sub.full_name,
                        sub.plan_name,
                        sub.price,
                        sub.current_period_end
                    );
                } catch (emailError) {
                    console.error('❌ Error enviando correo de éxito:', emailError.message);
                }
            }
        }

        // ──────────────────────────────────────────────
        // EVENTO: PAGO COMPLETADO
        // ──────────────────────────────────────────────
        if (eventType === 'PAYMENT.SALE.COMPLETED') {
            const amount = event.resource.amount?.total;
            const currency = event.resource.amount?.currency || 'USD';
            const transactionId = event.resource.id;
            const paypalSubscriptionId = event.resource.billing_agreement_id;

            console.log(`💰 Pago completado`);
            console.log(`   Transacción: ${transactionId}`);
            console.log(`   Monto: ${amount} ${currency}`);
            console.log(`   Subscription ID: ${paypalSubscriptionId}`);

            if (paypalSubscriptionId) {
                const [existingTx] = await pool.query(
                    'SELECT id FROM payment_transactions WHERE processor_transaction_id = ?',
                    [transactionId]
                );

                if (existingTx.length === 0) {
                    const [subscriptions] = await pool.query(
                        `SELECT id, user_id FROM subscriptions 
                         WHERE paypal_subscription_id = ?`,
                        [paypalSubscriptionId]
                    );

                    if (subscriptions.length > 0) {
                        await pool.query(
                            `INSERT INTO payment_transactions 
                             (user_id, subscription_id, processor, processor_transaction_id, 
                              amount, currency, status, billing_period_start, billing_period_end)
                             VALUES (?, ?, 'paypal', ?, ?, ?, 'succeeded', NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY))`,
                            [subscriptions[0].user_id, subscriptions[0].id, transactionId, amount, currency]
                        );

                        console.log(`✅ Transacción registrada en BD`);

                        const [users] = await pool.query(
                            'SELECT email, full_name FROM users WHERE id = ?',
                            [subscriptions[0].user_id]
                        );

                        if (users.length > 0) {
                            try {
                                await emailService.sendChargeSuccessEmail(
                                    users[0].email,
                                    users[0].full_name,
                                    amount,
                                    currency
                                );
                                console.log(`📧 Correo de éxito enviado`);
                            } catch (e) {
                                console.error('Error enviando correo:', e.message);
                            }
                        }
                    }
                } else {
                    console.log(`⚠️ Transacción ${transactionId} ya registrada`);
                }
            }
        }

        // ──────────────────────────────────────────────
        // EVENTO: PAGO FALLIDO
        // ──────────────────────────────────────────────
        if (eventType === 'BILLING.SUBSCRIPTION.PAYMENT.FAILED') {
            const paypalSubscriptionId = event.resource.id;

            console.log(`❌ Pago fallido para suscripción: ${paypalSubscriptionId}`);

            await pool.query(
                `UPDATE subscriptions SET status = 'past_due' 
                 WHERE paypal_subscription_id = ?`,
                [paypalSubscriptionId]
            );
            console.log(`⚠️ Suscripción marcada como past_due`);
        }

        // ──────────────────────────────────────────────
        // EVENTO: SUSCRIPCIÓN CANCELADA
        // ──────────────────────────────────────────────
        if (eventType === 'BILLING.SUBSCRIPTION.CANCELLED') {
            const paypalSubscriptionId = event.resource.id;

            console.log(`🗑️ Suscripción cancelada: ${paypalSubscriptionId}`);

            await pool.query(
                `UPDATE subscriptions 
                 SET status = 'cancelled', 
                     cancelled_at = NOW(),
                     cancel_at_period_end = TRUE
                 WHERE paypal_subscription_id = ?`,
                [paypalSubscriptionId]
            );

            console.log(`✅ Suscripción marcada como cancelada en BD`);
        }

        console.log(`📩 ===== FIN WEBHOOK =====\n`);
        res.json({ received: true });

    } catch (error) {
        console.error('\n❌ ===== ERROR WEBHOOK =====');
        console.error('Mensaje:', error.message);
        console.error('Stack:', error.stack);
        console.error('===========================\n');

        // Siempre responder 200 para que PayPal no reintente
        res.status(200).json({ received: true, error: error.message });
    }
};