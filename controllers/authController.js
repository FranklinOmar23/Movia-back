const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const emailService = require('../services/emailService');

const getRequestIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || 'unknown';
};

const logLoginEvent = async ({ userId, email, ipAddress, success, reason }) => {
  try {
    await pool.query(
      `INSERT INTO login_logs (user_id, email, ip_address, success, reason, login_date, login_time, created_at)
       VALUES (?, ?, ?, ?, ?, CURDATE(), CURTIME(), NOW())`,
      [userId || null, email, ipAddress, success ? 1 : 0, reason || null]
    );
  } catch (error) {
    console.error('❌ Error registrando login_logs:', error);
  }
};

const logLogoutEvent = async ({ userId, email, ipAddress, reason }) => {
  try {
    await pool.query(
      `INSERT INTO logout_logs (user_id, email, ip_address, reason, logout_date, logout_time, created_at)
       VALUES (?, ?, ?, ?, CURDATE(), CURTIME(), NOW())`,
      [userId || null, email, ipAddress, reason || null]
    );
  } catch (error) {
    console.error('❌ Error registrando logout_logs:', error);
  }
};

const upsertUserStatus = async ({ userId, isOnline }) => {
  try {
    await pool.query(
      `INSERT INTO user_status (user_id, is_online, last_seen, last_login_at, last_logout_at)
       VALUES (?, ?, NOW(), CASE WHEN ? = 1 THEN NOW() ELSE NULL END, CASE WHEN ? = 0 THEN NOW() ELSE NULL END)
       ON DUPLICATE KEY UPDATE
         is_online = VALUES(is_online),
         last_seen = NOW(),
         last_login_at = CASE WHEN VALUES(is_online) = 1 THEN NOW() ELSE last_login_at END,
         last_logout_at = CASE WHEN VALUES(is_online) = 0 THEN NOW() ELSE last_logout_at END`,
      [userId, isOnline ? 1 : 0, isOnline ? 1 : 0, isOnline ? 0 : 1]
    );
  } catch (error) {
    console.error('❌ Error actualizando user_status:', error);
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }

    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    if (!user.is_active) {
      await logLoginEvent({ userId: user.id, email: user.email, ipAddress: getRequestIp(req), success: false, reason: 'Cuenta desactivada' });
      return res.status(403).json({ error: 'Cuenta desactivada' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    await Promise.all([
      logLoginEvent({ userId: user.id, email: user.email, ipAddress: getRequestIp(req), success: true }),
      upsertUserStatus({ userId: user.id, isOnline: true })
    ]);

    res.json({ 
      token, 
      user: { 
        id: user.id, 
        email: user.email, 
        full_name: user.full_name, 
        role: user.role 
      } 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id; // viene del middleware auth
    const { full_name, email, current_password, new_password } = req.body;

    // Obtener usuario actual
    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    const user = users[0];

    const updates = [];
    const values  = [];

    if (full_name !== undefined) {
      if (full_name.trim().length < 3) {
        return res.status(400).json({ error: 'El nombre debe tener al menos 3 caracteres' });
      }
      updates.push('full_name = ?');
      values.push(full_name.trim());
    }

    if (email !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Formato de email inválido' });
      }
      // Verificar que el email no esté en uso por otro usuario
      const [emailCheck] = await pool.query(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email.toLowerCase(), userId]
      );
      if (emailCheck.length > 0) {
        return res.status(409).json({ error: 'El email ya está en uso' });
      }
      updates.push('email = ?');
      values.push(email.toLowerCase());
    }

    // Cambio de contraseña: requiere la contraseña actual
    if (new_password !== undefined) {
      if (!current_password) {
        return res.status(400).json({ error: 'Debes proporcionar tu contraseña actual' });
      }
      const validPassword = await bcrypt.compare(current_password, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'La contraseña actual es incorrecta' });
      }
      if (new_password.length < 6) {
        return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
      }
      const password_hash = await bcrypt.hash(new_password, 10);
      updates.push('password_hash = ?');
      values.push(password_hash);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No se proporcionaron campos para actualizar' });
    }

    updates.push('updated_at = NOW()');
    values.push(userId);

    await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    // Devolver usuario actualizado (sin password_hash)
    const [updatedUser] = await pool.query(
      'SELECT id, full_name, email, role, is_active, created_at, updated_at FROM users WHERE id = ?',
      [userId]
    );

    res.json({
      success: true,
      message: 'Perfil actualizado exitosamente',
      user: updatedUser[0]
    });

  } catch (error) {
    console.error('Error en updateProfile:', error);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
};

exports.getMe = async (req, res) => {
  try {
    const userId = req.user.id;

    // Obtener datos del usuario
    const [users] = await pool.query(
      `SELECT id, full_name, email, role, is_active, avatar_url, created_at, updated_at
       FROM users WHERE id = ?`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const user = users[0];

    // Obtener el estado de la suscripción activa más reciente
    const [subs] = await pool.query(
      `SELECT status FROM subscriptions 
       WHERE user_id = ? AND status = 'active' 
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    user.subscription_status = subs.length > 0 ? subs[0].status : null;

    const [statusRows] = await pool.query(
      'SELECT is_online, last_login_at, last_logout_at, last_seen FROM user_status WHERE user_id = ?',
      [userId]
    );
    user.active_status = statusRows[0] || { is_online: false, last_login_at: null, last_logout_at: null, last_seen: null };

    res.json({ user });
  } catch (error) {
    console.error('Error en getMe:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

exports.logout = async (req, res) => {
  try {
    const userId = req.user.id;
    const email = req.user.email;
    const ipAddress = getRequestIp(req);
    const reason = req.body.reason || 'logout';

    await Promise.all([
      logLogoutEvent({ userId, email, ipAddress, reason }),
      upsertUserStatus({ userId, isOnline: false })
    ]);

    res.json({ message: 'Logout registrado correctamente' });
  } catch (error) {
    console.error('Error en logout:', error);
    res.status(500).json({ error: 'Error al cerrar sesión' });
  }
};

exports.getStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await pool.query(
      'SELECT is_online, last_login_at, last_logout_at, last_seen FROM user_status WHERE user_id = ?',
      [userId]
    );
    res.json({ user_id: userId, status: rows[0] || { is_online: false, last_login_at: null, last_logout_at: null, last_seen: null } });
  } catch (error) {
    console.error('Error en getStatus:', error);
    res.status(500).json({ error: 'Error al obtener estado del usuario' });
  }
};

/**
 * Registrar un nuevo usuario (SOLO REGISTRO, sin pago)
 * POST /api/auth/register
 */
// En authController.js - método register
exports.register = async (req, res) => {
  try {
    const { full_name, email, password, role = 'user', referral_code } = req.body;
    
    // Validaciones...
    if (!full_name || !email || !password) {
      return res.status(400).json({ 
        error: 'Nombre completo, email y contraseña son requeridos' 
      });
    }
    
    // ... (validaciones de formato existentes)

    // Verificar si el código de referido existe (si se proporcionó)
    let referrerId = null;
    if (referral_code) {
      const [referrers] = await pool.query(
        'SELECT id FROM users WHERE referral_code = ?',
        [referral_code.trim()]
      );
      if (referrers.length > 0) {
        referrerId = referrers[0].id;
        // Opcional: evitar que un usuario se refiera a sí mismo
        // No podemos verificar porque el usuario aún no tiene id, pero en el registro nuevo no hay problema.
        // Si quieres evitarlo, deberías hacerlo después de insertar, pero es más sencillo permitirlo? No, mejor prevenir.
        // Lo dejamos así, pero si el referrer es el mismo email no se puede porque el email es único.
      }
      // Si el código no existe, simplemente se ignora (no se guarda referido)
    }
    
    // Encriptar contraseña
    const password_hash = await bcrypt.hash(password, 10);
    
    // Insertar nuevo usuario, incluyendo referred_by
    const [result] = await pool.query(
      `INSERT INTO users 
       (full_name, email, password_hash, role, is_active, referred_by, created_at, updated_at) 
       VALUES (?, ?, ?, ?, 0, ?, NOW(), NOW())`,
      [full_name.trim(), email.toLowerCase(), password_hash, role, referrerId]
    );
    
    const newUserId = result.insertId;
    
    // Generar código de referido único para este nuevo usuario (puede ser hash corto o 'REF' + id)
    const newReferralCode = `REF${newUserId}`; // Simple, o algo más aleatorio
    await pool.query(
      'UPDATE users SET referral_code = ? WHERE id = ?',
      [newReferralCode, newUserId]
    );
    
    // Obtener el usuario creado
    const [newUser] = await pool.query(
      'SELECT id, full_name, email, role, is_active, created_at, referral_code FROM users WHERE id = ?',
      [newUserId]
    );
    
    // Crear grupo "Me gusta" automáticamente
    try {
      await pool.query(
        `INSERT INTO watch_groups (user_id, name, description, is_public, created_at, updated_at)
         VALUES (?, 'Me gusta', 'Grupo de películas y series favoritas', 1, NOW(), NOW())`,
        [result.insertId]
      );
    } catch (groupError) {
      console.error('❌ Error al crear grupo "Me gusta" automáticamente:', groupError);
      // No bloqueamos el registro si falla la creación del grupo
    }
    
    // Generar token JWT
    const token = jwt.sign(
      { id: newUser[0].id, email: newUser[0].email, role: newUser[0].role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente. Ahora selecciona un plan de suscripción.',
      token,
      user: newUser[0]
    });
    
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error del servidor al registrar usuario' });
  }
};