const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const emailService = require('../services/emailService');

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
      return res.status(403).json({ error: 'Cuenta desactivada' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

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

/**
 * Registrar un nuevo usuario (SOLO REGISTRO, sin pago)
 * POST /api/auth/register
 */
exports.register = async (req, res) => {
  try {
    const { full_name, email, password, role = 'user' } = req.body;
    
    // Validaciones...
    if (!full_name || !email || !password) {
      return res.status(400).json({ 
        error: 'Nombre completo, email y contraseña son requeridos' 
      });
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Formato de email inválido' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    
    if (full_name.trim().length < 3) {
      return res.status(400).json({ error: 'El nombre debe tener al menos 3 caracteres' });
    }
    
    // Verificar si el usuario ya existe
    const [existingUsers] = await pool.query(
      'SELECT id, email FROM users WHERE email = ?',
      [email.toLowerCase()]
    );
    
    if (existingUsers.length > 0) {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }
    
    // Encriptar contraseña
    const password_hash = await bcrypt.hash(password, 10);
    
    // Insertar nuevo usuario
    const [result] = await pool.query(
      `INSERT INTO users 
       (full_name, email, password_hash, role, is_active, created_at, updated_at) 
       VALUES (?, ?, ?, ?, 1, NOW(), NOW())`,
      [full_name.trim(), email.toLowerCase(), password_hash, role]
    );
    
    // Obtener el usuario creado
    const [newUser] = await pool.query(
      'SELECT id, full_name, email, role, is_active, created_at FROM users WHERE id = ?',
      [result.insertId]
    );
    
    // Generar token JWT
    const token = jwt.sign(
      { id: newUser[0].id, email: newUser[0].email, role: newUser[0].role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Enviar correo de bienvenida
    try {
      await emailService.sendWelcomeEmail(newUser[0].email, newUser[0].full_name);
      console.log(`📧 Bienvenida enviada a ${newUser[0].email}`);
    } catch (emailError) {
      console.error('❌ Error en email de bienvenida:', emailError.message);
    }
    
    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente. Ahora selecciona un plan de suscripción.',
      token,
      user: {
        id: newUser[0].id,
        full_name: newUser[0].full_name,
        email: newUser[0].email,
        role: newUser[0].role,
        is_active: newUser[0].is_active
      }
    });
    
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error del servidor al registrar usuario' });
  }
};