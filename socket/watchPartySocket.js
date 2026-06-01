// socket/watchPartySocket.js
 //Inicializar: require('./socket/watchPartySocket')(io)

// rooms: Map { code -> { hostSocketId, members: Map { socketId -> { userId, name } }, videoState: { playing, currentTime, updatedAt } } }
module.exports = (io) => {
  io.on('connection', (socket) => {
    const userId = socket.handshake.auth?.userId;
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
      socket.emit('party:video-state', room.videoState);

      // Lista actualizada de miembros
      const memberList = Array.from(room.members.entries()).map(([sid, m]) => ({
        socketId: sid,
        ...m,
      }));
      io.to(code).emit('party:members-list', memberList);

      socket.data.partyCode = code;
    });

    // ── Sincronización de video (solo host puede controlar) ───────────────────
    socket.on('party:video-sync', ({ code, playing, currentTime }) => {
      const room = rooms.get(code);
      if (!room || room.hostSocketId !== socket.id) return;

      room.videoState = { playing, currentTime, updatedAt: Date.now() };
      socket.to(code).emit('party:video-state', room.videoState);
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
      io.to(targetSocketId).emit('webrtc:offer', {
        fromSocketId: socket.id,
        fromUserId: userId,
        fromName: userName,
        offer,
      });
    });

    socket.on('webrtc:answer', ({ targetSocketId, answer }) => {
      io.to(targetSocketId).emit('webrtc:answer', {
        fromSocketId: socket.id,
        answer,
      });
    });

    socket.on('webrtc:ice', ({ targetSocketId, candidate }) => {
      io.to(targetSocketId).emit('webrtc:ice', {
        fromSocketId: socket.id,
        candidate,
      });
    });

    // ── Solicitud de amistad desde la sala ────────────────────────────────────
    socket.on('party:friend-request', ({ targetUserId }) => {
      // El controlador REST /api/users/friends/request ya maneja la lógica;
      // aquí solo notificamos en tiempo real al destinatario si está conectado
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

      // Si el host se va, promover al siguiente
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

    socket.on('party:leave', ({ code }) => leaveParty(code));
    socket.on('disconnect', () => leaveParty(socket.data?.partyCode));
  });
};