const pool = require('../db');

const getFriendStatus = async (userId, otherUserId) => {
  const [rows] = await pool.query(
    `SELECT status
     FROM friend_requests
     WHERE (requester_id = ? AND receiver_id = ?)
        OR (requester_id = ? AND receiver_id = ?)`,
    [userId, otherUserId, otherUserId, userId]
  );
  return rows.length > 0 ? rows[0].status : null;
};

exports.getStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await pool.query(
      'SELECT is_online, last_login_at, last_logout_at, last_seen FROM user_status WHERE user_id = ?',
      [userId]
    );

    const status = rows[0] || { is_online: false, last_login_at: null, last_logout_at: null, last_seen: null };

    res.json({ user_id: userId, ...status });
  } catch (error) {
    console.error('❌ Error en getStatus:', error);
    res.status(500).json({ error: 'Error al obtener estado del usuario' });
  }
};

exports.searchUsers = async (req, res) => {
  try {
    const query = req.query.query?.trim();
    if (!query) {
      return res.status(400).json({ error: 'query es requerido' });
    }

    const [users] = await pool.query(
      `SELECT id, full_name, email, role, is_active
       FROM users
       WHERE (full_name LIKE ? OR email LIKE ?)
         AND id != ?
       ORDER BY full_name ASC
       LIMIT 30`,
      [`%${query}%`, `%${query}%`, req.user.id]
    );

    res.json({ data: users });
  } catch (error) {
    console.error('❌ Error en searchUsers:', error);
    res.status(500).json({ error: 'Error al buscar usuarios' });
  }
};

exports.getUserProfile = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const targetUserId = parseInt(req.params.id, 10);

    if (Number.isNaN(targetUserId)) {
      return res.status(400).json({ error: 'ID de usuario inválido' });
    }

    const [users] = await pool.query(
      'SELECT id, full_name, email, role, is_active, created_at FROM users WHERE id = ?',
      [targetUserId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (targetUserId !== currentUserId) {
      const friendStatus = await getFriendStatus(currentUserId, targetUserId);
      if (friendStatus !== 'accepted') {
        return res.status(403).json({ error: 'No estás autorizado para ver el perfil de este usuario' });
      }
    }

    const user = users[0];

    const [groups] = await pool.query(
      targetUserId === currentUserId
        ? `SELECT id, name, description, is_public, created_at, updated_at
           FROM watch_groups
           WHERE user_id = ?
           ORDER BY created_at DESC`
        : `SELECT g.id, g.name, g.description, g.is_public, g.created_at, g.updated_at, s.can_edit
           FROM watch_groups g
           JOIN watch_group_shares s ON g.id = s.group_id
           WHERE g.user_id = ?
             AND s.friend_id = ?
           ORDER BY g.created_at DESC`,
      targetUserId === currentUserId ? [targetUserId] : [targetUserId, currentUserId]
    );

    res.json({ user, groups });
  } catch (error) {
    console.error('❌ Error en getUserProfile:', error);
    res.status(500).json({ error: 'Error al obtener perfil de usuario' });
  }
};

exports.sendFriendRequest = async (req, res) => {
  try {
    const requesterId = req.user.id;
    const { target_user_id } = req.body;
    const receiverId = parseInt(target_user_id, 10);

    if (Number.isNaN(receiverId)) {
      return res.status(400).json({ error: 'target_user_id inválido' });
    }

    if (receiverId === requesterId) {
      return res.status(400).json({ error: 'No puedes enviar una solicitud de amistad a ti mismo' });
    }

    const [existingTarget] = await pool.query('SELECT id FROM users WHERE id = ?', [receiverId]);
    if (existingTarget.length === 0) {
      return res.status(404).json({ error: 'Usuario destino no encontrado' });
    }

    const [existingRelation] = await pool.query(
      `SELECT id, requester_id, receiver_id, status
       FROM friend_requests
       WHERE (requester_id = ? AND receiver_id = ?)
          OR (requester_id = ? AND receiver_id = ?)`,
      [requesterId, receiverId, receiverId, requesterId]
    );

    if (existingRelation.length > 0) {
      const relation = existingRelation[0];
      if (relation.status === 'accepted') {
        return res.status(409).json({ error: 'Ya son amigos' });
      }
      if (relation.requester_id === requesterId && relation.status === 'pending') {
        return res.status(409).json({ error: 'Ya enviaste una solicitud de amistad' });
      }
      if (relation.receiver_id === requesterId && relation.status === 'pending') {
        return res.status(409).json({ error: 'Tienes una solicitud pendiente de este usuario' });
      }
    }

    await pool.query(
      `INSERT INTO friend_requests (requester_id, receiver_id, status, created_at)
       VALUES (?, ?, 'pending', NOW())`,
      [requesterId, receiverId]
    );

    res.status(201).json({ message: 'Solicitud de amistad enviada' });
  } catch (error) {
    console.error('❌ Error en sendFriendRequest:', error);
    res.status(500).json({ error: 'Error al enviar solicitud de amistad' });
  }
};

