const bcrypt = require('bcryptjs');
const pool = require('../db');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const emailService = require('../services/emailService');
const { formatDate } = require('../utils/helpers');

// ──────────────────── DASHBOARD STATS ────────────────────
exports.getStats = async (req, res) => {
  try {
    const [[{ totalUsers }]]          = await pool.query('SELECT COUNT(*) AS totalUsers FROM users WHERE role = "user"');
    const [[{ activeUsers }]]         = await pool.query('SELECT COUNT(*) AS activeUsers FROM users WHERE role = "user" AND is_active = TRUE');
    const [[{ activeSubscriptions }]] = await pool.query('SELECT COUNT(*) AS activeSubscriptions FROM subscriptions WHERE status = "active"');
    const [[{ pendingPayments }]]     = await pool.query('SELECT COUNT(*) AS pendingPayments FROM payment_transactions WHERE status = "pending"');
    const [[{ failedPayments }]]      = await pool.query('SELECT COUNT(*) AS failedPayments FROM payment_transactions WHERE status = "failed"');

    const [[{ mrr }]] = await pool.query(`
      SELECT COALESCE(SUM(
        CASE
          WHEN sp.billing_interval = 'biweekly' THEN sp.price * 2.17
          WHEN sp.billing_interval = 'monthly'  THEN sp.price
          WHEN sp.billing_interval = 'yearly'   THEN sp.price / 12
          ELSE sp.price
        END
      ), 0) AS mrr
      FROM subscriptions s
      JOIN subscription_plans sp ON s.plan_id = sp.id
      WHERE s.status = 'active'
    `);

    // MRR últimos 6 meses
    const [mrrRows] = await pool.query(`
      SELECT
        DATE_FORMAT(pt.created_at, '%b') AS label,
        MONTH(pt.created_at)             AS month_num,
        YEAR(pt.created_at)              AS year_num,
        COALESCE(SUM(pt.amount), 0)      AS value
      FROM payment_transactions pt
      WHERE pt.status = 'succeeded'
        AND pt.created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY year_num, month_num, label
      ORDER BY year_num ASC, month_num ASC
    `);

    // Registros de usuarios últimos 6 meses
    const [regRows] = await pool.query(`
      SELECT
        DATE_FORMAT(created_at, '%b') AS label,
        MONTH(created_at)             AS month_num,
        YEAR(created_at)              AS year_num,
        COUNT(*)                      AS count
      FROM users
      WHERE role = 'user'
        AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY year_num, month_num, label
      ORDER BY year_num ASC, month_num ASC
    `);

    // Distribución de suscripciones por estado
    const [distRows] = await pool.query(`
      SELECT
        CASE status
          WHEN 'active'    THEN 'Activas'
          WHEN 'past_due'  THEN 'Vencidas'
          WHEN 'cancelled' THEN 'Canceladas'
          WHEN 'expired'   THEN 'Expiradas'
          ELSE status
        END AS label,
        COUNT(*) AS value
      FROM subscriptions
      GROUP BY status
    `);

    res.json({
      totalUsers,
      activeUsers,
      activeSubscriptions,
      mrr: parseFloat(mrr),
      pendingPayments,
      failedPayments,
      mrrHistory:               mrrRows.map(r => ({ label: r.label, value: parseFloat(r.value) })),
      userRegistrations:        regRows.map(r => ({ label: r.label, count: parseInt(r.count) })),
      subscriptionDistribution: distRows.map(r => ({ label: r.label, value: parseInt(r.value) })),
    });
  } catch (error) {
    console.error('❌ Error en getStats:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas: ' + error.message });
  }
};

// ──────────────────── STATS: USUARIOS ────────────────────
exports.getUserStats = async (req, res) => {
  try {
    const [regRows] = await pool.query(`
      SELECT
        DATE_FORMAT(created_at, '%b') AS label,
        MONTH(created_at)             AS month_num,
        YEAR(created_at)              AS year_num,
        COUNT(*)                      AS count
      FROM users
      WHERE role = 'user'
        AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY year_num, month_num, label
      ORDER BY year_num ASC, month_num ASC
    `);

    const [planRows] = await pool.query(`
      SELECT
        COALESCE(sp.name, 'Sin plan') AS label,
        COUNT(DISTINCT u.id)          AS value
      FROM users u
      LEFT JOIN subscriptions s       ON u.id = s.user_id AND s.status = 'active'
      LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
      WHERE u.role = 'user'
      GROUP BY sp.name
      ORDER BY value DESC
    `);

    res.json({
      registrations:    regRows.map(r  => ({ label: r.label, count: parseInt(r.count) })),
      planDistribution: planRows.map(r => ({ label: r.label, value: parseInt(r.value) })),
    });
  } catch (error) {
    console.error('❌ Error en getUserStats:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas de usuarios: ' + error.message });
  }
};

