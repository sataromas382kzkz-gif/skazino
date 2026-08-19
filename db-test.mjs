import 'dotenv/config';
import { createPool } from '@vercel/postgres';

const pool = createPool({ connectionString: process.env.POSTGRES_URL });
try {
  const r = await pool.sql`select 1 as ok`;
  console.log('CONNECT OK:', JSON.stringify(r.rows));
} catch (e) {
  console.log('CONN ERR:', e.message);
  console.log('CAUSE:', (e.cause && (e.cause.message || e.cause)) || e.cause);
  console.log('CODE:', e.code || '-');
} finally {
  process.exit(0);
}