// Apply SQL migrations in order (idempotent). Usage:
//   node server/migrate.js             → schema + base data
//   node server/migrate.js --seed-demo → also load clearly-marked demo data
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../db');

async function main() {
  const c = await pool.connect();
  try {
    await c.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
    await c.query('revoke all on schema_migrations from public');
    const done = new Set((await c.query('select name from schema_migrations')).rows.map((r) => r.name));
    const files = fs.readdirSync(path.join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      if (done.has(f)) continue;
      process.stdout.write(`applying ${f} ... `);
      await c.query('begin');
      try {
        await c.query(fs.readFileSync(path.join(root, 'migrations', f), 'utf8'));
        await c.query('insert into schema_migrations(name) values ($1)', [f]);
        await c.query('commit');
        console.log('ok');
      } catch (e) {
        await c.query('rollback');
        console.error('FAILED\n', e.message);
        process.exitCode = 1;
        return;
      }
    }
    if (process.argv.includes('--seed-demo')) {
      if (done.has('seed:demo') || (await c.query("select 1 from schema_migrations where name = 'seed:demo'")).rowCount) {
        console.log('demo data already loaded');
      } else {
        process.stdout.write('loading demo data ... ');
        await c.query('begin');
        await c.query(fs.readFileSync(path.join(root, 'seed', 'demo.sql'), 'utf8'));
        await c.query("insert into schema_migrations(name) values ('seed:demo')");
        await c.query('commit');
        console.log('ok');
      }
    }
    console.log('database is up to date');
  } finally {
    c.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
