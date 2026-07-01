import Fastify from 'fastify';
import cors from '@fastify/cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import fs from 'node:fs';

const { Pool } = pg;
const app = Fastify({ logger: true });
const PORT = Number(process.env.PORT || 5002);
const GRPC_PORT = Number(process.env.GRPC_PORT || 6002);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET is required');
const ROLES = ['root_admin', 'admin', 'instructor', 'user'];

await app.register(cors, { origin: true });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'quiz_user',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'quiz_db'
});

async function waitForDatabase(retries = 30) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      app.log.warn({ attempt, error: error.message }, 'database is not ready yet');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw new Error('database is not ready after retrying');
}

async function ensureSchema() {
  await pool.query("CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username VARCHAR(100) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL, role VARCHAR(30) DEFAULT 'user', points INT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(30) DEFAULT 'user'");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(100)");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS rename_used BOOLEAN DEFAULT false");
  await pool.query("UPDATE users SET display_name = username WHERE display_name IS NULL OR display_name = ''");
  await pool.query("UPDATE users SET role = 'user' WHERE role IS NULL OR role = ''");
  await pool.query("CREATE TABLE IF NOT EXISTS questions (id SERIAL PRIMARY KEY, question_text TEXT NOT NULL, option_a TEXT NOT NULL DEFAULT '', option_b TEXT NOT NULL DEFAULT '', option_c TEXT NOT NULL DEFAULT '', option_d TEXT NOT NULL DEFAULT '', correct_option VARCHAR(1) NOT NULL DEFAULT 'A', points INT DEFAULT 10, difficulty VARCHAR(50) DEFAULT 'normal', created_by INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
  await pool.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS option_a TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS option_b TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS option_c TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS option_d TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS correct_option VARCHAR(1) NOT NULL DEFAULT 'A'");
  await pool.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS points INT DEFAULT 10");
  await pool.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS created_by INT");
  await pool.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS answer VARCHAR(255)");
  await pool.query("ALTER TABLE questions ALTER COLUMN answer DROP NOT NULL");
  await pool.query("CREATE TABLE IF NOT EXISTS quiz_rooms (id SERIAL PRIMARY KEY, code VARCHAR(12) UNIQUE NOT NULL, title VARCHAR(160) NOT NULL, visibility VARCHAR(20) DEFAULT 'public', question_ids JSONB DEFAULT '[]'::jsonb, members JSONB DEFAULT '[]'::jsonb, host_user_id INT, max_players INT DEFAULT 4, status VARCHAR(20) DEFAULT 'waiting', created_by INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, started_at TIMESTAMP)");
  await pool.query("ALTER TABLE quiz_rooms ADD COLUMN IF NOT EXISTS members JSONB DEFAULT '[]'::jsonb");
  await pool.query("ALTER TABLE quiz_rooms ADD COLUMN IF NOT EXISTS host_user_id INT");
  await pool.query("ALTER TABLE quiz_rooms ADD COLUMN IF NOT EXISTS max_players INT DEFAULT 4");
  await pool.query("ALTER TABLE quiz_rooms ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'waiting'");
  await pool.query("ALTER TABLE quiz_rooms ADD COLUMN IF NOT EXISTS started_at TIMESTAMP");
  await pool.query("UPDATE quiz_rooms SET max_players = 4 WHERE max_players IS NULL OR max_players < 2");
  await pool.query("CREATE TABLE IF NOT EXISTS quiz_match_results (room_code VARCHAR(12) NOT NULL, user_id INT NOT NULL, username VARCHAR(100) NOT NULL, score INT DEFAULT 0, correct_count INT DEFAULT 0, total_questions INT DEFAULT 0, elapsed_ms INT DEFAULT 0, answers JSONB DEFAULT '[]'::jsonb, completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (room_code, user_id))");
}

