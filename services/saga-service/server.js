import Fastify from 'fastify';
import cors from '@fastify/cors';
import axios from 'axios';

const app = Fastify({ logger: true });
const PORT = Number(process.env.PORT || 5006);
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:5002';
const RANKING_SERVICE_URL = process.env.RANKING_SERVICE_URL || 'http://localhost:5005';

await app.register(cors, { origin: true });

app.get('/health', async () => ({ service: 'saga-service', status: 'ok' }));
app.get('/saga/health', async () => ({ service: 'saga-service', status: 'ok' }));

app.post('/saga/match-finished', async (request, reply) => {
  const { userId, username, points } = request.body || {};
  if (!userId || !username || points === undefined) {
    return reply.code(400).send({ message: 'userId, username, and points are required' });
  }

  let updatedUser;
  try {
    const userResponse = await axios.patch(USER_SERVICE_URL + '/users/' + userId + '/points', { points });
    updatedUser = userResponse.data;

    await axios.post(RANKING_SERVICE_URL + '/ranking/update', {
      userId,
      username,
      points: updatedUser.points
    });

    return { saga: 'committed', user: updatedUser };
  } catch (error) {
    if (updatedUser) {
      await axios.patch(USER_SERVICE_URL + '/users/' + userId + '/points/rollback', { points }).catch(() => null);
    }
    return reply.code(502).send({ saga: 'rolled_back', message: 'ranking update failed, user points rolled back' });
  }
});

app.listen({ port: PORT, host: '0.0.0.0' });
