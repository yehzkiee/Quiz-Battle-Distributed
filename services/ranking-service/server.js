import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createClient } from 'redis';

const app = Fastify({ logger: true });
const PORT = Number(process.env.PORT || 5005);
const LEADERBOARD_KEY = 'quiz_leaderboard';
const client = createClient({ url: process.env.VALKEY_URL || 'redis://localhost:6379' });

client.on('error', (error) => app.log.error(error));
await client.connect();
await app.register(cors, { origin: true });

function member(userId, username) {
  return String(userId) + ':' + username;
}

app.get('/health', async () => ({ service: 'ranking-service', status: client.isOpen ? 'ok' : 'cache-down' }));
app.get('/ranking/health', async () => ({ service: 'ranking-service', status: client.isOpen ? 'ok' : 'cache-down' }));

app.get('/ranking', async () => {
  const rows = await client.zRangeWithScores(LEADERBOARD_KEY, 0, 9, { REV: true });
  return rows.map((row, index) => {
    const [id, ...nameParts] = row.value.split(':');
    return { rank: index + 1, userId: Number(id), username: nameParts.join(':'), points: row.score };
  });
});

app.post('/ranking/update', async (request, reply) => {
  const { userId, username, points } = request.body || {};
  if (!userId || !username) return reply.code(400).send({ message: 'userId and username are required' });
  await client.zAdd(LEADERBOARD_KEY, { score: Number(points || 0), value: member(userId, username) });
  return { updated: true };
});

app.listen({ port: PORT, host: '0.0.0.0' });
