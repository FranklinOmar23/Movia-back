const cron = require('node-cron');
const stripeService = require('../services/stripeService');
const subscriptionService = require('../services/subscriptionService');
const emailService = require('../services/emailService');

async function processDailyCharges() {
  console.log('⏰ Iniciando job de cobros diarios...');
  try {
    const dueUsers = await subscriptionService.getDueUsers();
    console.log(`Usuarios a cobrar hoy: ${dueUsers.length}`);

    for (const user of dueUsers) {
      try {
        console.log(`Procesando cobro para ${user.email} (${user.full_name}) por $${user.price}`);

        // Buscar el payment_method_id correspondiente para pasarlo al cobro (aunque lo tenemos como token, Stripe lo necesita)
        const paymentMethod = user.processor_token; // Stripe pm_xxx

        // Realizar cobro
        const paymentIntent = await stripeService.chargeCustomer(
          user.stripe_customer_id,
          paymentMethod,
          user.price,
          `Suscripción ${user.plan_id}`
        );

        // Registrar pago exitoso
        await subscriptionService.recordPayment(
          user.user_id,
          user.subscription_id,
          user.price,
          user.currency || 'usd',
          paymentIntent.id,
          paymentIntent.status,
          user.current_period_end, // inicio del periodo que termina? Normalmente se guarda el periodo cubierto
          user.current_period_end   // aquí simplificamos, pero podrías calcular el periodo real
        );

        // Renovar suscripción (nuevo periodo)
        const { newEnd } = await subscriptionService.renewSubscription(
          user.subscription_id,
          user.current_period_end,
          user.billing_interval
        );

        // Enviar correo de éxito
        await emailService.sendChargeSuccessEmail(user.email, user.full_name, user.price, newEnd);
        console.log(`✅ Cobro exitoso a ${user.email}`);
      } catch (chargeError) {
        console.error(`❌ Error cobrando a ${user.email}:`, chargeError.message);
        await emailService.sendChargeFailedEmail(user.email, user.full_name, user.price);
        // Opcional: marcar suscripción como past_due
        // await pool.query('UPDATE subscriptions SET status = ? WHERE id = ?', ['past_due', user.subscription_id]);
      }
    }
    console.log('🏁 Job diario finalizado');
  } catch (error) {
    console.error('Error en el job diario:', error);
  }
}

function startDailyJob() {
  // Ejecutar cada día a las 00:05
  cron.schedule('5 0 * * *', processDailyCharges, {
    scheduled: true,
    timezone: 'America/Santo_Domingo'
  });
  console.log('📅 Job diario programado (00:05)');
}

module.exports = { startDailyJob, processDailyCharges };