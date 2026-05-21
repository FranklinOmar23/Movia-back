const bcrypt = require('bcryptjs');
const pool = require('../db');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const emailService = require('../services/emailService');
const { formatDate, addDays } = require('../utils/helpers');

exports.createUser = async (req, res) => {
  try {
    const { full_name, email, password, plan_id, period_end_date } = req.body;

    if (!full_name || !email || !password || !plan_id || !period_end_date) {
      return res.status(400).json({ error: 'Faltan campos requeridos: full_name, email, password, plan_id, period_end_date' });
    }

    // Verificar si el email ya existe
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }

    // Hash de la contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insertar usuario
    const [userResult] = await pool.query(
      'INSERT INTO users (full_name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?)',
      [full_name, email, hashedPassword, 'user', true]
    );
    const userId = userResult.insertId;

    // Obtener datos del plan
    const [plans] = await pool.query('SELECT * FROM subscription_plans WHERE id = ?', [plan_id]);
    if (plans.length === 0) {
      // Si el plan no existe, eliminar el usuario creado
      await pool.query('DELETE FROM users WHERE id = ?', [userId]);
      return res.status(400).json({ error: 'Plan no encontrado' });
    }
    const plan = plans[0];

    // Calcular periodo
    const periodStart = formatDate(new Date());
    const periodEnd = period_end_date;

    // Crear suscripción
    const [subResult] = await pool.query(
      `INSERT INTO subscriptions 
       (user_id, plan_id, payment_method_id, status, current_period_start, current_period_end, cancel_at_period_end)
       VALUES (?, ?, NULL, 'active', ?, ?, FALSE)`,
      [userId, plan_id, periodStart, periodEnd]
    );
    const subscriptionId = subResult.insertId;

    // Crear customer en Stripe
    const customer = await stripe.customers.create({ email, name: full_name });
    await pool.query('UPDATE users SET stripe_customer_id = ? WHERE id = ?', [customer.id, userId]);

    // Crear sesión de checkout en modo setup
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'setup',
      customer: customer.id,
      success_url: process.env.SUCCESS_URL || 'https://tudominio.com/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: process.env.CANCEL_URL || 'https://tudominio.com/cancel',
    });

    // Enviar correo con el link de registro de tarjeta
    try {
      await emailService.sendPaymentSetupEmail(email, full_name, plan.name, plan.price, periodEnd, session.url);
      console.log(`✅ Correo enviado a ${email}`);
    } catch (emailError) {
      console.error('⚠️ Error enviando correo:', emailError.message);
      // No detenemos el flujo, el usuario ya está creado
    }

    res.status(201).json({
      message: 'Usuario creado exitosamente',
      userId,
      subscriptionId,
      checkoutUrl: session.url
    });

  } catch (error) {
    console.error('❌ Error en createUser:', error);
    res.status(500).json({ error: 'Error al crear usuario: ' + error.message });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const [users] = await pool.query(`
      SELECT 
        u.id, u.full_name, u.email, u.role, u.is_active, u.stripe_customer_id,
        s.id AS subscription_id, s.status AS sub_status,
        sp.name AS plan_name, sp.price, sp.billing_interval AS billing_interval,
        s.current_period_start, s.current_period_end, s.cancel_at_period_end,
        pm.id AS payment_method_id, pm.card_brand, pm.card_last4
      FROM users u
      LEFT JOIN subscriptions s ON u.id = s.user_id
      LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
      LEFT JOIN payment_methods pm ON s.payment_method_id = pm.id
      WHERE u.role = 'user'
      ORDER BY u.created_at DESC
    `);
    res.json(users);
  } catch (error) {
    console.error('❌ Error en getUsers:', error);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { plan_id, period_end_date } = req.body;

    if (plan_id || period_end_date) {
      const updates = [];
      const values = [];

      if (plan_id) {
        updates.push('plan_id = ?');
        values.push(plan_id);
      }
      if (period_end_date) {
        updates.push('current_period_end = ?');
        values.push(period_end_date);
      }

      await pool.query(
        `UPDATE subscriptions SET ${updates.join(', ')} WHERE user_id = ?`,
        [...values, id]
      );
    }

    res.json({ message: 'Usuario actualizado exitosamente' });
  } catch (error) {
    console.error('❌ Error en updateUser:', error);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
};