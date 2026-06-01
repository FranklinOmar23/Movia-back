const pool = require('../db');

/**
 * Obtener el código de referido del usuario autenticado
 * GET /api/referrals/my-code
 */
exports.getMyReferralCode = async (req, res) => {
  try {
    const userId = req.user.id;
    const [users] = await pool.query(
      'SELECT referral_code FROM users WHERE id = ?',
      [userId]
    );
    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json({ referral_code: users[0].referral_code });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener código de referido' });
  }
};

/**
 * Obtener estadísticas de referidos del usuario autenticado
 * GET /api/referrals/my-stats
 */
exports.getMyReferralStats = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Total de usuarios referidos (distintos)
    const [referredCount] = await pool.query(
      `SELECT COUNT(*) AS total_referred 
       FROM users 
       WHERE referred_by = ?`,
      [userId]
    );
    
    // Ganancias totales pendientes y pagadas
    const [earnings] = await pool.query(
      `SELECT 
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_earned ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_earned ELSE 0 END), 0) AS paid
       FROM referral_earnings 
       WHERE referrer_id = ?`,
      [userId]
    );
    
    // Lista de usuarios referidos con detalles de suscripción
    const [referredUsers] = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.created_at AS registered_at,
              s.status AS subscription_status,
              e.amount_earned, e.status AS commission_status, e.created_at AS commission_date
       FROM users u
       LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
       LEFT JOIN referral_earnings e ON e.referred_user_id = u.id AND e.referrer_id = ?
       WHERE u.referred_by = ?
       ORDER BY u.created_at DESC`,
      [userId, userId]
    );
    
    res.json({
      total_referred: referredCount[0].total_referred,
      earnings: {
        pending: parseFloat(earnings[0].pending),
        paid: parseFloat(earnings[0].paid)
      },
      referred_users: referredUsers
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener estadísticas de referidos' });
  }
};

/**
 * (Solo admin) Obtener reporte completo de referidos con totales por referente
 * GET /api/referrals/admin/report
 */
exports.getAdminReferralReport = async (req, res) => {
  try {
    // Totales por referente
    const [report] = await pool.query(
      `SELECT 
         u.id AS referrer_id,
         u.full_name AS referrer_name,
         u.email AS referrer_email,
         u.referral_code,
         COUNT(DISTINCT r.id) AS total_referred,
         COALESCE(SUM(e.amount_earned), 0) AS total_earned,
         COALESCE(SUM(CASE WHEN e.status = 'pending' THEN e.amount_earned ELSE 0 END), 0) AS pending_payment,
         COALESCE(SUM(CASE WHEN e.status = 'paid' THEN e.amount_earned ELSE 0 END), 0) AS already_paid
       FROM users u
       LEFT JOIN users r ON r.referred_by = u.id
       LEFT JOIN referral_earnings e ON e.referrer_id = u.id
       WHERE u.role = 'user' -- solo usuarios normales (no admins)
       GROUP BY u.id
       HAVING total_referred > 0 OR total_earned > 0
       ORDER BY total_earned DESC`
    );
    
    // Detalle de cada comisión
    const [details] = await pool.query(
      `SELECT 
         e.id,
         u_ref.full_name AS referrer,
         u_ref.email AS referrer_email,
         u_ref.referral_code,
         u_refd.full_name AS referred_user,
         u_refd.email AS referred_email,
         e.amount_earned,
         e.status,
         e.created_at,
         e.paid_at,
         sp.name AS plan_name
       FROM referral_earnings e
       JOIN users u_ref ON e.referrer_id = u_ref.id
       JOIN users u_refd ON e.referred_user_id = u_refd.id
       JOIN subscriptions s ON e.subscription_id = s.id
       JOIN subscription_plans sp ON s.plan_id = sp.id
       ORDER BY e.created_at DESC`
    );
    
    res.json({ report, details });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener reporte de referidos' });
  }
};

/**
 * (Admin) Marcar comisiones como pagadas
 * POST /api/referrals/admin/mark-paid
 * Body: { earning_ids: [1,2,3] }
 */
exports.markCommissionsAsPaid = async (req, res) => {
  try {
    const { earning_ids } = req.body;
    if (!earning_ids || !Array.isArray(earning_ids) || earning_ids.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de IDs de comisiones' });
    }
    
    const placeholders = earning_ids.map(() => '?').join(',');
    await pool.query(
      `UPDATE referral_earnings 
       SET status = 'paid', paid_at = NOW() 
       WHERE id IN (${placeholders}) AND status = 'pending'`,
      earning_ids
    );
    
    res.json({ message: 'Comisiones marcadas como pagadas' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar comisiones' });
  }
};