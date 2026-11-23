// Safe way to create (or promote) a system administrator from the server console.
// Usage: node server/scripts/create-admin.js admin@example.com "الاسم الكامل"
// The password is read from the ADMIN_PASSWORD env var or prompted (never passed on the command line).
import readline from 'node:readline';
import { pool } from '../db.js';
import { hashPassword, validatePassword } from '../auth.js';

const [email, ...nameParts] = process.argv.slice(2);
const fullName = nameParts.join(' ') || 'مدير النظام';
if (!email) {
  console.error('Usage: npm run create-admin -- <email> "<full name>"');
  process.exit(1);
}

async function askPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => { if (s.includes('Password')) rl.output.write(s); };
  const pw = await new Promise((r) => rl.question('Password (min 10 chars, letters + digits): ', r));
  rl.close();
  console.log();
  return pw;
}

const pw = await askPassword();
const err = validatePassword(pw);
if (err) { console.error(err); process.exit(1); }
const hash = await hashPassword(pw);
const c = await pool.connect();
try {
  await c.query('begin');
  await c.query("select set_config('app.reason', 'إنشاء مدير نظام من وحدة تحكم الخادم', true)");
  const id = (await c.query(
    `insert into users(email, password_hash, full_name) values (lower($1), $2, $3)
     on conflict (email) do update set password_hash = excluded.password_hash, is_active = true, archived_at = null
     returning id`, [email, hash, fullName])).rows[0].id;
  await c.query(`insert into user_roles(user_id, role) values ($1, 'system_admin') on conflict do nothing`, [id]);
  await c.query('commit');
  console.log(`system administrator ready: ${email}`);
} catch (e) {
  await c.query('rollback');
  console.error(e.message);
  process.exitCode = 1;
} finally {
  c.release();
  await pool.end();
}
