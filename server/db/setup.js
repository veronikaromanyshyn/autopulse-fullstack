// Ініціалізація бази: виконує schema.sql і seed.sql (npm run db:setup).
import dotenv from 'dotenv';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL не задано. Створіть server/.env на основі server/.env.example.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
try {
  for (const file of ['schema.sql', 'seed.sql']) {
    const sql = await readFile(new URL(file, import.meta.url), 'utf8');
    await pool.query(sql);
    console.log(`OK: ${file}`);
  }
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM products');
  console.log(`База AutoPulse готова. Товарів у каталозі: ${rows[0].count}`);
} catch (err) {
  console.error('Помилка ініціалізації БД:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