async function seedDefaults() {
  const defaultAccounts = [
    { username: process.env.ROOT_ADMIN_USERNAME || 'rootadmin', password: process.env.ROOT_ADMIN_PASSWORD, role: 'root_admin', upsertRole: true },
    { username: process.env.DEFAULT_ADMIN_USERNAME || 'admin', password: process.env.DEFAULT_ADMIN_PASSWORD, role: 'admin' },
    { username: process.env.DEFAULT_INSTRUCTOR_USERNAME || 'instructor', password: process.env.DEFAULT_INSTRUCTOR_PASSWORD, role: 'instructor' }
  ].filter((account) => account.password);

  for (const account of defaultAccounts) {
    const hashed = await bcrypt.hash(account.password, 10);
    if (account.upsertRole) {
      await pool.query(
        'INSERT INTO users (username, password, role, display_name) VALUES ($1, $2, $3, $1) ON CONFLICT (username) DO UPDATE SET role=$3',
        [account.username, hashed, account.role]
      );
    } else {
      await pool.query(
        'INSERT INTO users (username, password, role, display_name) VALUES ($1, $2, $3, $1) ON CONFLICT (username) DO NOTHING',
        [account.username, hashed, account.role]
      );
    }
  }
  await pool.query("DELETE FROM questions WHERE COALESCE(option_a, '') = '' OR COALESCE(option_b, '') = '' OR COALESCE(option_c, '') = '' OR COALESCE(option_d, '') = ''");
  const bank = [
    ['Bahasa pemrograman yang sering dipakai bersama React?', 'Python', 'JavaScript', 'Go', 'PHP', 'B', 10, 'easy'],
    ['Protokol untuk komunikasi service-to-service cepat?', 'SMTP', 'FTP', 'gRPC', 'DNS', 'C', 10, 'normal'],
    ['Komponen Nginx untuk membagi request ke banyak service?', 'Load Balancer', 'Compiler', 'Scheduler', 'ORM', 'A', 10, 'normal'],
    ['Cache Redis-compatible yang dipakai pada rancangan ini?', 'MongoDB', 'Valkey', 'SQLite', 'RabbitMQ', 'B', 10, 'easy'],
    ['Pola transaksi terdistribusi untuk rollback antar service?', 'MVC', 'Saga', 'Singleton', 'Factory', 'B', 10, 'hard'],
    ['Apa fungsi utama Nginx pada project ini?', 'Database', 'Gateway dan load balancer', 'Compiler', 'Package manager', 'B', 10, 'normal'],
    ['Service yang menyimpan leaderboard cepat adalah?', 'Ranking Service', 'Login Service', 'Signaling Service', 'Frontend', 'A', 10, 'easy'],
    ['Valkey menyimpan leaderboard dengan struktur data?', 'List', 'Hash', 'Sorted Set', 'Stream', 'C', 10, 'normal'],
    ['Pattern untuk rollback update skor adalah?', 'Observer', 'Saga', 'Proxy', 'Adapter', 'B', 10, 'normal'],
    ['WebSocket pada WebRTC dipakai untuk?', 'Menyimpan data', 'Signaling offer answer', 'Render UI', 'Hash password', 'B', 10, 'normal'],
    ['DataChannel WebRTC digunakan untuk?', 'Event real-time antar pemain', 'Query SQL', 'Load balancing', 'Build React', 'A', 10, 'normal'],
    ['Database proxy pada rancangan ini adalah?', 'PGPool', 'Nginx', 'Valkey', 'Axios', 'A', 10, 'normal'],
    ['PostgreSQL standby berada dalam mode?', 'Recovery', 'Compile', 'Bundle', 'Cache', 'A', 10, 'hard'],
    ['JWT dipakai untuk?', 'Autentikasi session', 'Render CSS', 'Streaming video', 'Backup database', 'A', 10, 'easy'],
    ['bcrypt dipakai untuk?', 'Hash password', 'Load image', 'Generate CSS', 'Proxy request', 'A', 10, 'easy'],
    ['Fastify adalah framework untuk?', 'Backend Node.js', 'Database engine', 'Browser extension', 'Container runtime', 'A', 10, 'easy'],
    ['Vite dipakai sebagai?', 'Build tool frontend', 'DB proxy', 'Cache server', 'RPC protocol', 'A', 10, 'easy'],
    ['Docker Compose berguna untuk?', 'Menjalankan banyak container', 'Membuat desain', 'Menulis dokumen', 'Menghapus database saja', 'A', 10, 'easy'],
    ['Service yang membuat token login adalah?', 'Login Service', 'Ranking Service', 'PGPool', 'Valkey', 'A', 10, 'easy'],
    ['Service yang mengelola data pemain adalah?', 'User Service', 'Nginx', 'Cloudflare', 'Vite', 'A', 10, 'easy'],
    ['gRPC dipakai matchmaking untuk?', 'Validasi user ke User Service', 'Menggambar UI', 'Membuat CSS', 'Membuka tunnel', 'A', 10, 'normal'],
    ['Cloudflare Tunnel menghasilkan?', 'URL public sementara', 'Primary key', 'JWT secret', 'Docker image lokal', 'A', 10, 'normal'],
    ['Room private join memakai?', 'Kode unik', 'Alamat MAC', 'Port database', 'Nama container', 'A', 10, 'easy'],
    ['Role yang bisa mengelola semua fitur adalah?', 'admin', 'user', 'guest', 'spectator', 'A', 10, 'easy'],
    ['Role yang bisa mengelola soal adalah?', 'instructor', 'guest', 'viewer', 'bot', 'A', 10, 'easy'],
    ['User biasa dapat melakukan?', 'Matchmaking dan quiz', 'Mengubah role semua user', 'Menghapus container', 'Promote standby', 'A', 10, 'easy'],
    ['HTTP status 401 berarti?', 'Unauthorized', 'OK', 'Created', 'No Content', 'A', 10, 'normal'],
    ['HTTP status 502 biasanya berarti?', 'Bad Gateway', 'Created', 'Accepted', 'Partial Content', 'A', 10, 'normal'],
    ['Primary key pada tabel users adalah?', 'id', 'password', 'points', 'created_at', 'A', 10, 'easy'],
    ['Kolom untuk jawaban benar soal pilihan ganda adalah?', 'correct_option', 'option_a', 'difficulty', 'created_by', 'A', 10, 'easy'],
    ['Poin default ketika jawaban benar pada seed adalah?', '10', '0', '1', '100', 'A', 10, 'easy'],
    ['Saat timer habis, sistem akan?', 'Skip soal', 'Tambah poin', 'Logout', 'Hapus room', 'A', 10, 'easy'],
    ['Chat room dikirim real-time memakai?', 'DataChannel atau signaling fallback', 'CSV', 'PDF', 'Cron', 'A', 10, 'normal'],
    ['Nginx route /api/ranking menuju?', 'Ranking Service', 'User Service', 'Frontend', 'PGPool', 'A', 10, 'easy'],
    ['Nginx route /ws/signaling menuju?', 'Signaling Service', 'Ranking Service', 'Postgres', 'Valkey', 'A', 10, 'easy'],
    ['Leaderboard cepat disimpan di?', 'Valkey', 'Browser localStorage saja', 'Nginx config', 'Dockerfile', 'A', 10, 'easy'],
    ['Skor akhir dikirim ke?', 'Saga Service', 'Cloudflare', 'Vite', 'NPM', 'A', 10, 'normal'],
    ['Jika Ranking Service gagal, Saga melakukan?', 'Rollback poin user', 'Membuat akun admin', 'Restart browser', 'Menghapus soal', 'A', 10, 'normal'],
    ['Port publik Nginx lokal adalah?', '80', '5432', '6379', '6002', 'A', 10, 'easy'],
    ['Port default PostgreSQL adalah?', '5432', '80', '5173', '5001', 'A', 10, 'easy'],
    ['Endpoint health auth adalah?', '/api/auth/health', '/api/chat', '/quiz', '/db', 'A', 10, 'easy'],
    ['Endpoint untuk daftar soal adalah?', '/api/questions', '/api/files', '/assets', '/vite', 'A', 10, 'easy'],
    ['Endpoint untuk membuat room adalah?', '/api/rooms', '/api/docker', '/api/cache', '/api/nginx', 'A', 10, 'normal'],
    ['Kode room harus bersifat?', 'Unik', 'Selalu kosong', 'Sama untuk semua room', 'Password hash', 'A', 10, 'easy'],
    ['Public room dapat?', 'Dilihat di daftar room', 'Tidak punya kode', 'Tidak bisa dimainkan', 'Menghapus user', 'A', 10, 'easy'],
    ['Private room biasanya join lewat?', 'Kode room', 'Leaderboard', 'Docker ps', 'Health check', 'A', 10, 'easy'],
    ['Rename nama pemain dibatasi maksimal?', '1 kali', 'Tidak terbatas', '10 kali', 'Setiap soal', 'A', 10, 'normal'],
    ['Kolom penanda rename sudah dipakai adalah?', 'rename_used', 'role', 'points', 'option_d', 'A', 10, 'normal'],
    ['Sync state replikasi async berarti?', 'Standby mengikuti primary secara asynchronous', 'Tidak ada standby', 'Frontend offline', 'Valkey rusak', 'A', 10, 'hard'],
    ['pg_is_in_recovery bernilai true pada?', 'Standby', 'Frontend', 'Nginx', 'Valkey', 'A', 10, 'hard']
  ];
  const count = await pool.query('SELECT COUNT(*)::int AS total FROM questions');
  if (count.rows[0].total < 50) {
    await pool.query('DELETE FROM questions WHERE question_text LIKE $1', ['%Verify question%']);
    for (const item of bank) {
      await pool.query('INSERT INTO questions (question_text, option_a, option_b, option_c, option_d, correct_option, points, difficulty) SELECT $1,$2,$3,$4,$5,$6,$7,$8 WHERE NOT EXISTS (SELECT 1 FROM questions WHERE question_text = $1)', item);
    }
  }
}

