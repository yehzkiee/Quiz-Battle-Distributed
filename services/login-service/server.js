import Fastify from 'fastify';
import cors from '@fastify/cors';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const app = Fastify({ logger: true });
const PORT = Number(process.env.PORT || 5001);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET is required');
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:5002';

await app.register(cors, { origin: true });

function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role || 'user' }, JWT_SECRET, { expiresIn: '2h' });
}

app.get('/health', async () => ({ service: 'login-service', status: 'ok' }));
app.get('/auth/health', async () => ({ service: 'login-service', status: 'ok' }));

app.post('/auth/register', async (request, reply) => {
  const { username, password } = request.body || {};
  if (!username || !password) return reply.code(400).send({ message: 'username and password are required' });

  try {
    const { data: user } = await axios.post(USER_SERVICE_URL + '/users', { username, password });
    return reply.code(201).send({ token: signToken(user), user });
  } catch (error) {
    const status = error.response?.status || 500;
    return reply.code(status).send({ message: error.response?.data?.message || 'register failed' });
  }
});

app.post('/auth/login', async (request, reply) => {
  const { username, password } = request.body || {};
  if (!username || !password) return reply.code(400).send({ message: 'username and password are required' });

  try {
    const url = USER_SERVICE_URL + '/users/by-username/' + encodeURIComponent(username) + '?includePassword=true';
    const { data: user } = await axios.get(url);
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return reply.code(401).send({ message: 'invalid credentials' });
    delete user.password;
    user.role = user.role || 'user';
    return { token: signToken(user), user };
  } catch {
    return reply.code(401).send({ message: 'invalid credentials' });
  }
});

app.get('/auth/verify', async (request, reply) => {
  const token = request.headers.authorization?.replace('Bearer ', '');
  if (!token) return reply.code(401).send({ message: 'missing token' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return { valid: true, user: payload };
  } catch {
    return reply.code(401).send({ valid: false, message: 'invalid token' });
  }
});

app.listen({ port: PORT, host: '0.0.0.0' });
