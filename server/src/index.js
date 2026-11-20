// AutoPulse – сервер Node.js/Express: REST API, PostgreSQL, сесії, захист, моніторинг, AI.
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { rateLimit } from 'express-rate-limit';
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { validateOrder, validateAiQuestion } from './validation.js';
import { metricsMiddleware, getMetrics } from './metrics.js';
import { askAssistant, aiConfigured } from './ai.js';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

// ---------- Конфігурація зі змінних середовища (ЛР5) ----------
const isProduction = process.env.NODE_ENV === 'production';
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL відсутній: створіть server/.env.');
  process.exit(1);
}
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error('SESSION_SECRET має містити щонайменше 32 випадкові символи.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 7000, max: 10 });
const app = express();
app.disable('x-powered-by');
if (isProduction) app.set('trust proxy', 1);

// ---------- Базовий захист (ЛР4) ----------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      'default-src': ["'self'"],
      'img-src': ["'self'", 'data:'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'upgrade-insecure-requests': null
    }
  }
}));
app.use(express.json({ limit: '20kb' }));
app.use(metricsMiddleware);

// POST-запити з чужих сайтів відхиляються (Postman без заголовка Origin дозволений).
function checkOrigin(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  const allowed = [process.env.APP_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173',
    'http://localhost:4000', 'http://127.0.0.1:4000'].filter(Boolean);
  const sameHost = origin === `${req.protocol}://${req.get('host')}`;
  if (!allowed.includes(origin) && !sameHost) {
    return res.status(403).json({ error: 'Джерело запиту не дозволене.' });
  }
  next();
}
app.use('/api', checkOrigin);

// ---------- Сесії у PostgreSQL (ЛР3–ЛР4) ----------
const PgStore = connectPgSimple(session);
app.use('/api', session({
  store: new PgStore({ pool, createTableIfMissing: true, pruneSessionInterval: 15 * 60 }),
  name: 'autopulse.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: isProduction, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 }
}));

const ordersLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Забагато запитів. Спробуйте пізніше.' }
});
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Забагато запитань до консультанта. Спробуйте через кілька хвилин.' }
});
app.use('/api/orders', ordersLimiter);
app.use('/api/ai', aiLimiter);

// ---------- REST API ----------
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', service: 'autopulse' });
  } catch {
    res.status(503).json({ status: 'error', database: 'unavailable', service: 'autopulse' });
  }
});

app.get('/api/products', async (req, res, next) => {
  try {
    const params = [];
    let where = '';
    if (typeof req.query.category === 'string' && req.query.category) {
      params.push(req.query.category);
      where = 'WHERE category = $1';
    }
    const { rows } = await pool.query(
      `SELECT id, slug, title, brand, category, description, price_uah, stock, image_key
       FROM products ${where} ORDER BY position, id`, params);
    res.json({ products: rows });
  } catch (e) { next(e); }
});

app.get('/api/products/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id)) return res.status(400).json({ error: 'Некоректний ідентифікатор.' });
    const { rows } = await pool.query(
      'SELECT id, slug, title, brand, category, description, price_uah, stock, image_key FROM products WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Товар не знайдено.' });
    res.json({ product: rows[0] });
  } catch (e) { next(e); }
});

app.get('/api/session', (req, res) => {
  req.session.visits = (req.session.visits || 0) + 1;
  res.json({ visits: req.session.visits, trackedOrders: req.session.orderIds?.length || 0 });
});

