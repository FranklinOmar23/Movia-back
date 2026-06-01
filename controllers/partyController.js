const pool = require('../db');
const crypto = require('crypto');

// Genera código único de 8 chars
const generateCode = () => crypto.randomBytes(4).toString('hex').toUpperCase();

// ── Crear sala ────────────────────────────────────────────────────────────────
exports.createParty = async (req, res) => {
  try {
    const hostId = req.user?.id;
    if (!hostId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const { tmdb_id, media_type, title, poster_path, season = 0, episode = 0, is_public = false } = req.body;

    if (!tmdb_id || !media_type) {
      return res.status(400).json({ error: 'tmdb_id y media_type son requeridos' });
    }

    let code;
    let attempts = 0;
    let unique = false;
    while (attempts < 5 && !unique) {
      code = generateCode();
      const [existing] = await pool.query('SELECT id FROM watch_parties WHERE code = ?', [code]);
      if (existing.length === 0) unique = true;
      attempts++;
    }
    if (!unique) {
      return res.status(500).json({ error: 'No se pudo generar un código único para la sala' });
    }

    // Insertar la sala (status tomará el valor por defecto 'waiting' de la tabla)
    const [result] = await pool.query(
      `INSERT INTO watch_parties
       (code, host_user_id, tmdb_id, media_type, title, poster_path, season, episode, is_public, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [code, hostId, tmdb_id, media_type, title || null, poster_path || null, season, episode, is_public ? 1 : 0]
    );

    // Agregar al host como miembro
    await pool.query(
      `INSERT INTO party_members (party_id, user_id, role, joined_at)
       VALUES (?, ?, 'host', NOW())`,
      [result.insertId, hostId]
    );

    const inviteUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/party/${code}`;
    res.status(201).json({ party_id: result.insertId, code, invite_url: inviteUrl });
  } catch (error) {
    console.error('❌ Error en createParty:', error);
    // ✅ Devuelve el mensaje real del error
    res.status(500).json({ error: error.message });
  }
};

// ── Obtener sala por código ───────────────────────────────────────────────────
exports.getPartyByCode = async (req, res) => {
  try {
    const { code } = req.params;

    const [parties] = await pool.query(
      `SELECT p.*, u.full_name AS host_name
       FROM watch_parties p
       JOIN users u ON u.id = p.host_user_id
       WHERE p.code = ? AND p.status != 'ended'`,
      [code]
    );

    if (parties.length === 0) {
      return res.status(404).json({ error: 'Sala no encontrada o ya terminó' });
    }

    const party = parties[0];

    const [members] = await pool.query(
      `SELECT pm.user_id, pm.role, u.full_name
       FROM party_members pm
       JOIN users u ON u.id = pm.user_id
       WHERE pm.party_id = ? AND pm.left_at IS NULL`,
      [party.id]
    );

    res.json({ party, members });
  } catch (error) {
    console.error('❌ Error en getPartyByCode:', error);
    res.status(500).json({ error: error.message });
  }
};

// ── Unirse a sala ─────────────────────────────────────────────────────────────
exports.joinParty = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const { code } = req.params;

    const [parties] = await pool.query(
      `SELECT * FROM watch_parties WHERE code = ? AND status != 'ended'`,
      [code]
    );

    if (parties.length === 0) {
      return res.status(404).json({ error: 'Sala no encontrada o ya terminó' });
    }

    const party = parties[0];

    // Evitar duplicados: si ya existe un registro activo (left_at IS NULL), no insertar de nuevo
    const [existing] = await pool.query(
      `SELECT id FROM party_members WHERE party_id = ? AND user_id = ? AND left_at IS NULL`,
      [party.id, userId]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Ya eres miembro de esta sala' });
    }

    // Insertar o reactivar un miembro que se había ido
    await pool.query(
      `INSERT INTO party_members (party_id, user_id, role, joined_at)
       VALUES (?, ?, 'guest', NOW())
       ON DUPLICATE KEY UPDATE left_at = NULL, joined_at = NOW()`,
      [party.id, userId]
    );

    res.json({ party_id: party.id, code: party.code, message: 'Unido a la sala' });
  } catch (error) {
    console.error('❌ Error en joinParty:', error);
    res.status(500).json({ error: error.message });
  }
};

// ── Terminar sala (solo host) ─────────────────────────────────────────────────
exports.endParty = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const { code } = req.params;

    const [parties] = await pool.query(
      `SELECT * FROM watch_parties WHERE code = ? AND host_user_id = ?`,
      [code, userId]
    );

    if (parties.length === 0) {
      return res.status(403).json({ error: 'No tienes permiso para terminar esta sala' });
    }

    await pool.query(
      `UPDATE watch_parties SET status = 'ended', ended_at = NOW() WHERE code = ?`,
      [code]
    );

    res.json({ message: 'Sala terminada' });
  } catch (error) {
    console.error('❌ Error en endParty:', error);
    res.status(500).json({ error: error.message });
  }
};

// ── Mis salas activas ─────────────────────────────────────────────────────────
exports.getMyParties = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const [parties] = await pool.query(
      `SELECT p.*, u.full_name AS host_name,
              COUNT(DISTINCT pm2.user_id) AS member_count
       FROM watch_parties p
       JOIN users u ON u.id = p.host_user_id
       JOIN party_members pm ON pm.party_id = p.id AND pm.user_id = ?
       LEFT JOIN party_members pm2 ON pm2.party_id = p.id AND pm2.left_at IS NULL
       WHERE p.status != 'ended'
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [userId]
    );

    res.json({ data: parties });
  } catch (error) {
    console.error('❌ Error en getMyParties:', error);
    res.status(500).json({ error: error.message });
  }
};