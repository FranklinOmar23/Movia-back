// socket/watchPartySocket.js
// Inicializar: require('./socket/watchPartySocket')(io)

const rooms = new Map();

// rooms: Map { code -> { hostSocketId, members: Map { socketId -> { userId, name } }, videoState: { playing, currentTime, updatedAt } } }
module.exports = (io) => {
  io.on('connection', (socket) => {
    const userId   = socket.handshake.auth?.userId;
    const userName = socket.handshake.auth?.userName || 'Usuario';

    // ── Unirse a la sala ──────────────────────────────────────────────────────
    socket.on('party:join', ({ code, isHost }) => {
      socket.join(code);

      if (!rooms.has(code)) {
        rooms.set(code, {
          hostSocketId: isHost ? socket.id : null,
          members: new Map(),
          videoState: { playing: false, currentTime: 0, updatedAt: Date.now() },
        });
      }

      const room = rooms.get(code);
      room.members.set(socket.id, { userId, name: userName });

      if (isHost) room.hostSocketId = socket.id;

      // Informar a todos los miembros de la sala
      io.to(code).emit('party:member-joined', {
        socketId: socket.id,
        userId,
        name: userName,
        memberCount: room.members.size,
      });

      // Al nuevo miembro le enviamos el estado actual del video
      // FIX: usar 'party:video-sync' para que useWatchParty lo procese igual
      // que los updates en vivo (antes era 'party:video-state', evento distinto)
      socket.emit('party:video-sync', room.videoState);

      // Lista actualizada de miembros
      const memberList = Array.from(room.members.entries()).map(([sid, m]) => ({
        socketId: sid,
        ...m,
      }));
      io.to(code).emit('party:members-list', memberList);

      socket.data.partyCode = code;
    });

    // ── FIX: handler para cuando el guest pide el estado actual explícitamente
    // (useWatchParty emite 'party:request-video-state' al conectarse)
    socket.on('party:request-video-state', ({ code }) => {
      const room = rooms.get(code);
      if (!room) return;
      socket.emit('party:video-sync', room.videoState);
    });

    // ── Sincronización de video (solo host puede controlar) ───────────────────
    socket.on('party:video-sync', ({ code, playing, currentTime }) => {
      const room = rooms.get(code);
      if (!room || room.hostSocketId !== socket.id) return;

      room.videoState = { playing, currentTime, updatedAt: Date.now() };

      // FIX: usar 'party:video-sync' (antes 'party:video-state') para que
      // useWatchParty reciba los updates en vivo con el mismo listener
      socket.to(code).emit('party:video-sync', room.videoState);
    });

    // ── Chat ──────────────────────────────────────────────────────────────────
    socket.on('party:chat', ({ code, message }) => {
      const room = rooms.get(code);
      if (!room || !room.members.has(socket.id)) return;

      io.to(code).emit('party:chat-message', {
        socketId: socket.id,
        userId,
        name: userName,
        message: message?.slice(0, 300),
        timestamp: Date.now(),
      });
    });

    // ── Reacciones ────────────────────────────────────────────────────────────
    socket.on('party:reaction', ({ code, emoji }) => {
      const ALLOWED = ['😂', '😮', '❤️', '👏', '😭', '🔥'];
      if (!ALLOWED.includes(emoji)) return;
      io.to(code).emit('party:reaction', { userId, name: userName, emoji });
    });

    // ── Señalización WebRTC ───────────────────────────────────────────────────
    socket.on('webrtc:offer', ({ code, targetSocketId, offer }) => {
      io.sockets.sockets.get(targetSocketId)?.emit('webrtc:offer', {
        fromSocketId: socket.id,
        fromUserId: userId,
        fromName: userName,
        offer,
      });
    });

    socket.on('webrtc:answer', ({ targetSocketId, answer }) => {
      io.sockets.sockets.get(targetSocketId)?.emit('webrtc:answer', {
        fromSocketId: socket.id,
        answer,
      });
    });

    socket.on('webrtc:ice', ({ targetSocketId, candidate }) => {
      io.sockets.sockets.get(targetSocketId)?.emit('webrtc:ice', {
        fromSocketId: socket.id,
        candidate,
      });
    });

    // ── Solicitud de amistad desde la sala ────────────────────────────────────
    socket.on('party:friend-request', ({ targetUserId }) => {
      const targetSockets = [...io.sockets.sockets.values()].filter(
        (s) => s.handshake.auth?.userId === targetUserId
      );
      targetSockets.forEach((s) => {
        s.emit('notification:friend-request', { fromUserId: userId, fromName: userName });
      });
    });

    // ── Salir de la sala ──────────────────────────────────────────────────────
    const leaveParty = (code) => {
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;

      room.members.delete(socket.id);
      socket.leave(code);

      if (room.members.size === 0) {
        rooms.delete(code);
        return;
      }

      if (room.hostSocketId === socket.id) {
        const nextSocketId = room.members.keys().next().value;
        room.hostSocketId = nextSocketId;
        io.to(code).emit('party:new-host', { socketId: nextSocketId });
      }

      io.to(code).emit('party:member-left', {
        socketId: socket.id,
        userId,
        memberCount: room.members.size,
      });

      const memberList = Array.from(room.members.entries()).map(([sid, m]) => ({
        socketId: sid,
        ...m,
      }));
      io.to(code).emit('party:members-list', memberList);
    };

    socket.on('party:leave',  ({ code }) => leaveParty(code));
    socket.on('disconnect',   ()         => leaveParty(socket.data?.partyCode));
  });
};