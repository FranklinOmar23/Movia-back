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
    const { name, description, is_public = 0 } = req.body;  // ← nuevo campo

    if (!name || name.trim().length < 3) {
      return res.status(400).json({ error: 'El nombre del grupo debe tener al menos 3 caracteres' });
    }

    const [result] = await pool.query(
      `INSERT INTO watch_groups (user_id, name, description, is_public, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [userId, name.trim(), description || null, is_public ? 1 : 0]  // ← incluirlo
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
exports.updateGroup = async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = parseInt(req.params.groupId, 10);
    const { name, description, is_public } = req.body;

    if (Number.isNaN(groupId)) {
      return res.status(400).json({ error: 'ID de grupo inválido' });
    }

    // Verificar que el grupo existe y pertenece al usuario
    const [groups] = await pool.query(
      'SELECT * FROM watch_groups WHERE id = ? AND user_id = ?',
      [groupId, userId]
    );

    if (groups.length === 0) {
      return res.status(404).json({ error: 'Grupo no encontrado o no tienes permiso para editarlo' });
    }

    // Construir dinámicamente los campos a actualizar
    const updates = [];
    const values = [];

    if (name !== undefined) {
      if (!name || name.trim().length < 3) {
        return res.status(400).json({ error: 'El nombre debe tener al menos 3 caracteres' });
      }
      updates.push('name = ?');
      values.push(name.trim());
    }

    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description.trim() || null);
    }

    if (is_public !== undefined) {
      updates.push('is_public = ?');
      values.push(is_public ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No se proporcionaron campos para actualizar' });
    }

    updates.push('updated_at = NOW()');
    values.push(groupId);

    await pool.query(
      `UPDATE watch_groups SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    // Devolver el grupo actualizado
    const [updatedGroup] = await pool.query(
      'SELECT id, user_id, name, description, is_public, created_at, updated_at FROM watch_groups WHERE id = ?',
      [groupId]
    );

    res.json({
      message: 'Grupo actualizado exitosamente',
      group: updatedGroup[0]
    });

  } catch (error) {
    console.error('❌ Error en updateGroup:', error);
    res.status(500).json({ error: 'Error al actualizar el grupo' });
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

    // 1. Obtener el grupo para verificar si existe y si es público
    const [groups] = await pool.query(
      'SELECT id, user_id, name, description, is_public, created_at, updated_at FROM watch_groups WHERE id = ?',
      [groupId]
    );

    if (groups.length === 0) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    const group = groups[0];

    // 2. Lógica de acceso: 
    // Permitir si es el dueño, si es público, o si tiene un registro de compartido
    const isOwner = group.user_id === userId;
    let hasAccess = isOwner || group.is_public === 1;

    if (!hasAccess) {
      // Si no es dueño ni público, verificar si está en la tabla de shares
      const [shareRows] = await pool.query(
        'SELECT id FROM watch_group_shares WHERE group_id = ? AND friend_id = ?',
        [groupId, userId]
      );
      hasAccess = shareRows.length > 0;
    }

    if (!hasAccess) {
      return res.status(403).json({ error: 'No tienes acceso a este grupo' });
    }

    // 3. Obtener items
    const [items] = await pool.query(
      `SELECT id, tmdb_id, media_type, title, poster_path, added_at
       FROM watch_group_items
       WHERE group_id = ?
       ORDER BY added_at DESC`,
      [groupId]
    );

    // 4. Obtener shares (solo si es el dueño para proteger privacidad)
    let shares = [];
    if (isOwner) {
      [shares] = await pool.query(
        `SELECT id AS share_id, friend_id, can_edit, created_at 
         FROM watch_group_shares
         WHERE group_id = ?`,
        [groupId]
      );
    }

    res.json({ group, items, shares });
  } catch (error) {
    console.error('❌ Error en getGroupById:', error);
    res.status(500).json({ error: 'Error al obtener grupo' });
  }
};
// controllers/groupController.js
exports.getPublicGroups = async (req, res) => {
  try {
    // ✅ No requerimos autenticación, pero si hay user, podemos usarlo para filtrar
    const userId = req.user ? req.user.id : null;
    
    const [groups] = await pool.query(
      `SELECT g.id, g.name, g.description, g.created_at, 
              g.user_id AS owner_id,
              u.full_name AS owner_name,
              (SELECT COUNT(*) FROM watch_group_items WHERE group_id = g.id) AS items_count
       FROM watch_groups g
       JOIN users u ON g.user_id = u.id
       WHERE g.is_public = 1
       ORDER BY g.created_at DESC`
    );

    res.json({ data: groups });
  } catch (error) {
    console.error('❌ Error en getPublicGroups:', error);
    res.status(500).json({ error: 'Error al obtener grupos públicos' });
  }
};

