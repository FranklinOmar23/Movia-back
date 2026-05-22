const pool = require('../db');

/**
 * Obtener todos los planes activos (público)
 */
exports.getActivePlans = async (req, res) => {
  try {
    const [plans] = await pool.query(
      `SELECT id, name, description, price, currency, billing_interval 
       FROM subscription_plans 
       WHERE is_active = TRUE 
       ORDER BY price ASC`
    );
    res.json(plans);
  } catch (error) {
    console.error('❌ Error en getActivePlans:', error);
    res.status(500).json({ error: 'Error al obtener planes' });
  }
};

/**
 * Obtener detalle de un plan específico (público)
 */
exports.getPlanById = async (req, res) => {
  try {
    const { id } = req.params;
    const [plans] = await pool.query(
      `SELECT id, name, description, price, currency, billing_interval 
       FROM subscription_plans 
       WHERE id = ? AND is_active = TRUE`,
      [id]
    );

    if (plans.length === 0) {
      return res.status(404).json({ error: 'Plan no encontrado' });
    }

    res.json(plans[0]);
  } catch (error) {
    console.error('❌ Error en getPlanById:', error);
    res.status(500).json({ error: 'Error al obtener plan' });
  }
};