function publicUser(row) {
  if (!row) return null;
  return { id: row.id, username: row.username, display_name: row.display_name || row.username, rename_used: !!row.rename_used, role: row.role || 'user', points: row.points };
}

function getActor(request) {
  const token = request.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

function requireRole(request, reply, allowed) {
  const actor = getActor(request);
  if (!actor) {
    reply.code(401).send({ message: 'missing or invalid token' });
    return null;
  }
  if (!allowed.includes(actor.role)) {
    reply.code(403).send({ message: 'role is not allowed' });
    return null;
  }
  return actor;
}

function generateRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function normalizeQuestionIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => Number(id)).filter(Boolean))].slice(0, 50);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function sanitizeRoom(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    visibility: row.visibility,
    question_ids: safeArray(row.question_ids),
    members: safeArray(row.members),
    host_user_id: row.host_user_id,
    max_players: Number(row.max_players || 4),
    status: row.status || 'waiting',
    created_by: row.created_by,
    created_at: row.created_at,
    started_at: row.started_at
  };
}

async function hydrateRoom(row) {
  const room = sanitizeRoom(row);
  if (!room) return null;

  const ids = [...new Set(room.members.map((member) => Number(member.id)).filter(Boolean))];
  if (!ids.length) return room;

  const users = await pool.query('SELECT id, username, role, display_name, rename_used, points FROM users WHERE id = ANY($1::int[])', [ids]);
  const byId = new Map(users.rows.map((user) => [Number(user.id), publicUser(user)]));
  return {
    ...room,
    members: room.members.map((member) => {
      const fresh = byId.get(Number(member.id));
      return fresh ? { ...member, ...fresh } : member;
    })
  };
}