app.post('/api/orders', async (req, res, next) => {
  const check = validateOrder(req.body);
  if (!check.valid) {
    return res.status(422).json({ error: 'Некоректні дані форми.', details: check.errors });
  }
  const o = check.value;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: found } = await client.query(
      'SELECT id, title, price_uah, stock FROM products WHERE id = $1 FOR UPDATE', [o.productId]);
    if (!found.length) {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: 'Товар не знайдено.', details: { productId: 'Невідомий товар.' } });
    }
    const product = found[0];
    if (product.stock < o.quantity) {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: 'Недостатньо товару на складі.',
        details: { quantity: `Доступно лише ${product.stock} шт.` } });
    }
    const reference = `AP-${randomBytes(4).toString('hex').toUpperCase()}`;
    const total = product.price_uah * o.quantity;
    const { rows } = await client.query(
      `INSERT INTO orders (reference, product_id, quantity, client_name, client_phone, city, delivery, vin, comment, total_uah)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, reference, status, total_uah`,
      [reference, product.id, o.quantity, o.name, o.phone, o.city, o.delivery, o.vin, o.comment, total]);
    await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [o.quantity, product.id]);
    await client.query('COMMIT');

    const previous = req.session.orderIds || [];
    req.session.orderIds = [...previous.slice(-9), String(rows[0].id)];
    res.status(201).json({
      message: 'Демонстраційне замовлення збережено. Менеджер не телефонуватиме – це навчальний проєкт.',
      reference: rows[0].reference,
      status: rows[0].status,
      total_uah: rows[0].total_uah
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally {
    client.release();
  }
});

app.get('/api/orders/mine', async (req, res, next) => {
  try {
    const ids = (req.session.orderIds || []).map(Number).filter(Number.isSafeInteger);
    if (!ids.length) return res.json({ orders: [] });
    const { rows } = await pool.query(
      `SELECT o.reference, p.title AS product, o.quantity, o.total_uah, o.city, o.delivery,
              o.status, o.created_at
       FROM orders o JOIN products p ON p.id = o.product_id
       WHERE o.id = ANY($1::bigint[]) ORDER BY o.created_at DESC LIMIT 10`, [ids]);
    res.json({ orders: rows });
  } catch (e) { next(e); }
});

// ---------- Моніторинг (ЛР5) ----------
app.get('/api/metrics', (req, res) => {
  const token = process.env.METRICS_TOKEN;
  if (!token || token.length < 16 || req.get('X-Monitor-Token') !== token) {
    return res.status(403).json({ error: 'Доступ заборонено.' });
  }
  res.json(getMetrics());
});

// ---------- AI-консультант (ЛР6) ----------
app.post('/api/ai/consult', async (req, res) => {
  const parsed = validateAiQuestion(req.body);
  if (!parsed.valid) return res.status(422).json({ error: parsed.error });
  if (!aiConfigured()) {
    return res.status(503).json({ error: 'AI-консультант недоступний: API-ключ не налаштовано.' });
  }
  try {
    const { rows: catalog } = await pool.query(
      'SELECT title, brand, category, price_uah, stock FROM products ORDER BY position, id');
    const started = Date.now();
    const { answer, provider } = await askAssistant(catalog, parsed.question);
    console.log(`[AI] ${provider}: відповідь за ${Date.now() - started} мс`);
    res.json({ answer });
  } catch (err) {
    console.error('[AI] помилка сервісу:', err.status || err.name, err.message);
    const status = err.status === 429 ? 503 : 502;
    res.status(status).json({ error: 'Не вдалося отримати відповідь AI-сервісу. Спробуйте пізніше.' });
  }
});

// ---------- OpenAPI-специфікація (ЛР3) ----------
app.get('/openapi.yaml', async (req, res, next) => {
  try {
    const yaml = await readFile(new URL('../openapi.yaml', import.meta.url), 'utf8');
    res.type('application/yaml').send(yaml);
  } catch (e) { next(e); }
});

// ---------- Зібраний React-клієнт у production (ЛР5) ----------
const dist = resolve('client/dist');
if (existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1d', index: false }));
  app.get('/{*path}', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/openapi.yaml') return next();
    res.sendFile(resolve(dist, 'index.html'));
  });
}

app.use((req, res) => res.status(404).json({ error: 'Маршрут не знайдено.' }));
app.use((error, req, res, next) => {
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Надто великий запит.' });
  if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: 'Некоректний JSON.' });
  console.error('Server error:', error.message);
  res.status(500).json({ error: 'Внутрішня помилка сервера.' });
});

const port = Number(process.env.PORT || 4000);
const server = app.listen(port, '0.0.0.0', () => console.log(`AutoPulse API: http://localhost:${port}`));
process.on('SIGTERM', () => server.close(() => pool.end().then(() => process.exit(0))));
