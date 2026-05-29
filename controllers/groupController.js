const pool = require('../db');

const isFriend = async (currentUserId, friendId) => {
  const [rows] = await pool.query(
    `SELECT status
     FROM friend_requests
     WHERE ((requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?))
       AND status = 'accepted'`,
    [currentUserId, friendId, friendId, currentUserId]
  );
  return rows.length > 0;
};

const hasAccessToGroup = async (userId, groupId) => {
  const [rows] = await pool.query(
    `SELECT g.id
     FROM watch_groups g
     LEFT JOIN watch_group_shares s ON g.id = s.group_id
     WHERE g.id = ?
       AND (g.user_id = ? OR s.friend_id = ?)`,
    [groupId, userId, userId]
  );
  return rows.length > 0;
};

exports.createGroup = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description } = req.body;

    if (!name || name.trim().length < 3) {
      return res.status(400).json({ error: 'El nombre del grupo es requerido y debe tener al menos 3 caracteres' });
    }

    const [result] = await pool.query(
      `INSERT INTO watch_groups (user_id, name, description, created_at, updated_at)
       VALUES (?, ?, ?, NOW(), NOW())`,
      [userId, name.trim(), description || null]
    );

    res.status(201).json({ message: 'Grupo creado exitosamente', group_id: result.insertId });
  } catch (error) {
    console.error('❌ Error en createGroup:', error);
    res.status(500).json({ error: 'Error al crear grupo' });
  }
};

exports.getMyGroups = async (req, res) => {
  try {
    const userId = req.user.id;
    const [groups] = await pool.query(
      `SELECT id, name, description, is_public, created_at, updated_at
       FROM watch_groups
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json({ data: groups });
  } catch (error) {
    console.error('❌ Error en getMyGroups:', error);
    res.status(500).json({ error: 'Error al obtener grupos' });
  }
};

exports.getSharedWithMe = async (req, res) => {
  try {
    const userId = req.user.id;

    const [groups] = await pool.query(
      `SELECT g.id, g.name, g.description, g.is_public, g.created_at, g.updated_at,
              u.id AS owner_id, u.full_name AS owner_name, s.can_edit
       FROM watch_group_shares s
       JOIN watch_groups g ON g.id = s.group_id
       JOIN users u ON u.id = g.user_id
       WHERE s.friend_id = ?
       ORDER BY s.created_at DESC`,
      [userId]
    );

    res.json({ data: groups });
  } catch (error) {
    console.error('❌ Error en getSharedWithMe:', error);
    res.status(500).json({ error: 'Error al obtener grupos compartidos contigo' });
  }
};

exports.getGroupById = async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = parseInt(req.params.groupId, 10);

    if (Number.isNaN(groupId)) {
      return res.status(400).json({ error: 'groupId inválido' });
    }

    const allowed = await hasAccessToGroup(userId, groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'No tienes acceso a este grupo' });
    }

    const [groups] = await pool.query(
      `SELECT id, user_id, name, description, is_public, created_at, updated_at
       FROM watch_groups
       WHERE id = ?`,
      [groupId]
    );

    if (groups.length === 0) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    const [items] = await pool.query(
      `SELECT id, tmdb_id, media_type, title, poster_path, added_at
       FROM watch_group_items
       WHERE group_id = ?
       ORDER BY added_at DESC`,
      [groupId]
    );

    const [shares] = await pool.query(
      `SELECT friend_id, can_edit, created_at
       FROM watch_group_shares
       WHERE group_id = ?`,
      [groupId]
    );

    res.json({ group: groups[0], items, shares });
  } catch (error) {
    console.error('❌ Error en getGroupById:', error);
    res.status(500).json({ error: 'Error al obtener grupo' });
  }
};

exports.addItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = parseInt(req.params.groupId, 10);
    const { tmdb_id, media_type, title, poster_path } = req.body;

    if (Number.isNaN(groupId)) {
      return res.status(400).json({ error: 'groupId inválido' });
    }
    if (!tmdb_id || !media_type) {
      return res.status(400).json({ error: 'tmdb_id y media_type son requeridos' });
    }

    const [groups] = await pool.query('SELECT user_id FROM watch_groups WHERE id = ?', [groupId]);
    if (groups.length === 0) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    if (groups[0].user_id !== userId) {
      return res.status(403).json({ error: 'Solo el creador del grupo puede añadir items' });
    }

    const [existing] = await pool.query(
      `SELECT id FROM watch_group_items WHERE group_id = ? AND tmdb_id = ? AND media_type = ?`,
      [groupId, tmdb_id, media_type]
    );

    if (existing.length > 0) {
      return res.status(409).json({ error: 'Este item ya existe en el grupo' });
    }

    const [result] = await pool.query(
      `INSERT INTO watch_group_items
       (group_id, tmdb_id, media_type, title, poster_path, added_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [groupId, tmdb_id, media_type, title || null, poster_path || null]
    );

    res.status(201).json({ message: 'Item agregado al grupo', item_id: result.insertId });
  } catch (error) {
    console.error('❌ Error en addItem:', error);
    res.status(500).json({ error: 'Error al agregar item al grupo' });
  }
};

exports.removeItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = parseInt(req.params.groupId, 10);
    const itemId = parseInt(req.params.itemId, 10);

    if (Number.isNaN(groupId) || Number.isNaN(itemId)) {
      return res.status(400).json({ error: 'groupId o itemId inválido' });
    }

    const [groups] = await pool.query('SELECT user_id FROM watch_groups WHERE id = ?', [groupId]);
    if (groups.length === 0) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    if (groups[0].user_id !== userId) {
      return res.status(403).json({ error: 'Solo el creador del grupo puede eliminar items' });
    }

    const [result] = await pool.query(
      'DELETE FROM watch_group_items WHERE id = ? AND group_id = ?',
      [itemId, groupId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Item no encontrado en el grupo' });
    }

    res.json({ message: 'Item eliminado del grupo' });
  } catch (error) {
    console.error('❌ Error en removeItem:', error);
    res.status(500).json({ error: 'Error al eliminar item del grupo' });
  }
};

exports.shareGroup = async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = parseInt(req.params.groupId, 10);
    const { friend_id, can_edit = false } = req.body;
    const friendId = parseInt(friend_id, 10);

    if (Number.isNaN(groupId) || Number.isNaN(friendId)) {
      return res.status(400).json({ error: 'IDs inválidos' });
    }
    if (friendId === userId) {
      return res.status(400).json({ error: 'No puedes compartir un grupo contigo mismo' });
    }

    const [groupRows] = await pool.query('SELECT user_id FROM watch_groups WHERE id = ?', [groupId]);
    if (groupRows.length === 0) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    if (groupRows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Solo el creador del grupo puede compartirlo' });
    }

    const friendExists = await isFriend(userId, friendId);
    if (!friendExists) {
      return res.status(403).json({ error: 'Solo puedes compartir grupos con amigos aceptados' });
    }

    await pool.query(
      `INSERT INTO watch_group_shares (group_id, owner_id, friend_id, can_edit, created_at)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE can_edit = VALUES(can_edit)`,
      [groupId, userId, friendId, can_edit ? 1 : 0]
    );

    res.json({ message: 'Grupo compartido exitosamente', group_id: groupId, friend_id: friendId, can_edit: !!can_edit });
  } catch (error) {
    console.error('❌ Error en shareGroup:', error);
    res.status(500).json({ error: 'Error al compartir grupo' });
  }
};
