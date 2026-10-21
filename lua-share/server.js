import express from 'express';
import { nanoid } from 'nanoid';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ===== DB =====
if (!fs.existsSync('./data')) fs.mkdirSync('./data');
const db = new Database('./data/lua.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS snippets (
    id TEXT PRIMARY KEY,
    title TEXT,
    code TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    views INTEGER DEFAULT 0,
    is_private INTEGER DEFAULT 0,
    password_hash TEXT
  );
`);

const app = express();
app.use(express.json({ limit: '2mb' }));

// ===== API: tạo snippet =====
app.post('/api/snippets', (req, res) => {
  const { title = 'untitled', code, isPrivate = false, password } = req.body;
  if (!code || code.length > 1_000_000)
    return res.status(400).json({ error: 'Code rỗng hoặc quá lớn' });

  const id = nanoid(10);
  const hash = password
    ? crypto.createHash('sha256').update(password).digest('hex')
    : null;

  db.prepare(
    `INSERT INTO snippets (id, title, code, is_private, password_hash)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, title, code, isPrivate ? 1 : 0, hash);

  res.json({ id, rawUrl: `/raw/${id}`, viewUrl: `/s/${id}` });
});

// ===== API: lấy snippet =====
app.get('/api/snippets/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM snippets WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Không tìm thấy' });

  if (row.is_private) {
    const pw = req.query.pw || '';
    const hash = crypto.createHash('sha256').update(pw).digest('hex');
    if (hash !== row.password_hash)
      return res.status(403).json({ error: 'Cần mật khẩu' });
  }

  db.prepare('UPDATE snippets SET views = views + 1 WHERE id = ?').run(row.id);
  res.json({ id: row.id, title: row.title, code: row.code, views: row.views + 1 });
});

// ===== RAW endpoint =====
app.get('/raw/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM snippets WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).type('text/plain').send('-- not found');

  if (row.is_private) {
    const pw = req.query.pw || '';
    const hash = crypto.createHash('sha256').update(pw).digest('hex');
    if (hash !== row.password_hash)
      return res.status(403).type('text/plain').send('-- forbidden');
  }

  res.type('text/plain; charset=utf-8').send(row.code);
});

// ===== Trang chủ + trang xem (cùng 1 file index.html) =====
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/s/:id', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(3000, () => console.log('http://localhost:3000'));