exports.acceptFriendRequest = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const requestId = parseInt(req.params.requestId, 10);

    if (Number.isNaN(requestId)) {
      return res.status(400).json({ error: 'requestId inválido' });
    }

    const [rows] = await pool.query(
      `SELECT id, requester_id, receiver_id, status
       FROM friend_requests
       WHERE id = ?`,
      [requestId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }

    const request = rows[0];
    if (request.receiver_id !== currentUserId) {
      return res.status(403).json({ error: 'No puedes aceptar esta solicitud' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'La solicitud ya fue respondida' });
    }

    await pool.query(
      `UPDATE friend_requests
       SET status = 'accepted', responded_at = NOW()
       WHERE id = ?`,
      [requestId]
    );

    res.json({ message: 'Solicitud de amistad aceptada' });
  } catch (error) {
    console.error('❌ Error en acceptFriendRequest:', error);
    res.status(500).json({ error: 'Error al aceptar solicitud de amistad' });
  }
};

exports.getFriends = async (req, res) => {
  try {
    const userId = req.user.id;

    const [friends] = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.role, u.is_active, fr.created_at AS friends_since
       FROM friend_requests fr
       JOIN users u ON (u.id = IF(fr.requester_id = ?, fr.receiver_id, fr.requester_id))
       WHERE (fr.requester_id = ? OR fr.receiver_id = ?)
         AND fr.status = 'accepted'`,
      [userId, userId, userId]
    );

    res.json({ data: friends });
  } catch (error) {
    console.error('❌ Error en getFriends:', error);
    res.status(500).json({ error: 'Error al obtener lista de amigos' });
  }
};

exports.getReceivedRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    const [requests] = await pool.query(
      `SELECT fr.id, fr.requester_id, fr.status, fr.created_at,
              u.id AS user_id, u.full_name, u.email, u.role, u.is_active
       FROM friend_requests fr
       JOIN users u ON u.id = fr.requester_id
       WHERE fr.receiver_id = ?
       ORDER BY fr.created_at DESC`,
      [userId]
    );

    res.json({ data: requests });
  } catch (error) {
    console.error('❌ Error en getReceivedRequests:', error);
    res.status(500).json({ error: 'Error al obtener solicitudes recibidas' });
  }
};

exports.getSentRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    const [requests] = await pool.query(
      `SELECT fr.id, fr.receiver_id, fr.status, fr.created_at,
              u.id AS user_id, u.full_name, u.email, u.role, u.is_active
       FROM friend_requests fr
       JOIN users u ON u.id = fr.receiver_id
       WHERE fr.requester_id = ?
       ORDER BY fr.created_at DESC`,
      [userId]
    );

    res.json({ data: requests });
  } catch (error) {
    console.error('❌ Error en getSentRequests:', error);
    res.status(500).json({ error: 'Error al obtener solicitudes enviadas' });
  }
};

exports.rejectFriendRequest = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const requestId = parseInt(req.params.requestId, 10);

    if (Number.isNaN(requestId)) {
      return res.status(400).json({ error: 'requestId inválido' });
    }

    const [rows] = await pool.query(
      `SELECT id, requester_id, receiver_id, status
       FROM friend_requests
       WHERE id = ?`,
      [requestId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }

    const request = rows[0];
    if (request.receiver_id !== currentUserId) {
      return res.status(403).json({ error: 'No puedes rechazar esta solicitud' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'La solicitud ya fue respondida' });
    }

    await pool.query(
      `UPDATE friend_requests
       SET status = 'rejected', responded_at = NOW()
       WHERE id = ?`,
      [requestId]
    );

    res.json({ message: 'Solicitud de amistad rechazada' });
  } catch (error) {
    console.error('❌ Error en rejectFriendRequest:', error);
    res.status(500).json({ error: 'Error al rechazar solicitud de amistad' });
  }
};