// Actualizar un permiso compartido (PATCH /:groupId/share/:shareId)
exports.updateGroupShare = async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = parseInt(req.params.groupId, 10);
    const shareId = parseInt(req.params.shareId, 10);
    const { can_edit } = req.body;

    if (isNaN(groupId) || isNaN(shareId)) {
      return res.status(400).json({ error: 'IDs inválidos' });
    }

    // Verificar que el usuario sea el dueño del grupo
    const [groupRows] = await pool.query(
      'SELECT user_id FROM watch_groups WHERE id = ?',
      [groupId]
    );
    if (groupRows.length === 0) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    if (groupRows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Solo el creador del grupo puede modificar permisos' });
    }

    // Actualizar can_edit del share
    await pool.query(
      'UPDATE watch_group_shares SET can_edit = ? WHERE id = ? AND group_id = ?',
      [can_edit ? 1 : 0, shareId, groupId]
    );

    res.json({ message: 'Permiso actualizado correctamente' });
  } catch (error) {
    console.error('❌ Error en updateGroupShare:', error);
    res.status(500).json({ error: 'Error al actualizar el permiso' });
  }
};

// Eliminar un permiso compartido (DELETE /:groupId/share/:shareId)
exports.removeGroupShare = async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = parseInt(req.params.groupId, 10);
    const shareId = parseInt(req.params.shareId, 10);

    if (isNaN(groupId) || isNaN(shareId)) {
      return res.status(400).json({ error: 'IDs inválidos' });
    }

    // Verificar que el usuario sea el dueño del grupo
    const [groupRows] = await pool.query(
      'SELECT user_id FROM watch_groups WHERE id = ?',
      [groupId]
    );
    if (groupRows.length === 0) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    if (groupRows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Solo el creador del grupo puede eliminar permisos' });
    }

    await pool.query(
      'DELETE FROM watch_group_shares WHERE id = ? AND group_id = ?',
      [shareId, groupId]
    );

    res.json({ message: 'Permiso eliminado correctamente' });
  } catch (error) {
    console.error('❌ Error en removeGroupShare:', error);
    res.status(500).json({ error: 'Error al eliminar el permiso' });
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
    // ✅ Fix — también permite usuarios con can_edit = true
    if (groups[0].user_id !== userId) {
      const [shareRows] = await pool.query(
        `SELECT can_edit FROM watch_group_shares
     WHERE group_id = ? AND friend_id = ? AND can_edit = 1`,
        [groupId, userId]
      );

      if (shareRows.length === 0) {
        return res.status(403).json({ error: 'No tienes permiso para añadir items a este grupo' });
      }
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
    // ✅ Fix en removeItem
    if (groups[0].user_id !== userId) {
      const [shareRows] = await pool.query(
        `SELECT can_edit FROM watch_group_shares
     WHERE group_id = ? AND friend_id = ? AND can_edit = 1`,
        [groupId, userId]
      );

      if (shareRows.length === 0) {
        return res.status(403).json({ error: 'No tienes permiso para eliminar items de este grupo' });
      }
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
