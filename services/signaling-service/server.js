import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';

const app = Fastify({ logger: true });
const PORT = Number(process.env.PORT || 5004);
const rooms = new Map();

await app.register(cors, { origin: true });
await app.register(websocket);

function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  return rooms.get(roomId);
}

function broadcast(roomId, senderId, payload) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const [playerId, socket] of room.entries()) {
    if (playerId !== senderId && socket.readyState === 1) {
      socket.send(JSON.stringify({ ...payload, from: senderId }));
    }
  }
}

app.get('/health', async () => ({ service: 'signaling-service', status: 'ok', rooms: rooms.size }));

app.get('/ws/signaling', { websocket: true }, (connection) => {
  const socket = connection.socket || connection;
  let currentRoom = null;
  let currentPlayer = null;

  socket.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      socket.send(JSON.stringify({ type: 'error', message: 'invalid json' }));
      return;
    }

    const { type, roomId, userId } = message;
    if (type === 'join-room') {
      currentRoom = roomId;
      currentPlayer = String(userId);
      const room = getRoom(roomId);
      room.set(currentPlayer, socket);
      socket.send(JSON.stringify({ type: 'joined-room', roomId, userId, peers: [...room.keys()].filter((id) => id !== currentPlayer) }));
      broadcast(roomId, currentPlayer, { type: 'peer-joined', roomId, userId });
      return;
    }

    if (!currentRoom || !currentPlayer) {
      socket.send(JSON.stringify({ type: 'error', message: 'join-room first' }));
      return;
    }

    if (['player-ready', 'webrtc-offer', 'webrtc-answer', 'ice-candidate', 'quiz-event'].includes(type)) {
      broadcast(currentRoom, currentPlayer, message);
    }
  });

  socket.on('close', () => {
    if (!currentRoom || !currentPlayer) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    room.delete(currentPlayer);
    broadcast(currentRoom, currentPlayer, { type: 'player-left', roomId: currentRoom, userId: currentPlayer });
    if (room.size === 0) rooms.delete(currentRoom);
  });
});

app.listen({ port: PORT, host: '0.0.0.0' });
