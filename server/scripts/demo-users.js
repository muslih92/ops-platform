// Creates DEMO login accounts (one per role) linked to demo employees, for trying the platform.
// Usage: DEMO_PASSWORD='Demo-Pass-2026' node server/scripts/demo-users.js
// Never run this in production; remove the accounts by archiving them in "إدارة المستخدمين".
import { pool } from '../db.js';
import { hashPassword, validatePassword } from '../auth.js';

const pw = process.env.DEMO_PASSWORD;
if (!pw || validatePassword(pw)) {
  console.error('Set DEMO_PASSWORD (min 10 chars, letters + digits).');
  process.exit(1);
}
const hash = await hashPassword(pw);
const accounts = [
  { email: 'ops.manager@demo.local', name: 'مدير تشغيل (تجريبي)', role: 'operations_manager', emp: null },
  { email: 'supervisor@demo.local', name: 'مشرف موقع (تجريبي)', role: 'site_supervisor', emp: 'DEMO-009', sites: ['PS1', 'PS2', 'PS3', 'HPT'] },
  { email: 'employee@demo.local', name: 'موظف تجريبي 10', role: 'employee', emp: 'DEMO-010' },
  { email: 'cr.employee@demo.local', name: 'موظف تجريبي 02', role: 'employee', emp: 'DEMO-002' },
  { email: 'reports@demo.local', name: 'قارئ تقارير (تجريبي)', role: 'report_viewer', emp: null },
];
const c = await pool.connect();
try {
  await c.query('begin');
  for (const a of accounts) {
    const empId = a.emp ? (await c.query('select id from employees where employee_number = $1', [a.emp])).rows[0]?.id : null;
    const id = (await c.query(
      `insert into users(email, password_hash, full_name, employee_id) values ($1, $2, $3, $4)
       on conflict (email) do update set password_hash = excluded.password_hash, employee_id = excluded.employee_id returning id`,
      [a.email, hash, a.name, empId])).rows[0].id;
    await c.query('insert into user_roles(user_id, role) values ($1, $2) on conflict do nothing', [id, a.role]);
    for (const code of a.sites || []) {
      await c.query('insert into supervisor_sites(user_id, site_id) select $1, id from sites where code = $2 on conflict do nothing', [id, code]);
    }
    console.log(`${a.role.padEnd(20)} ${a.email}`);
  }
  await c.query('commit');
} catch (e) {
  await c.query('rollback');
  console.error(e.message);
  process.exitCode = 1;
} finally {
  c.release();
  await pool.end();
}
