import { pool } from './db.js';

async function run(name, sql) {
  try {
    const { rows } = await pool.query(sql);
    const n = Object.values(rows[0] || {})[0];
    if (n) console.log(`[job] ${name}: ${n}`);
  } catch (e) {
    console.error(`[job] ${name} failed:`, e.message);
  }
}

/** Background jobs: recurring tasks + reminders. Run as the DB owner (server-internal). */
export function startJobs() {
  const tick = async () => {
    await run('recurring tasks', 'select app.spawn_recurring_tasks()');
    await run('reminders', 'select app.generate_reminders()');
    await run('group transfers applied', 'select app.apply_group_transfers()');
    await run('leave balance alerts', 'select app.leave_balance_alerts()');
    await pool.query('delete from sessions where expires_at < now()').catch(() => {});
  };
  setTimeout(tick, 5000);
  setInterval(tick, Number(process.env.JOB_INTERVAL_MIN || 15) * 60000);
}