async function getPublicUser(userId) {
  const result = await pool.query('SELECT id, username, role, display_name, rename_used, points FROM users WHERE id=$1', [userId]);
  return result.rows[0] ? publicUser(result.rows[0]) : null;
}

function normalizeQuestion(body = {}) {
  const correct = String(body.correct_option || body.correctOption || 'A').toUpperCase();
  return {
    question_text: body.question_text || body.questionText || '',
    option_a: body.option_a || body.optionA || '',
    option_b: body.option_b || body.optionB || '',
    option_c: body.option_c || body.optionC || '',
    option_d: body.option_d || body.optionD || '',
    correct_option: ['A', 'B', 'C', 'D'].includes(correct) ? correct : 'A',
    points: Number(body.points || 10),
    difficulty: body.difficulty || 'normal'
  };
}

app.get('/health', async () => ({ service: 'user-service', status: 'ok' }));
app.get('/users/health', async () => ({ service: 'user-service', status: 'ok' }));
app.get('/questions/health', async () => ({ service: 'question-service', status: 'ok' }));

app.post('/users', async (request, reply) => {
  const { username, password } = request.body || {};
  if (!username || !password) return reply.code(400).send({ message: 'username and password are required' });
  const role = ROLES.includes(request.body?.role) ? request.body.role : 'user';
  const hashed = await bcrypt.hash(password, 10);
  try {
    const result = await pool.query('INSERT INTO users (username, password, role, display_name) VALUES ($1, $2, $3, $1) RETURNING id, username, role, display_name, rename_used, points', [username, hashed, role]);
    return reply.code(201).send(publicUser(result.rows[0]));
  } catch (error) {
    if (error.code === '23505') return reply.code(409).send({ message: 'username already exists' });
    throw error;
  }
});

app.get('/users', async (request, reply) => {
  const actor = requireRole(request, reply, ['root_admin', 'admin']);
  if (!actor) return;
  const result = await pool.query('SELECT id, username, role, display_name, rename_used, points, created_at FROM users ORDER BY id ASC');
  return result.rows;
});

app.get('/users/leaderboard', async () => {
  const result = await pool.query('SELECT id, username, display_name, role, points FROM users ORDER BY points DESC, id ASC LIMIT 50');
  return result.rows.map((row, index) => ({
    rank: index + 1,
    userId: row.id,
    username: row.display_name || row.username,
    rawUsername: row.username,
    role: row.role || 'user',
    points: row.points || 0
  }));
});