// ──────────────────── STATS: SUSCRIPCIONES ────────────────────
exports.getSubscriptionStats = async (req, res) => {
  try {
    const [distRows] = await pool.query(`
      SELECT
        CASE status
          WHEN 'active'    THEN 'Activas'
          WHEN 'past_due'  THEN 'Vencidas'
          WHEN 'cancelled' THEN 'Canceladas'
          WHEN 'expired'   THEN 'Expiradas'
          ELSE status
        END AS label,
        COUNT(*) AS value
      FROM subscriptions
      GROUP BY status
    `);

    const [activeRows] = await pool.query(`
      SELECT
        DATE_FORMAT(created_at, '%b') AS label,
        MONTH(created_at)             AS month_num,
        YEAR(created_at)              AS year_num,
        COUNT(*)                      AS active
      FROM subscriptions
      WHERE status = 'active'
        AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY year_num, month_num, label
      ORDER BY year_num ASC, month_num ASC
    `);

    const [cancelledRows] = await pool.query(`
      SELECT
        DATE_FORMAT(cancelled_at, '%b') AS label,
        MONTH(cancelled_at)             AS month_num,
        YEAR(cancelled_at)              AS year_num,
        COUNT(*)                        AS cancelled
      FROM subscriptions
      WHERE status = 'cancelled'
        AND cancelled_at IS NOT NULL
        AND cancelled_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY year_num, month_num, label
      ORDER BY year_num ASC, month_num ASC
    `);

    const monthMap = {};
    activeRows.forEach(r => {
      monthMap[r.label] = { label: r.label, active: parseInt(r.active), cancelled: 0 };
    });
    cancelledRows.forEach(r => {
      if (monthMap[r.label]) {
        monthMap[r.label].cancelled = parseInt(r.cancelled);
      } else {
        monthMap[r.label] = { label: r.label, active: 0, cancelled: parseInt(r.cancelled) };
      }
    });

    res.json({
      statusDistribution: distRows.map(r   => ({ label: r.label, value: parseInt(r.value) })),
      monthlyComparison:  Object.values(monthMap),
    });
  } catch (error) {
    console.error('❌ Error en getSubscriptionStats:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas de suscripciones: ' + error.message });
  }
};

// ──────────────────── STATS: TRANSACCIONES ────────────────────
exports.getTransactionStats = async (req, res) => {
  try {
    const [volRows] = await pool.query(`
      SELECT
        DATE_FORMAT(created_at, '%b') AS label,
        MONTH(created_at)             AS month_num,
        YEAR(created_at)              AS year_num,
        COUNT(*)                      AS count
      FROM payment_transactions
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY year_num, month_num, label
      ORDER BY year_num ASC, month_num ASC
    `);

    const [succRows] = await pool.query(`
      SELECT
        DATE_FORMAT(created_at, '%b') AS label,
        MONTH(created_at)             AS month_num,
        YEAR(created_at)              AS year_num,
        COUNT(*)                      AS succeeded
      FROM payment_transactions
      WHERE status = 'succeeded'
        AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY year_num, month_num, label
      ORDER BY year_num ASC, month_num ASC
    `);

    const [failRows] = await pool.query(`
      SELECT
        DATE_FORMAT(created_at, '%b') AS label,
        MONTH(created_at)             AS month_num,
        YEAR(created_at)              AS year_num,
        COUNT(*)                      AS failed
      FROM payment_transactions
      WHERE status = 'failed'
        AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY year_num, month_num, label
      ORDER BY year_num ASC, month_num ASC
    `);

    const monthMap = {};
    succRows.forEach(r => {
      monthMap[r.label] = { label: r.label, succeeded: parseInt(r.succeeded), failed: 0 };
    });
    failRows.forEach(r => {
      if (monthMap[r.label]) {
        monthMap[r.label].failed = parseInt(r.failed);
      } else {
        monthMap[r.label] = { label: r.label, succeeded: 0, failed: parseInt(r.failed) };
      }
    });

    res.json({
      volumeHistory:  volRows.map(r => ({ label: r.label, count: parseInt(r.count) })),
      successFailure: Object.values(monthMap),
    });
  } catch (error) {
    console.error('❌ Error en getTransactionStats:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas de transacciones: ' + error.message });
  }
};

