// socket/watchPartySocket.js
const pool = require('../db');

// ── Estado en memoria ─────────────────────────────────────────────────────────
// Estas estructuras son por-proceso. Con múltiples instancias necesitarías Redis.
// Dentro de un proceso único (pm2 cluster mode con sticky sessions) son suficientes.

/** @type {Map<string, { playing: boolean, currentTime: number, updatedAt: number }>} */
const roomState = new Map();

/** @type {Map<string, { code: string, isHost: boolean, userId: number|string, userName: string }>} */
const socketMeta = new Map();

// ── Rate limiter simple ───────────────────────────────────────────────────────
// Map<socketId, Map<event, { count, resetAt }>>
const rateLimits = new Map();

const RATE_LIMITS = {
  'party:chat':     { max: 10, windowMs: 5_000  },  // 10 msgs / 5s
  'party:reaction': { max: 20, windowMs: 10_000 },  // 20 reactions / 10s
  'webrtc:offer':   { max: 5,  windowMs: 10_000 },  // 5 offers / 10s (renegociaciones)
};

function isRateLimited(socketId, event) {
  const limit = RATE_LIMITS[event];
  if (!limit) return false;

  if (!rateLimits.has(socketId)) rateLimits.set(socketId, new Map());
  const socketLimits = rateLimits.get(socketId);

  const now = Date.now();
  const state = socketLimits.get(event) || { count: 0, resetAt: now + limit.windowMs };

  if (now > state.resetAt) {
    // Ventana expiró — reset
    socketLimits.set(event, { count: 1, resetAt: now + limit.windowMs });
    return false;
  }

  state.count++;
  socketLimits.set(event, state);
  return state.count > limit.max;
}

function cleanRateLimits(socketId) {
  rateLimits.delete(socketId);
}

// ── Helpers de broadcast (fuera del scope de conexión — sin memory leak) ──────

function broadcastMembers(io, code) {
  const room = io.sockets.adapter.rooms.get(code);
  if (!room) return;

  const members = [];
  for (const sid of room) {
    const m = socketMeta.get(sid);
    if (m) {
      members.push({
        socketId: sid,
        userId:   m.userId,
        name:     m.userName,
        isHost:   m.isHost,
      });
    }
  }
  io.to(code).emit('party:members-list', members);
}

async function handleLeave(io, socket, code) {
  socket.leave(code);
  const meta = socketMeta.get(socket.id);
  socketMeta.delete(socket.id);
  cleanRateLimits(socket.id);

  if (!meta) return;

  io.to(code).emit('party:member-left', {
    socketId: socket.id,
    userId:   meta.userId,
    name:     meta.userName,
  });

  // Marcar salida en la DB (fire-and-forget, no bloquea el socket)
  if (meta.userId) {
    pool.query(
      `UPDATE party_members pm
       JOIN watch_parties wp ON wp.id = pm.party_id
       SET pm.left_at = NOW()
       WHERE wp.code = ? AND pm.user_id = ? AND pm.left_at IS NULL`,
      [code, meta.userId]
    ).catch(err => console.error('DB leave error:', err));
  }

  if (meta.isHost) {
    const room = io.sockets.adapter.rooms.get(code);

    if (!room || room.size === 0) {
      // Sala vacía → limpiar estado en memoria y marcar como ended en DB
      roomState.delete(code);
      pool.query(
        `UPDATE watch_parties SET status = 'ended', ended_at = NOW() WHERE code = ? AND status != 'ended'`,
        [code]
      ).catch(err => console.error('DB end party error:', err));
      return;
    }

    // Promover al siguiente socket como nuevo host
    const nextSocketId = [...room][0];
    const nextMeta = socketMeta.get(nextSocketId);
    if (nextMeta) {
      nextMeta.isHost = true;
      socketMeta.set(nextSocketId, nextMeta);

      // Actualizar host en DB
      if (nextMeta.userId) {
        pool.query(
          `UPDATE watch_parties SET host_user_id = ? WHERE code = ?`,
          [nextMeta.userId, code]
        ).catch(err => console.error('DB new host error:', err));
      }

      io.to(code).emit('party:new-host', {
        socketId: nextSocketId,
        userId:   nextMeta.userId,
      });
    }
  }

  broadcastMembers(io, code);
}

