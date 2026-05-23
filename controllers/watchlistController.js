const pool = require('../db');

/**
 * GET /api/watchlist
 * Obtener todos los items en "Ver más tarde"
 */
exports.getWatchlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM watchlist WHERE user_id = ?',
      [userId]
    );

    const [items] = await pool.query(`
      SELECT 
        id,
        tmdb_id,
        media_type,
        title,
        poster_path,
        added_at
      FROM watchlist
      WHERE user_id = ?
      ORDER BY added_at DESC
      LIMIT ? OFFSET ?
    `, [userId, limit, offset]);

    res.json({
      data: items,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('❌ Error en getWatchlist:', error);
    res.status(500).json({ error: 'Error al obtener watchlist' });
  }
};

/**
 * POST /api/watchlist
 * Agregar un item a "Ver más tarde"
 */
exports.addToWatchlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { tmdb_id, media_type, title = null, poster_path = null } = req.body;

    if (!tmdb_id || !media_type) {
      return res.status(400).json({ error: 'tmdb_id y media_type son requeridos' });
    }

    // Verificar si ya existe
    const [existing] = await pool.query(
      'SELECT id FROM watchlist WHERE user_id = ? AND tmdb_id = ? AND media_type = ?',
      [userId, tmdb_id, media_type]
    );

    if (existing.length > 0) {
      return res.status(409).json({ 
        error: 'Ya está en tu watchlist',
        inWatchlist: true 
      });
    }

    // Insertar
    const [result] = await pool.query(
      `INSERT INTO watchlist (user_id, tmdb_id, media_type, title, poster_path)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, tmdb_id, media_type, title, poster_path]
    );

    res.status(201).json({
      message: 'Agregado a "Ver más tarde"',
      id: result.insertId,
      tmdb_id,
      media_type,
      title,
      poster_path,
      inWatchlist: true
    });
  } catch (error) {
    console.error('❌ Error en addToWatchlist:', error);
    res.status(500).json({ error: 'Error al agregar a watchlist' });
  }
};

/**
 * DELETE /api/watchlist/:mediaType/:tmdbId
 * Quitar un item de "Ver más tarde"
 */
exports.removeFromWatchlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { mediaType, tmdbId } = req.params;

    const [result] = await pool.query(
      'DELETE FROM watchlist WHERE user_id = ? AND tmdb_id = ? AND media_type = ?',
      [userId, tmdbId, mediaType]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'No encontrado en watchlist' });
    }

    res.json({ 
      message: 'Eliminado de "Ver más tarde"',
      tmdb_id: parseInt(tmdbId),
      media_type: mediaType,
      inWatchlist: false
    });
  } catch (error) {
    console.error('❌ Error en removeFromWatchlist:', error);
    res.status(500).json({ error: 'Error al eliminar de watchlist' });
  }
};

/**
 * GET /api/watchlist/check/:mediaType/:tmdbId
 * Verificar si un item está en la watchlist
 */
exports.checkWatchlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { mediaType, tmdbId } = req.params;

    const [rows] = await pool.query(
      'SELECT id, title, poster_path, added_at FROM watchlist WHERE user_id = ? AND tmdb_id = ? AND media_type = ?',
      [userId, tmdbId, mediaType]
    );

    if (rows.length > 0) {
      return res.json({
        inWatchlist: true,
        item: rows[0]
      });
    }

    res.json({ inWatchlist: false });
  } catch (error) {
    console.error('❌ Error en checkWatchlist:', error);
    res.status(500).json({ error: 'Error al verificar watchlist' });
  }
};