app.delete('/users/:id', async (request, reply) => {
  const actor = requireRole(request, reply, ['root_admin']);
  if (!actor) return;
  const targetId = Number(request.params.id);
  if (Number(actor.id) === targetId) return reply.code(409).send({ message: 'root admin cannot delete own account' });
  const current = await pool.query('SELECT id, role FROM users WHERE id=$1', [targetId]);
  if (!current.rowCount) return reply.code(404).send({ message: 'user not found' });
  if (current.rows[0].role === 'root_admin') return reply.code(403).send({ message: 'root admin account cannot be deleted' });
  await pool.query('DELETE FROM users WHERE id=$1', [targetId]);
  return { deleted: true, id: targetId };
});

app.get('/users/:id', async (request, reply) => {
  const result = await pool.query('SELECT id, username, role, display_name, rename_used, points FROM users WHERE id = $1', [request.params.id]);
  if (!result.rowCount) return reply.code(404).send({ message: 'user not found' });
  return result.rows[0];
});

app.get('/users/by-username/:username', async (request, reply) => {
  const includePassword = request.query.includePassword === 'true';
  const columns = includePassword ? 'id, username, password, role, display_name, rename_used, points' : 'id, username, role, display_name, rename_used, points';
  const result = await pool.query('SELECT ' + columns + ' FROM users WHERE username = $1', [request.params.username]);
  if (!result.rowCount) return reply.code(404).send({ message: 'user not found' });
  return result.rows[0];
});

app.patch('/users/:id/role', async (request, reply) => {
  const actor = requireRole(request, reply, ['root_admin']);
  if (!actor) return;
  const role = request.body?.role;
  if (!ROLES.includes(role)) return reply.code(400).send({ message: 'invalid role' });
  const result = await pool.query('UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, role, display_name, rename_used, points', [role, request.params.id]);
  if (!result.rowCount) return reply.code(404).send({ message: 'user not found' });
  return result.rows[0];
});

app.patch('/users/:id/points', async (request, reply) => {
  const points = Number(request.body?.points || 0);
  const result = await pool.query('UPDATE users SET points = points + $1 WHERE id = $2 RETURNING id, username, role, display_name, rename_used, points', [points, request.params.id]);
  if (!result.rowCount) return reply.code(404).send({ message: 'user not found' });
  return result.rows[0];
});

app.patch('/users/:id/points/rollback', async (request, reply) => {
  const points = Number(request.body?.points || 0);
  const result = await pool.query('UPDATE users SET points = GREATEST(points - $1, 0) WHERE id = $2 RETURNING id, username, role, display_name, rename_used, points', [points, request.params.id]);
  if (!result.rowCount) return reply.code(404).send({ message: 'user not found' });
  return { rolledBack: true, user: result.rows[0] };
});

app.patch('/users/:id/profile', async (request, reply) => {
  const actor = getActor(request);
  if (!actor) return reply.code(401).send({ message: 'missing or invalid token' });
  const targetId = Number(request.params.id);
  const nextName = String(request.body?.display_name || request.body?.displayName || '').trim();
  if (!nextName || nextName.length > 100) return reply.code(400).send({ message: 'display name is required and max 100 characters' });
  if (actor.id !== targetId && actor.role !== 'root_admin') return reply.code(403).send({ message: 'cannot edit another user profile' });

  const current = await pool.query('SELECT id, username, role, display_name, rename_used, points FROM users WHERE id=$1', [targetId]);
  if (!current.rowCount) return reply.code(404).send({ message: 'user not found' });
  if (current.rows[0].rename_used && actor.role !== 'root_admin') return reply.code(409).send({ message: 'display name can only be changed once' });

  const result = await pool.query('UPDATE users SET display_name=$1, rename_used=true WHERE id=$2 RETURNING id, username, role, display_name, rename_used, points', [nextName, targetId]);
  return publicUser(result.rows[0]);
});

app.get('/rooms', async () => {
  const result = await pool.query("SELECT id, code, title, visibility, question_ids, members, host_user_id, max_players, status, created_by, created_at, started_at FROM quiz_rooms WHERE visibility='public' AND status <> 'closed' ORDER BY created_at DESC");
  return Promise.all(result.rows.map(hydrateRoom));
});