// ──────────────────── PLANES (ADMIN) ────────────────────
exports.getPlans = async (req, res) => {
  try {
    const [plans] = await pool.query('SELECT * FROM subscription_plans ORDER BY price ASC');
    res.json(plans);
  } catch (error) {
    console.error('❌ Error en getPlans:', error);
    res.status(500).json({ error: 'Error al obtener planes' });
  }
};

exports.createPlan = async (req, res) => {
  try {
    const { name, description, price, currency = 'USD', billing_interval = 'biweekly', is_active = true } = req.body;
    if (!name || !price) {
      return res.status(400).json({ error: 'Nombre y precio son requeridos' });
    }
    const [result] = await pool.query(
      'INSERT INTO subscription_plans (name, description, price, currency, billing_interval, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      [name, description, price, currency, billing_interval, is_active]
    );
    res.status(201).json({ message: 'Plan creado exitosamente', planId: result.insertId });
  } catch (error) {
    console.error('❌ Error en createPlan:', error);
    res.status(500).json({ error: 'Error al crear plan' });
  }
};

exports.updatePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, currency, billing_interval, is_active } = req.body;

    const [existing] = await pool.query('SELECT id FROM subscription_plans WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Plan no encontrado' });

    const updates = [];
    const values  = [];
    if (name             !== undefined) { updates.push('name = ?');             values.push(name); }
    if (description      !== undefined) { updates.push('description = ?');      values.push(description); }
    if (price            !== undefined) { updates.push('price = ?');            values.push(price); }
    if (currency         !== undefined) { updates.push('currency = ?');         values.push(currency); }
    if (billing_interval !== undefined) { updates.push('billing_interval = ?'); values.push(billing_interval); }
    if (is_active        !== undefined) { updates.push('is_active = ?');        values.push(is_active); }

    if (updates.length === 0) return res.status(400).json({ error: 'No se proporcionaron campos para actualizar' });

    values.push(id);
    await pool.query(`UPDATE subscription_plans SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ message: 'Plan actualizado exitosamente' });
  } catch (error) {
    console.error('❌ Error en updatePlan:', error);
    res.status(500).json({ error: 'Error al actualizar plan' });
  }
};

exports.deletePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.query('SELECT id FROM subscription_plans WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Plan no encontrado' });

    const [activeSubs] = await pool.query(
      'SELECT COUNT(*) AS count FROM subscriptions WHERE plan_id = ? AND status = "active"',
      [id]
    );
    if (activeSubs[0].count > 0) {
      return res.status(400).json({ error: 'No se puede eliminar, tiene suscripciones activas', activeSubscriptions: activeSubs[0].count });
    }

    await pool.query('DELETE FROM subscription_plans WHERE id = ?', [id]);
    res.json({ message: 'Plan eliminado exitosamente' });
  } catch (error) {
    console.error('❌ Error en deletePlan:', error);
    res.status(500).json({ error: 'Error al eliminar plan' });
  }
};

// ──────────────────── USUARIOS ────────────────────
exports.createUser = async (req, res) => {
  try {
    const { full_name, email, password, plan_id, period_end_date } = req.body;

    if (!full_name || !email || !password || !plan_id || !period_end_date) {
      return res.status(400).json({ error: 'Faltan campos: full_name, email, password, plan_id, period_end_date' });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) return res.status(400).json({ error: 'El email ya está registrado' });

    const salt           = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const [userResult] = await pool.query(
      'INSERT INTO users (full_name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?)',
      [full_name, email, hashedPassword, 'user', true]
    );
    const userId = userResult.insertId;

    const [plans] = await pool.query('SELECT * FROM subscription_plans WHERE id = ?', [plan_id]);
    if (plans.length === 0) {
      await pool.query('DELETE FROM users WHERE id = ?', [userId]);
      return res.status(400).json({ error: 'Plan no encontrado' });
    }
    const plan = plans[0];

    const periodStart = formatDate(new Date());
    const periodEnd   = period_end_date;

    await pool.query(
      `INSERT INTO subscriptions (user_id, plan_id, payment_method_id, status, current_period_start, current_period_end, cancel_at_period_end)
       VALUES (?, ?, NULL, 'active', ?, ?, FALSE)`,
      [userId, plan_id, periodStart, periodEnd]
    );

    const customer = await stripe.customers.create({ email, name: full_name });
    await pool.query('UPDATE users SET stripe_customer_id = ? WHERE id = ?', [customer.id, userId]);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode:         'setup',
      customer:     customer.id,
      success_url:  process.env.SUCCESS_URL || 'https://tudominio.com/success',
      cancel_url:   process.env.CANCEL_URL  || 'https://tudominio.com/cancel',
    });

    try {
      await emailService.sendPaymentSetupEmail(email, full_name, plan.name, plan.price, periodEnd, session.url);
    } catch (emailError) {
      console.error('⚠️ Error enviando correo:', emailError.message);
    }

    res.status(201).json({ message: 'Usuario creado exitosamente', userId, checkoutUrl: session.url });
  } catch (error) {
    console.error('❌ Error en createUser:', error);
    res.status(500).json({ error: 'Error al crear usuario: ' + error.message });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status, subscription_status } = req.query;
    const offset = (page - 1) * limit;
    let where    = "WHERE u.role = 'user'";
    const params = [];

    if (search)              { where += " AND (u.full_name LIKE ? OR u.email LIKE ?)"; params.push(`%${search}%`, `%${search}%`); }
    if (status === 'active') { where += " AND u.is_active = TRUE"; }
    else if (status === 'inactive') { where += " AND u.is_active = FALSE"; }
    if (subscription_status) { where += " AND s.status = ?"; params.push(subscription_status); }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM users u LEFT JOIN subscriptions s ON u.id = s.user_id ${where}`,
      params
    );

    const [users] = await pool.query(`
      SELECT u.id, u.full_name, u.email, u.role, u.is_active, u.stripe_customer_id, u.created_at,
             s.id AS subscription_id, s.status AS sub_status,
             sp.name AS plan_name, sp.price, sp.billing_interval AS plan_interval,
             s.current_period_start, s.current_period_end, s.cancel_at_period_end,
             pm.id AS payment_method_id, pm.card_brand, pm.card_last4
      FROM users u
      LEFT JOIN subscriptions s       ON u.id = s.user_id
      LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
      LEFT JOIN payment_methods pm    ON s.payment_method_id = pm.id
      ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), parseInt(offset)]);

    res.json({ data: users, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('❌ Error en getUsers:', error);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const [users] = await pool.query(`
      SELECT u.id, u.full_name, u.email, u.role, u.is_active, u.stripe_customer_id, u.created_at,
             s.id AS subscription_id, s.status AS sub_status,
             sp.name AS plan_name, sp.price, sp.billing_interval AS plan_interval,
             s.current_period_start, s.current_period_end, s.cancel_at_period_end,
             pm.id AS payment_method_id, pm.card_brand, pm.card_last4
      FROM users u
      LEFT JOIN subscriptions s       ON u.id = s.user_id
      LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
      LEFT JOIN payment_methods pm    ON s.payment_method_id = pm.id
      WHERE u.id = ?
    `, [id]);

    if (users.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    const [transactions] = await pool.query(
      'SELECT * FROM payment_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
      [id]
    );
    res.json({ ...users[0], transactions });
  } catch (error) {
    console.error('❌ Error en getUserById:', error);
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id }       = req.params;
    const { is_active } = req.body;
    if (typeof is_active !== 'undefined') {
      await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [is_active, id]);
      return res.json({ message: 'Usuario actualizado exitosamente' });
    }
    res.status(400).json({ error: 'No se proporcionaron campos para actualizar' });
  } catch (error) {
    console.error('❌ Error en updateUser:', error);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
};

// ──────────────────── SUSCRIPCIONES ────────────────────
exports.getSubscriptions = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    let where    = '';
    const params = [];
    if (status) { where = 'WHERE s.status = ?'; params.push(status); }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM subscriptions s ${where}`,
      params
    );

    const [subscriptions] = await pool.query(`
      SELECT s.id, s.user_id, s.plan_id, s.status,
             s.current_period_start, s.current_period_end,
             s.cancel_at_period_end, s.created_at,
             u.full_name, u.email,
             sp.name AS plan_name, sp.price, sp.billing_interval AS plan_interval,
             pm.card_brand, pm.card_last4
      FROM subscriptions s
      JOIN users u                ON s.user_id  = u.id
      JOIN subscription_plans sp  ON s.plan_id  = sp.id
      LEFT JOIN payment_methods pm ON s.payment_method_id = pm.id
      ${where} ORDER BY s.created_at DESC LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), parseInt(offset)]);

    res.json({ data: subscriptions, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('❌ Error en getSubscriptions:', error);
    res.status(500).json({ error: 'Error al obtener suscripciones' });
  }
};

exports.cancelSubscription = async (req, res) => {
  try {
    await pool.query(
      "UPDATE subscriptions SET status = 'cancelled', cancel_at_period_end = TRUE, cancelled_at = NOW() WHERE id = ?",
      [req.params.id]
    );
    res.json({ message: 'Suscripción cancelada exitosamente' });
  } catch (error) {
    console.error('❌ Error en cancelSubscription:', error);
    res.status(500).json({ error: 'Error al cancelar suscripción' });
  }
};

exports.reactivateSubscription = async (req, res) => {
  try {
    await pool.query(
      "UPDATE subscriptions SET status = 'active', cancel_at_period_end = FALSE, cancelled_at = NULL WHERE id = ?",
      [req.params.id]
    );
    res.json({ message: 'Suscripción reactivada exitosamente' });
  } catch (error) {
    console.error('❌ Error en reactivateSubscription:', error);
    res.status(500).json({ error: 'Error al reactivar suscripción' });
  }
};

// ──────────────────── TRANSACCIONES ────────────────────
exports.getTransactions = async (req, res) => {
  try {
    const { status, user_id, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    let where    = '';
    const params = [];
    if (status)  { where = 'WHERE pt.status = ?';    params.push(status); }
    if (user_id) { where = where ? where + ' AND pt.user_id = ?' : 'WHERE pt.user_id = ?'; params.push(user_id); }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM payment_transactions pt ${where}`,
      params
    );

    const [transactions] = await pool.query(`
      SELECT pt.*, u.full_name, u.email
      FROM payment_transactions pt
      JOIN users u ON pt.user_id = u.id
      ${where} ORDER BY pt.created_at DESC LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), parseInt(offset)]);

    res.json({ data: transactions, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('❌ Error en getTransactions:', error);
    res.status(500).json({ error: 'Error al obtener transacciones' });
  }
};

exports.retryTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const [transactions] = await pool.query('SELECT * FROM payment_transactions WHERE id = ?', [id]);
    if (transactions.length === 0) return res.status(404).json({ error: 'Transacción no encontrada' });

    const transaction = transactions[0];
    const [users] = await pool.query(`
      SELECT u.stripe_customer_id, pm.processor_token
      FROM users u
      JOIN payment_methods pm ON pm.user_id = u.id AND pm.is_default = TRUE
      WHERE u.id = ?
    `, [transaction.user_id]);

    if (users.length === 0 || !users[0].processor_token) {
      return res.status(400).json({ error: 'Usuario sin método de pago' });
    }

    const user          = users[0];
    const paymentIntent = await stripe.paymentIntents.create({
      amount:         Math.round(transaction.amount * 100),
      currency:       transaction.currency.toLowerCase(),
      customer:       user.stripe_customer_id,
      payment_method: user.processor_token,
      off_session:    true,
      confirm:        true,
    });

    await pool.query(
      'UPDATE payment_transactions SET status = ?, processor_transaction_id = ? WHERE id = ?',
      [paymentIntent.status, paymentIntent.id, id]
    );

    res.json({ message: 'Cobro reintentado', status: paymentIntent.status });
  } catch (error) {
    console.error('❌ Error en retryTransaction:', error);
    res.status(500).json({ error: 'Error al reintentar cobro: ' + error.message });
  }
};