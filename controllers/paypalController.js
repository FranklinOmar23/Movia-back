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

        // Verificar si ya existe un plan de PayPal para este plan de MOVIA
        let paypalPlanId = plan.paypal_plan_id;

        if (!paypalPlanId) {
            console.log(`\n📦 Creando producto PayPal para: ${plan.name}`);

            // Crear producto en PayPal
            const productId = await paypalService.createProduct(plan.name, plan.description);
            console.log(`   Producto creado: ${productId}`);

            // El servicio createBillingPlan ahora devuelve un objeto { planId, priceUSD, priceDOP }
            const planResult = await paypalService.createBillingPlan(
                productId,
                plan.name,
                parseFloat(plan.price),
                plan.billing_interval
            );

            paypalPlanId = planResult.planId;  // ← Acceder a la propiedad .planId

            // Guardar el ID del plan de PayPal en la BD
            await pool.query(
                'UPDATE subscription_plans SET paypal_plan_id = ? WHERE id = ?',
                [paypalPlanId, planId]
            );

            console.log(`✅ Plan PayPal guardado: ${paypalPlanId}`);
            console.log(`   USD: $${planResult.priceUSD} | DOP: RD$${planResult.priceDOP}`);
        } else {
            console.log(`\n♻️  Reutilizando plan PayPal existente: ${paypalPlanId}`);
        }

        // Crear suscripción en PayPal
        console.log(`\n🔗 Creando suscripción PayPal...`);
        const result = await paypalService.createSubscription(
            paypalPlanId,
            user.email,
            user.full_name,
            process.env.PAYPAL_RETURN_URL || 'https://tudominio.com/success',
            process.env.PAYPAL_CANCEL_URL || 'https://tudominio.com/cancel'
        );

        if (!result.approveUrl) {
            console.error('❌ No se obtuvo URL de aprobación');
            return res.status(500).json({ error: 'No se pudo crear la suscripción en PayPal' });
        }

        console.log(`✅ Suscripción creada: ${result.subscriptionId}`);
        console.log(`   Estado: ${result.status}`);
        console.log(`   URL: ${result.approveUrl.substring(0, 60)}...`);
        console.log(`🅿️ ===== FIN =====\n`);

        res.json({
            success: true,
            approveUrl: result.approveUrl,
            paypalSubscriptionId: result.subscriptionId,
            message: 'Redirige al usuario a esta URL para aprobar la suscripción',
            planName: plan.name,
            priceDOP: plan.price,
            currencyDOP: plan.currency,
            status: result.status
        });

    } catch (error) {
        console.error('\n❌ ===== ERROR PAYPAL =====');
        console.error('Mensaje:', error.message);
        if (error.response?.data) {
            console.error('Detalle PayPal:', JSON.stringify(error.response.data, null, 2));
        }
        console.error('===========================\n');

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
    console.log('🔔 WEBHOOK RECIBIDO - evento:', req.body?.event_type);
    console.log('🔔 Email del subscriber:', req.body?.resource?.subscriber?.email_address);
    try {
        // Verificar firma del webhook
        const isValid = await paypalService.verifyWebhook(req.headers, req.body);

        if (!isValid) {
            console.error('❌ Webhook de PayPal no verificado');
            return res.status(400).json({ error: 'Webhook no verificado' });
        }

        const event = req.body;
        const eventType = event.event_type;

        console.log(`\n📩 ===== WEBHOOK PAYPAL =====`);
        console.log(`   Evento: ${eventType}`);
        console.log(`   ID: ${event.resource?.id}`);
        console.log(`   Hora: ${new Date().toISOString()}`);

        // ──────────────────────────────────────────────
        // EVENTO: SUSCRIPCIÓN ACTIVADA
        // ──────────────────────────────────────────────
        if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED') {
            const paypalSubscriptionId = event.resource.id;
            const planId = event.resource.plan_id;

            // El email puede venir en distintos paths según la versión de PayPal
            const subscriberEmail =
                event.resource.subscriber?.email_address ||
                event.resource.subscriber?.email ||
                null;

            console.log(`🔔 Suscripción activada`);
            console.log(`   PayPal Sub ID: ${paypalSubscriptionId}`);
            console.log(`   Email: ${subscriberEmail}`);
            console.log(`   Plan ID: ${planId}`);
            console.log(`   Resource completo:`, JSON.stringify(event.resource, null, 2)); // 👈 debug

            if (!subscriberEmail) {
                console.error('❌ No se pudo extraer el email del evento');
                return res.json({ received: true });
            }

            const [users] = await pool.query(
                'SELECT id FROM users WHERE email = ?',
                [subscriberEmail]
            );

            if (users.length === 0) {
                console.error(`❌ Usuario no encontrado: ${subscriberEmail}`);
                return res.json({ received: true });
            }

            const userId = users[0].id;
            const nextBillingDate = event.resource.billing_info?.next_billing_time;
            const nextDate = nextBillingDate
                ? formatDate(new Date(nextBillingDate))
                : addDays(new Date(), 30);

            // Buscar plan MOVIA por paypal_plan_id
            const [moviaPlans] = await pool.query(
                'SELECT id FROM subscription_plans WHERE paypal_plan_id = ?',
                [planId]
            );
            const moviaPlanId = moviaPlans.length > 0 ? moviaPlans[0].id : 1;

            // Verificar si ya existe suscripción con este paypal_subscription_id
            const [existingPaypal] = await pool.query(
                'SELECT id FROM subscriptions WHERE paypal_subscription_id = ?',
                [paypalSubscriptionId]
            );

            if (existingPaypal.length > 0) {
                console.log(`⚠️ Suscripción PayPal ya registrada, omitiendo`);
                return res.json({ received: true });
            }

            // Verificar si tiene suscripción activa previa
            const [existingSub] = await pool.query(
                "SELECT id FROM subscriptions WHERE user_id = ? AND status = 'active'",
                [userId]
            );

            if (existingSub.length > 0) {
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
                console.log(`✅ Suscripción ${existingSub[0].id} actualizada con PayPal ID`);
            } else {
                const [newSub] = await pool.query(
                    `INSERT INTO subscriptions 
             (user_id, plan_id, payment_method_id, paypal_subscription_id, 
              status, current_period_start, current_period_end, cancel_at_period_end)
             VALUES (?, ?, NULL, ?, 'active', NOW(), ?, FALSE)`,
                    [userId, moviaPlanId, paypalSubscriptionId, nextDate]
                );
                console.log(`✅ Nueva suscripción creada: ${newSub.insertId}`);
            }
        }
        // ──────────────────────────────────────────────
        // EVENTO: PAGO COMPLETADO
        // ──────────────────────────────────────────────
        if (eventType === 'PAYMENT.SALE.COMPLETED') {
            const amount = event.resource.amount?.total;
            const currency = event.resource.amount?.currency || 'USD';
            const payerEmail = event.resource.payer?.email_address;
            const transactionId = event.resource.id;

            console.log(`💰 Pago completado`);
            console.log(`   Transacción: ${transactionId}`);
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

                        console.log(`✅ Transacción registrada en BD`);

                        // Enviar correo de éxito
                        try {
                            await emailService.sendChargeSuccessEmail(
                                payerEmail,
                                users[0].full_name,
                                amount,
                                'próximo ciclo'
                            );
                            console.log(`📧 Correo de éxito enviado a ${payerEmail}`);
                        } catch (e) {
                            console.error('Error enviando correo:', e.message);
                        }
                    } else {
                        console.log(`⚠️ Transacción ${transactionId} ya registrada, omitiendo`);
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

            console.log(`❌ Pago fallido`);
            console.log(`   Email: ${subscriberEmail}`);
            console.log(`   PayPal Sub ID: ${paypalSubscriptionId}`);

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
                console.log(`⚠️ Suscripción marcada como past_due`);
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

            console.log(`✅ Suscripción marcada como cancelada en BD`);
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

            console.log(`✅ Suscripción marcada como expirada en BD`);
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
                console.log(`   Nueva fecha: ${formatDate(new Date(nextBillingDate))}`);
            }
        }

        console.log(`📩 ===== FIN WEBHOOK =====\n`);
        res.json({ received: true });

    } catch (error) {
        console.error('\n❌ ===== ERROR WEBHOOK =====');
        console.error('Mensaje:', error.message);
        console.error('===========================\n');

        // Siempre responder 200 para que PayPal no reintente
        res.status(200).json({ received: true, error: error.message });
    }
};