app.post('/rooms', async (request, reply) => {
  const actor = getActor(request);
  if (!actor) return reply.code(401).send({ message: 'missing or invalid token' });
  const title = String(request.body?.title || 'Quiz Room').trim().slice(0, 160);
  const visibility = request.body?.visibility === 'private' ? 'private' : 'public';
  const questionIds = actor.role === 'root_admin' ? normalizeQuestionIds(request.body?.question_ids || request.body?.questionIds) : [];
  const maxPlayers = Math.max(2, Math.min(Number(request.body?.max_players || request.body?.maxPlayers || 4), 8));
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateRoomCode();
    try {
      const result = await pool.query(
        'INSERT INTO quiz_rooms (code, title, visibility, question_ids, members, host_user_id, max_players, status, created_by) VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,$8) RETURNING *',
        [code, title, visibility, JSON.stringify(questionIds), JSON.stringify([]), maxPlayers, 'waiting', actor.id]
      );
      return reply.code(201).send(await hydrateRoom(result.rows[0]));
    } catch (error) {
      if (error.code !== '23505') throw error;
    }
  }
  return reply.code(500).send({ message: 'failed to generate unique room code' });
});

app.get('/rooms/:code', async (request, reply) => {
  const result = await pool.query('SELECT id, code, title, visibility, question_ids, members, host_user_id, max_players, status, created_by, created_at, started_at FROM quiz_rooms WHERE code=$1', [String(request.params.code).toUpperCase()]);
  if (!result.rowCount) return reply.code(404).send({ message: 'room not found' });
  return hydrateRoom(result.rows[0]);
});

app.post('/rooms/:code/join', async (request, reply) => {
  const code = String(request.params.code).toUpperCase();
  const userId = Number(request.body?.userId);
  if (!userId) return reply.code(400).send({ message: 'userId is required' });
  const user = await getPublicUser(userId);
  if (!user) return reply.code(404).send({ message: 'user not found' });

  const current = await pool.query('SELECT * FROM quiz_rooms WHERE code=$1', [code]);
  if (!current.rowCount) return reply.code(404).send({ message: 'room not found' });
  const room = sanitizeRoom(current.rows[0]);
  if (room.status === 'closed') return reply.code(409).send({ message: 'room is closed' });
  if (room.status === 'started' || room.status === 'playing') return { joined: true, room: await hydrateRoom(current.rows[0]) };
  if (!room.members.some((member) => Number(member.id) === user.id) && room.members.length >= room.max_players) {
    return reply.code(409).send({ message: 'room is full' });
  }

  const exists = room.members.some((member) => Number(member.id) === user.id);
  const members = exists ? room.members : [...room.members, { id: user.id, username: user.username, display_name: user.display_name, points: user.points }];
  const hostUserId = room.host_user_id || members[0]?.id || user.id;
  const result = await pool.query('UPDATE quiz_rooms SET members=$1, host_user_id=$2 WHERE code=$3 RETURNING *', [JSON.stringify(members), hostUserId, code]);
  return { joined: true, room: await hydrateRoom(result.rows[0]) };
});

app.post('/rooms/:code/leave', async (request, reply) => {
  const code = String(request.params.code).toUpperCase();
  const userId = Number(request.body?.userId);
  const current = await pool.query('SELECT * FROM quiz_rooms WHERE code=$1', [code]);
  if (!current.rowCount) return reply.code(404).send({ message: 'room not found' });
  const room = sanitizeRoom(current.rows[0]);
  const members = room.members.filter((member) => Number(member.id) !== userId);
  const hostUserId = room.host_user_id === userId ? (members[0]?.id || null) : room.host_user_id;
  const status = members.length ? room.status : 'closed';
  const result = await pool.query('UPDATE quiz_rooms SET members=$1, host_user_id=$2, status=$3 WHERE code=$4 RETURNING *', [JSON.stringify(members), hostUserId, status, code]);
  return { left: true, room: await hydrateRoom(result.rows[0]) };
});

app.post('/rooms/:code/start', async (request, reply) => {
  const actor = getActor(request);
  if (!actor) return reply.code(401).send({ message: 'missing or invalid token' });
  const code = String(request.params.code).toUpperCase();
  const current = await pool.query('SELECT * FROM quiz_rooms WHERE code=$1', [code]);
  if (!current.rowCount) return reply.code(404).send({ message: 'room not found' });
  const room = sanitizeRoom(current.rows[0]);
  if (Number(room.host_user_id) !== Number(actor.id)) return reply.code(403).send({ message: 'only host can start quiz' });
  if (room.members.length < 2) return reply.code(409).send({ message: 'waiting for players' });
  const result = await pool.query("UPDATE quiz_rooms SET status='playing', started_at=CURRENT_TIMESTAMP WHERE code=$1 RETURNING *", [code]);
  return { started: true, room: await hydrateRoom(result.rows[0]) };
});

