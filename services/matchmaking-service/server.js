import Fastify from 'fastify';
import cors from '@fastify/cors';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import fs from 'node:fs';
import { v4 as uuidv4 } from 'uuid';

const app = Fastify({ logger: true });
const PORT = Number(process.env.PORT || 5003);
const USER_GRPC_HOST = process.env.USER_GRPC_HOST || 'localhost:6002';
const MATCH_TTL_MS = 10 * 60 * 1000;

await app.register(cors, { origin: true });

const protoText = 'syntax = "proto3"; package user; service UserService { rpc ValidateUser (UserIdRequest) returns (ValidateUserResponse); } message UserIdRequest { int32 id = 1; } message ValidateUserResponse { bool valid = 1; int32 id = 2; string username = 3; string role = 4; int32 points = 5; }';
fs.writeFileSync('/tmp/user.proto', protoText);
const packageDefinition = protoLoader.loadSync('/tmp/user.proto', { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
const userProto = grpc.loadPackageDefinition(packageDefinition).user;
const userClient = new userProto.UserService(USER_GRPC_HOST, grpc.credentials.createInsecure());

const queues = new Map();
const statuses = new Map();

function queueKey(roomCode) {
  return roomCode ? 'room:' + String(roomCode).toUpperCase() : 'global';
}

function getQueue(key) {
  if (!queues.has(key)) queues.set(key, []);
  return queues.get(key);
}

function statusKey(userId, key) {
  return userId + '@' + key;
}

function validateUser(userId) {
  return new Promise((resolve, reject) => {
    userClient.ValidateUser({ id: Number(userId) }, (error, response) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}

function now() {
  return Date.now();
}

function clearExpiredMatches() {
  const cutoff = now() - MATCH_TTL_MS;
  for (const [key, status] of statuses.entries()) {
    if (status.createdAt && status.createdAt < cutoff) statuses.delete(key);
  }
}

function removeFromAllQueues(userId) {
  const id = Number(userId);
  for (const queue of queues.values()) {
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      if (queue[index].id === id) queue.splice(index, 1);
    }
  }
  for (const [key, status] of statuses.entries()) {
    if (status.player?.id === id && status.status === 'waiting') statuses.delete(key);
  }
}

function waitingStatus(player, key, roomCode, questionIds) {
  return { status: 'waiting', player, queueKey: key, roomCode, questionIds, createdAt: now() };
}

async function joinQueue({ userId, roomCode = null, questionIds = [] }, reply) {
  clearExpiredMatches();
  if (!userId) return reply.code(400).send({ message: 'userId is required' });

  const key = queueKey(roomCode);
  const ownStatusKey = statusKey(userId, key);
  const existing = statuses.get(ownStatusKey);
  if (existing?.status === 'matched') return existing;
  if (existing?.status === 'waiting') return existing;

  const user = await validateUser(userId);
  if (!user.valid) return reply.code(404).send({ message: 'user not found' });

  const player = { id: user.id, username: user.username, points: user.points };
  removeFromAllQueues(player.id);
  const queue = getQueue(key);
  const opponentIndex = queue.findIndex((queuedPlayer) => queuedPlayer.id !== player.id);

  if (opponentIndex >= 0) {
    const [opponent] = queue.splice(opponentIndex, 1);
    const roomId = roomCode ? 'custom-' + String(roomCode).toUpperCase() : 'room-' + uuidv4().slice(0, 8);
    const match = { status: 'matched', roomId, roomCode, questionIds: questionIds.length ? questionIds : opponent.questionIds || [], players: [opponent, player], createdAt: now() };
    statuses.set(statusKey(opponent.id, key), match);
    statuses.set(statusKey(player.id, key), match);
    return match;
  }

  const queuedPlayer = { ...player, questionIds };
  queue.push(queuedPlayer);
  const status = waitingStatus(queuedPlayer, key, roomCode, questionIds);
  statuses.set(ownStatusKey, status);
  return status;
}

app.get('/health', async () => ({ service: 'matchmaking-service', status: 'ok', queues: [...queues.entries()].map(([key, queue]) => ({ key, size: queue.length })) }));
app.get('/matchmaking/health', async () => ({ service: 'matchmaking-service', status: 'ok' }));

app.post('/matchmaking/join', async (request, reply) => {
  return joinQueue({ userId: Number(request.body?.userId) }, reply);
});

app.post('/matchmaking/join-room', async (request, reply) => {
  const roomCode = String(request.body?.roomCode || '').trim().toUpperCase();
  if (!roomCode) return reply.code(400).send({ message: 'roomCode is required' });
  const questionIds = Array.isArray(request.body?.questionIds) ? request.body.questionIds.map(Number).filter(Boolean) : [];
  return joinQueue({ userId: Number(request.body?.userId), roomCode, questionIds }, reply);
});

app.post('/matchmaking/leave', async (request) => {
  const userId = Number(request.body?.userId);
  removeFromAllQueues(userId);
  return { left: true, status: 'idle' };
});

app.post('/matchmaking/clear', async (request) => {
  const userId = Number(request.body?.userId);
  removeFromAllQueues(userId);
  for (const key of [...statuses.keys()]) {
    if (key.startsWith(userId + '@')) statuses.delete(key);
  }
  return { cleared: true, status: 'idle' };
});

app.get('/matchmaking/status/:userId', async (request) => {
  clearExpiredMatches();
  const userId = Number(request.params.userId);
  const roomCode = request.query?.roomCode ? String(request.query.roomCode).toUpperCase() : null;
  if (roomCode) return statuses.get(statusKey(userId, queueKey(roomCode))) || { status: 'idle' };
  for (const [key, status] of statuses.entries()) {
    if (key.startsWith(userId + '@')) return status;
  }
  return { status: 'idle' };
});

app.listen({ port: PORT, host: '0.0.0.0' });
