const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const pool = require('../db');

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
    console.error(error);
    res.status(500).json({ error: 'Error al crear sesión' });
  }
};

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

      // Obtener detalles del método de pago desde Stripe
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

      const customerId = session.customer;

      // Buscar usuario por stripe_customer_id
      const [users] = await pool.query('SELECT id FROM users WHERE stripe_customer_id = ?', [customerId]);
      if (users.length === 0) {
        console.error('No se encontró usuario con ese customer_id');
        return res.json({ received: true });
      }
      const userId = users[0].id;

      // Desmarcar otros métodos de pago por defecto
      await pool.query('UPDATE payment_methods SET is_default = FALSE WHERE user_id = ?', [userId]);

      // Insertar nuevo método de pago
      await pool.query(
        `INSERT INTO payment_methods 
         (user_id, processor, processor_token, card_brand, card_last4, card_exp_month, card_exp_year, is_default)
         VALUES (?, 'stripe', ?, ?, ?, ?, ?, TRUE)`,
        [
          userId,
          paymentMethodId,
          paymentMethod.card.brand,
          paymentMethod.card.last4,
          paymentMethod.card.exp_month,
          paymentMethod.card.exp_year
        ]
      );

      // Asignar el método de pago a la suscripción activa del usuario
      const [subs] = await pool.query(
        'SELECT id FROM subscriptions WHERE user_id = ? AND status = "active" ORDER BY id DESC LIMIT 1',
        [userId]
      );
      if (subs.length > 0) {
        const [pm] = await pool.query(
          'SELECT id FROM payment_methods WHERE user_id = ? AND processor_token = ?',
          [userId, paymentMethodId]
        );
        if (pm.length > 0) {
          await pool.query('UPDATE subscriptions SET payment_method_id = ? WHERE id = ?', [pm[0].id, subs[0].id]);
        }
      }

      console.log(`Método de pago ${paymentMethodId} guardado para usuario ${userId}`);
    }
  }

  res.json({ received: true });
};