function normalizeAnswers(value) {
  if (!Array.isArray(value)) return [];
  return value.map((answer) => ({
    questionId: Number(answer.questionId || answer.question_id || answer.id),
    selected: String(answer.selected || '').toUpperCase(),
    elapsedMs: Math.max(0, Number(answer.elapsedMs || answer.elapsed_ms || 0))
  })).filter((answer) => answer.questionId && ['A', 'B', 'C', 'D', ''].includes(answer.selected));
}

async function roomResults(code) {
  const roomResult = await pool.query('SELECT * FROM quiz_rooms WHERE code=$1', [code]);
  if (!roomResult.rowCount) return null;
  const room = await hydrateRoom(roomResult.rows[0]);
  const results = await pool.query('SELECT room_code, user_id, username, score, correct_count, total_questions, elapsed_ms, completed_at FROM quiz_match_results WHERE room_code=$1 ORDER BY score DESC, correct_count DESC, elapsed_ms ASC, completed_at ASC', [code]);
  const resultUserIds = [...new Set(results.rows.map((row) => Number(row.user_id)).filter(Boolean))];
  const usersById = new Map();
  if (resultUserIds.length) {
    const users = await pool.query('SELECT id, username, display_name FROM users WHERE id = ANY($1::int[])', [resultUserIds]);
    for (const user of users.rows) usersById.set(Number(user.id), user.display_name || user.username);
  }
  const ranked = results.rows.map((row, index) => ({ ...row, username: usersById.get(Number(row.user_id)) || row.username, rank: index + 1 }));
  return {
    room,
    expectedPlayers: room.members.length,
    completedPlayers: ranked.length,
    allFinished: room.members.length > 0 && ranked.length >= room.members.length,
    results: ranked
  };
}

app.post('/rooms/:code/results', async (request, reply) => {
  const actor = getActor(request);
  if (!actor) return reply.code(401).send({ message: 'missing or invalid token' });
  const code = String(request.params.code).toUpperCase();
  const userId = Number(request.body?.userId || actor.id);
  if (Number(actor.id) !== userId && actor.role !== 'root_admin') return reply.code(403).send({ message: 'cannot submit another player result' });

  const roomResult = await pool.query('SELECT * FROM quiz_rooms WHERE code=$1', [code]);
  if (!roomResult.rowCount) return reply.code(404).send({ message: 'room not found' });
  const room = await hydrateRoom(roomResult.rows[0]);
  const member = room.members.find((item) => Number(item.id) === userId);
  if (!member) return reply.code(403).send({ message: 'user is not a member of this room' });

  const answers = normalizeAnswers(request.body?.answers);
  const questionIds = [...new Set(answers.map((answer) => answer.questionId))];
  const questionMap = new Map();
  if (questionIds.length) {
    const questionResult = await pool.query('SELECT id, correct_option, points FROM questions WHERE id = ANY($1::int[])', [questionIds]);
    for (const question of questionResult.rows) questionMap.set(Number(question.id), question);
  }

  let score = 0;
  let correctCount = 0;
  const gradedAnswers = answers.map((answer) => {
    const question = questionMap.get(answer.questionId);
    const correct = !!question && answer.selected === question.correct_option;
    if (correct) {
      correctCount += 1;
      score += Number(question.points || 10);
    }
    return { ...answer, correct, correctOption: question?.correct_option || null, points: correct ? Number(question.points || 10) : 0 };
  });
  const elapsedMs = Math.max(0, Number(request.body?.elapsedMs || request.body?.elapsed_ms || Math.max(0, ...answers.map((answer) => answer.elapsedMs || 0))));
  const username = member.display_name || member.username || actor.username;

  await pool.query(
    "INSERT INTO quiz_match_results (room_code, user_id, username, score, correct_count, total_questions, elapsed_ms, answers, completed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP) ON CONFLICT (room_code, user_id) DO UPDATE SET username=EXCLUDED.username, score=EXCLUDED.score, correct_count=EXCLUDED.correct_count, total_questions=EXCLUDED.total_questions, elapsed_ms=EXCLUDED.elapsed_ms, answers=EXCLUDED.answers, completed_at=CURRENT_TIMESTAMP",
    [code, userId, username, score, correctCount, answers.length, elapsedMs, JSON.stringify(gradedAnswers)]
  );

  const aggregate = await roomResults(code);
  return { submitted: true, me: aggregate.results.find((row) => Number(row.user_id) === userId), ...aggregate };
});