// ── Validar que el socket realmente es host según DB ─────────────────────────
// Se llama solo en operaciones críticas (video-sync).
// Para operaciones de bajo impacto (chat, reactions) confiamos en socketMeta.
async function verifyHostInDB(code, userId) {
  if (!userId) return false;
  try {
    const [rows] = await pool.query(
      `SELECT id FROM watch_parties WHERE code = ? AND host_user_id = ? AND status != 'ended'`,
      [code, userId]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

// ── Handler principal ─────────────────────────────────────────────────────────
module.exports = function (io) {

  // Limpiar rate limits periódicamente para evitar memory leaks en sesiones largas
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [socketId, events] of rateLimits.entries()) {
      // Si el socket ya no está conectado, eliminar sus límites
      if (!io.sockets.sockets.has(socketId)) {
        rateLimits.delete(socketId);
        continue;
      }
      // Limpiar ventanas expiradas
      for (const [event, state] of events.entries()) {
        if (now > state.resetAt) events.delete(event);
      }
    }
  }, 60_000);

  io.on('connection', (socket) => {
    const userId   = socket.handshake.auth?.userId;
    const userName = (socket.handshake.auth?.userName || 'Usuario').slice(0, 50);

    // ── party:join ──────────────────────────────────────────────────────────
    socket.on('party:join', ({ code, isHost }) => {
      if (!code || typeof code !== 'string') return;
      const safeCode = code.toUpperCase().slice(0, 8);

      socket.join(safeCode);
      socketMeta.set(socket.id, {
        code:   safeCode,
        isHost: Boolean(isHost),
        userId,
        userName,
      });

      // Inicializar estado de reproducción si es la primera vez
      if (!roomState.has(safeCode)) {
        roomState.set(safeCode, { playing: false, currentTime: 0, updatedAt: Date.now() });
      }

      // Notificar a los demás para WebRTC peer negotiation
      socket.to(safeCode).emit('party:member-joined', {
        socketId: socket.id,
        userId,
        name: userName,
      });

      // Enviar estado actual de reproducción al guest inmediatamente
      if (!isHost) {
        socket.emit('party:video-sync', roomState.get(safeCode));
      }

      broadcastMembers(io, safeCode);
    });

    // ── party:video-sync — SOLO el host puede emitir esto ──────────────────
    // Doble validación: socketMeta (rápida) + DB (crítica, async)
    socket.on('party:video-sync', async ({ code, playing, currentTime, force }) => {
      if (!code) return;
      const safeCode = code.toUpperCase().slice(0, 8);
      const meta = socketMeta.get(socket.id);

      // Guard rápido con socketMeta
      if (!meta || !meta.isHost || meta.code !== safeCode) return;

      // Validar números antes de guardar
      const safeTime    = typeof currentTime === 'number' && isFinite(currentTime) ? Math.max(0, currentTime) : 0;
      const safePlaying = Boolean(playing);

      // Para seeks (force=true) también verificamos en DB para evitar race conditions
      // donde un guest que acaba de ser promovido a host aún no lo sabe el servidor
      if (force) {
        const validHost = await verifyHostInDB(safeCode, userId);
        if (!validHost) return;
      }

      roomState.set(safeCode, { playing: safePlaying, currentTime: safeTime, updatedAt: Date.now() });

      socket.to(safeCode).emit('party:video-sync', {
        playing:     safePlaying,
        currentTime: safeTime,
        force:       Boolean(force),
      });
    });

    // ── party:request-video-state ───────────────────────────────────────────
    socket.on('party:request-video-state', ({ code }) => {
      if (!code) return;
      const safeCode = code.toUpperCase().slice(0, 8);
      const state = roomState.get(safeCode);
      if (!state) return;
      socket.emit('party:video-sync', state);
    });

    // ── party:chat ──────────────────────────────────────────────────────────
    socket.on('party:chat', ({ code, message }) => {
      if (!code || !message?.trim()) return;
      if (isRateLimited(socket.id, 'party:chat')) {
        socket.emit('party:error', { event: 'party:chat', message: 'Demasiados mensajes. Esperá un momento.' });
        return;
      }
      const safeCode = code.toUpperCase().slice(0, 8);
      const meta = socketMeta.get(socket.id);
      io.to(safeCode).emit('party:chat-message', {
        socketId: socket.id,
        userId,
        name:    meta?.userName || userName,
        message: message.trim().slice(0, 300),
        ts:      Date.now(),
      });
    });

    // ── party:reaction ──────────────────────────────────────────────────────
    socket.on('party:reaction', ({ code, emoji }) => {
      const ALLOWED = ['😂', '😮', '❤️', '👏', '😭', '🔥'];
      if (!code || !ALLOWED.includes(emoji)) return;
      if (isRateLimited(socket.id, 'party:reaction')) return; // silencioso
      const safeCode = code.toUpperCase().slice(0, 8);
      io.to(safeCode).emit('party:reaction', {
        emoji,
        userId,
        name: socketMeta.get(socket.id)?.userName || userName,
      });
    });

    // ── party:friend-request ────────────────────────────────────────────────
    // El cliente emite esto después de que la API REST ya registró la solicitud.
    // El socket solo notifica en tiempo real al target si está conectado.
    socket.on('party:friend-request', ({ targetUserId }) => {
      if (!targetUserId || targetUserId === userId) return;

      // Buscar el socket del target en todas las salas activas
      // socketMeta itera solo los sockets con sala activa
      for (const [sid, meta] of socketMeta.entries()) {
        if (String(meta.userId) === String(targetUserId)) {
          io.to(sid).emit('party:friend-request-received', {
            fromUserId: userId,
            fromName:   userName,
          });
          break;
        }
      }
    });

    // ── WebRTC signaling ────────────────────────────────────────────────────
    socket.on('webrtc:offer', ({ targetSocketId, offer, code }) => {
      if (!targetSocketId || !offer) return;
      if (isRateLimited(socket.id, 'webrtc:offer')) return;
      // Validar que el target está en la misma sala
      const myMeta     = socketMeta.get(socket.id);
      const targetMeta = socketMeta.get(targetSocketId);
      if (!myMeta || !targetMeta || myMeta.code !== targetMeta.code) return;

      io.to(targetSocketId).emit('webrtc:offer', {
        fromSocketId: socket.id,
        fromUserId:   userId,
        fromName:     userName,
        offer,
      });
    });

    socket.on('webrtc:answer', ({ targetSocketId, answer }) => {
      if (!targetSocketId || !answer) return;
      const myMeta     = socketMeta.get(socket.id);
      const targetMeta = socketMeta.get(targetSocketId);
      if (!myMeta || !targetMeta || myMeta.code !== targetMeta.code) return;

      io.to(targetSocketId).emit('webrtc:answer', {
        fromSocketId: socket.id,
        answer,
      });
    });

    socket.on('webrtc:ice', ({ targetSocketId, candidate }) => {
      if (!targetSocketId || !candidate) return;
      const myMeta     = socketMeta.get(socket.id);
      const targetMeta = socketMeta.get(targetSocketId);
      if (!myMeta || !targetMeta || myMeta.code !== targetMeta.code) return;

      io.to(targetSocketId).emit('webrtc:ice', {
        fromSocketId: socket.id,
        candidate,
      });
    });

    // ── party:leave ─────────────────────────────────────────────────────────
    socket.on('party:leave', ({ code }) => {
      if (!code) return;
      handleLeave(io, socket, code.toUpperCase().slice(0, 8));
    });

    // ── disconnect ──────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      const meta = socketMeta.get(socket.id);
      if (meta?.code) handleLeave(io, socket, meta.code);
      else {
        // Socket nunca entró a una sala — solo limpiar rate limits
        cleanRateLimits(socket.id);
      }
    });
  });

  // Exponer cleanup para tests o graceful shutdown
  io.watchPartyCleanup = () => clearInterval(cleanupInterval);
};