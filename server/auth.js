import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import { pool, asOwner, withUser } from './db.js';
import { HttpError } from './errors.js';

const COOKIE = 'opsid';
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 7);
const isProd = process.env.NODE_ENV === 'production';
// Secure cookies need HTTPS. Set COOKIE_SECURE=false only while serving over plain HTTP (e.g. http://IP:3100).
const secureCookie = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProd;

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

export function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 10) return 'كلمة المرور يجب ألا تقل عن 10 أحرف';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'كلمة المرور يجب أن تحتوي على أحرف وأرقام';
  return null;
}
export const hashPassword = (pw) => bcrypt.hash(pw, 12);
const normEmail = (e) => String(e || '').trim().toLowerCase();
const emailOk = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 200;

async function createSession(res, userId, req) {
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query(
    `insert into sessions(token_hash, user_id, expires_at, user_agent, ip) values ($1, $2, now() + ($3 || ' days')::interval, $4, $5)`,
    [sha(token), userId, String(SESSION_DAYS), String(req.headers['user-agent'] || '').slice(0, 300), req.ip]
  );
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: secureCookie, maxAge: SESSION_DAYS * 86400000, path: '/' });
}

/** Attach req.user from the session cookie (no error when absent). */
export async function sessionMiddleware(req, _res, next) {
  try {
    const token = req.cookies?.[COOKIE];
    if (token) {
      const { rows } = await pool.query(
        `select u.id, u.full_name, u.email from sessions s join users u on u.id = s.user_id
         where s.token_hash = $1 and s.expires_at > now() and u.is_active and u.archived_at is null`,
        [sha(token)]
      );
      if (rows[0]) req.user = rows[0];
    }
    next();
  } catch (e) {
    next(e);
  }
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'يجب تسجيل الدخول أولًا', 'unauthenticated'));
  next();
}

/** Simple in-memory brute-force protection for login. */
const attempts = new Map();
function throttle(key) {
  const now = Date.now();
  const a = attempts.get(key) || { n: 0, until: 0, first: now };
  if (a.until > now) throw new HttpError(429, 'محاولات كثيرة. حاول مرة أخرى بعد عدة دقائق.', 'throttled');
  return a;
}
function fail(key, a) {
  a.n += 1;
  if (a.n >= 5) { a.until = Date.now() + 10 * 60000; a.n = 0; }
  attempts.set(key, a);
}

export async function loadMe(userId) {
  return withUser(userId, async (c) => {
    const u = (await c.query(`select id, email, full_name, employee_id, last_login_at from users where id = app.uid()`)).rows[0];
    const roles = (await c.query(`select role from user_roles where user_id = app.uid()`)).rows.map((r) => r.role);
    const perms = (await c.query(
      `select distinct p.key from user_roles ur join roles r on r.key = ur.role join role_permissions rp on rp.role_id = r.id
       join permissions p on p.id = rp.permission_id where ur.user_id = app.uid()`)).rows.map((r) => r.key);
    const employee = u.employee_id
      ? (await c.query(`select id, employee_number, full_name, job_title, primary_site_id, shift_id, site_name, shift_name from v_employees where id = $1`, [u.employee_id])).rows[0] || null
      : null;
    const supervisedSites = (await c.query(`select unnest(app.supervised_site_ids()) id`)).rows.map((r) => r.id);
    const unread = (await c.query(`select count(*)::int n from notifications where user_id = app.uid() and read_at is null`)).rows[0].n;
    return { user: u, roles, permissions: perms, employee, supervisedSites, unreadNotifications: unread };
  });
}

export const authRouter = express.Router();

authRouter.post('/signup', async (req, res, next) => {
  try {
    if (process.env.ALLOW_SIGNUP === 'false') throw new HttpError(403, 'التسجيل الذاتي غير مفعل. اطلب من مدير النظام إنشاء حسابك.');
    const email = normEmail(req.body?.email);
    const fullName = String(req.body?.full_name || '').trim();
    const password = req.body?.password;
    if (!emailOk(email)) throw new HttpError(400, 'البريد الإلكتروني غير صحيح');
    if (fullName.length < 2 || fullName.length > 150) throw new HttpError(400, 'الاسم الكامل مطلوب');
    const pwErr = validatePassword(password);
    if (pwErr) throw new HttpError(400, pwErr);
    const hash = await hashPassword(password);
    const result = await asOwner(async (c) => {
      // serialise the "first admin" decision
      await c.query('select pg_advisory_xact_lock(424242)');
      const exists = (await c.query('select 1 from users where lower(email) = $1', [email])).rowCount;
      if (exists) throw new HttpError(409, 'يوجد حساب مسجل بهذا البريد');
      const id = (await c.query(`insert into users(email, password_hash, full_name) values ($1, $2, $3) returning id`, [email, hash, fullName])).rows[0].id;
      const hasAdmin = (await c.query(
        `select 1 from user_roles ur join users u on u.id = ur.user_id where ur.role = 'system_admin' and u.is_active and u.archived_at is null limit 1`)).rowCount;
      let firstAdmin = false;
      if (!hasAdmin && process.env.FIRST_USER_IS_ADMIN !== 'false') {
        await c.query("select set_config('app.reason', 'أول مستخدم في النظام: منح دور مدير النظام تلقائيًا', true)");
        await c.query(`insert into user_roles(user_id, role) values ($1, 'system_admin')`, [id]);
        firstAdmin = true;
      }
      return { id, firstAdmin };
    });
    await createSession(res, result.id, req);
    res.status(201).json({ ok: true, firstAdmin: result.firstAdmin });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const email = normEmail(req.body?.email);
    const key = `${email}|${req.ip}`;
    const a = throttle(key);
    const { rows } = await pool.query(`select id, password_hash, is_active, archived_at from users where lower(email) = $1`, [email]);
    const u = rows[0];
    const ok = u && (await bcrypt.compare(String(req.body?.password || ''), u.password_hash));
    if (!ok) { fail(key, a); throw new HttpError(401, 'البريد الإلكتروني أو كلمة المرور غير صحيحة'); }
    if (!u.is_active || u.archived_at) throw new HttpError(403, 'الحساب موقوف. تواصل مع مدير النظام.');
    attempts.delete(key);
    await pool.query('update users set last_login_at = now() where id = $1', [u.id]);
    await createSession(res, u.id, req);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/logout', async (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (token) await pool.query('delete from sessions where token_hash = $1', [sha(token)]).catch(() => {});
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    res.json(await loadMe(req.user.id));
  } catch (e) {
    next(e);
  }
});

authRouter.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body || {};
    const u = (await pool.query('select password_hash from users where id = $1', [req.user.id])).rows[0];
    if (!(await bcrypt.compare(String(current_password || ''), u.password_hash))) throw new HttpError(400, 'كلمة المرور الحالية غير صحيحة');
    const err = validatePassword(new_password);
    if (err) throw new HttpError(400, err);
    const hash = await hashPassword(new_password);
    await asOwner(async (c) => {
      await c.query('update users set password_hash = $1 where id = $2', [hash, req.user.id]);
      await c.query('delete from sessions where user_id = $1', [req.user.id]);
    }, req.user.id);
    await createSession(res, req.user.id, req);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