app.get('/rooms/:code/results', async (request, reply) => {
  const code = String(request.params.code).toUpperCase();
  const aggregate = await roomResults(code);
  if (!aggregate) return reply.code(404).send({ message: 'room not found' });
  return aggregate;
});

app.get('/questions', async (request) => {
  const limit = Math.max(1, Math.min(Number(request.query.limit || 50), 50));
  const random = request.query.random === 'true';
  const order = random ? 'RANDOM()' : 'id ASC';
  const result = await pool.query(
    'SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, points, difficulty, created_by FROM questions ORDER BY ' + order + ' LIMIT $1',
    [limit]
  );
  return result.rows;
});

app.post('/questions', async (request, reply) => {
  const actor = requireRole(request, reply, ['root_admin', 'admin', 'instructor']);
  if (!actor) return;
  const q = normalizeQuestion(request.body);
  if (!q.question_text || !q.option_a || !q.option_b || !q.option_c || !q.option_d) return reply.code(400).send({ message: 'question and four options are required' });
  const result = await pool.query('INSERT INTO questions (question_text, option_a, option_b, option_c, option_d, correct_option, points, difficulty, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *', [q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option, q.points, q.difficulty, actor.id]);
  return reply.code(201).send(result.rows[0]);
});

app.patch('/questions/:id', async (request, reply) => {
  const actor = requireRole(request, reply, ['root_admin', 'admin', 'instructor']);
  if (!actor) return;
  const q = normalizeQuestion(request.body);
  const result = await pool.query('UPDATE questions SET question_text=$1, option_a=$2, option_b=$3, option_c=$4, option_d=$5, correct_option=$6, points=$7, difficulty=$8 WHERE id=$9 RETURNING *', [q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option, q.points, q.difficulty, request.params.id]);
  if (!result.rowCount) return reply.code(404).send({ message: 'question not found' });
  return result.rows[0];
});

app.delete('/questions/:id', async (request, reply) => {
  const actor = requireRole(request, reply, ['root_admin', 'admin', 'instructor']);
  if (!actor) return;
  const result = await pool.query('DELETE FROM questions WHERE id=$1 RETURNING id', [request.params.id]);
  if (!result.rowCount) return reply.code(404).send({ message: 'question not found' });
  return { deleted: true, id: Number(request.params.id) };
});

const protoText = 'syntax = "proto3"; package user; service UserService { rpc GetUserById (UserIdRequest) returns (UserResponse); rpc ValidateUser (UserIdRequest) returns (ValidateUserResponse); rpc UpdateUserPoint (UpdatePointRequest) returns (UserResponse); } message UserIdRequest { int32 id = 1; } message UpdatePointRequest { int32 id = 1; int32 points = 2; } message UserResponse { int32 id = 1; string username = 2; string role = 3; int32 points = 4; } message ValidateUserResponse { bool valid = 1; int32 id = 2; string username = 3; string role = 4; int32 points = 5; }';
fs.writeFileSync('/tmp/user.proto', protoText);
const packageDefinition = protoLoader.loadSync('/tmp/user.proto', { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
const userProto = grpc.loadPackageDefinition(packageDefinition).user;

async function grpcGetUser(id) {
  const result = await pool.query('SELECT id, username, role, display_name, rename_used, points FROM users WHERE id = $1', [id]);
  return result.rows[0];
}

const grpcServer = new grpc.Server();
grpcServer.addService(userProto.UserService.service, {
  GetUserById: async (call, callback) => {
    const user = await grpcGetUser(call.request.id);
    if (!user) return callback({ code: grpc.status.NOT_FOUND, message: 'user not found' });
    callback(null, publicUser(user));
  },
  ValidateUser: async (call, callback) => {
    const user = await grpcGetUser(call.request.id);
    callback(null, user ? { valid: true, ...publicUser(user) } : { valid: false, id: 0, username: '', role: '', points: 0 });
  },
  UpdateUserPoint: async (call, callback) => {
    const result = await pool.query('UPDATE users SET points = points + $1 WHERE id = $2 RETURNING id, username, role, display_name, rename_used, points', [call.request.points, call.request.id]);
    if (!result.rowCount) return callback({ code: grpc.status.NOT_FOUND, message: 'user not found' });
    callback(null, publicUser(result.rows[0]));
  }
});

await waitForDatabase();
await ensureSchema();
await seedDefaults();
grpcServer.bindAsync('0.0.0.0:' + GRPC_PORT, grpc.ServerCredentials.createInsecure(), () => {
  app.log.info('gRPC User Service running on ' + GRPC_PORT);
});
app.listen({ port: PORT, host: '0.0.0.0' });
