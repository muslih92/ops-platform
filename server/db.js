import pg from 'pg';

// Return DATE columns as plain 'YYYY-MM-DD' strings (no timezone shifting)
pg.types.setTypeParser(1082, (v) => v);
// int8 (counts) as numbers
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres@localhost:5432/ops',
  max: Number(process.env.DB_POOL_MAX || 15),
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: process.env.DATABASE_SSL_STRICT !== 'false' } : undefined,
});

pool.on('connect', (client) => {
  client.query("set timezone = 'Asia/Riyadh'").catch(() => {});
});

/**
 * Run `fn` inside a transaction as the restricted `app_user` role with the
 * caller's identity in `app.user_id`. Every query is subject to RLS.
 */
export async function withUser(userId, fn, { reason } = {}) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('set local role app_user');
    await client.query("select set_config('app.user_id', $1, true), set_config('app.reason', $2, true)", [userId || '', reason || '']);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Privileged transaction (server-internal use only: auth, jobs, migrations). */
export async function asOwner(fn, userId) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    if (userId) await client.query("select set_config('app.user_id', $1, true)", [userId]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Arrays of custom enum types (e.g. site_type[]) arrive as "{a,b}" strings; parse them like text[]. */
export async function registerEnumArrayParsers() {
  const textArray = pg.types.getTypeParser(1009);
  const { rows } = await pool.query(`select typarray from pg_type where typtype = 'e' and typarray <> 0`);
  for (const r of rows) pg.types.setTypeParser(r.typarray, textArray);
}
