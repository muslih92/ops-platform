import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { pool, withUser, asOwner } from './db.js';
import { HttpError } from './errors.js';
import { hashPassword, validatePassword } from './auth.js';

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');
fs.mkdirSync(path.join(UPLOAD_DIR, 'files'), { recursive: true });
fs.mkdirSync(path.join(UPLOAD_DIR, 'branding'), { recursive: true });

const MAX_MB = Number(process.env.MAX_UPLOAD_MB || 15);
const ALLOWED = /^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/plain|text\/csv|application\/vnd\.openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document|presentationml\.presentation)|application\/vnd\.ms-excel|application\/msword)$/;
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(UPLOAD_DIR, 'files'),
    filename: (_req, _f, cb) => cb(null, crypto.randomUUID()),
  }),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(ALLOWED.test(file.mimetype) ? null : new HttpError(400, 'نوع الملف غير مسموح. المسموح: صور، PDF، Word، Excel، نص'), ALLOWED.test(file.mimetype)),
});
const logoUpload = multer({
  storage: multer.diskStorage({ destination: path.join(UPLOAD_DIR, 'branding'), filename: (_r, f, cb) => cb(null, 'logo-' + Date.now() + ({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }[f.mimetype] || '')) }),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(/^image\/(png|jpeg|webp)$/.test(file.mimetype) ? null : new HttpError(400, 'الشعار يجب أن يكون صورة PNG أو JPG أو WEBP'), true),
});

export const api = express.Router();

// ---------------------------------------------------------------------
// RPC (whitelisted database functions; arguments in a fixed order)
// ---------------------------------------------------------------------
const RPC = {
  dashboard: { args: ['site_id:uuid', 'shift_id:uuid', 'from:date', 'to:date'], returns: 'scalar' },
  coverage_overview: { args: ['date:date', 'site_id:uuid'], returns: 'rows' },
  skill_coverage: { args: ['site_id:uuid', 'date:date'], returns: 'rows' },
  leave_impact: { args: ['employee_id:uuid', 'start_date:date', 'end_date:date', 'exclude_id:uuid'], returns: 'scalar' },
  leave_transition: { args: ['id:uuid', 'to:leave_status', 'note:text', 'override:boolean', 'override_reason:text'], returns: 'scalar' },
  create_task: { args: ['task:jsonb', 'assignees:uuid[]'], returns: 'scalar' },
  handover_confirm: { args: ['report_id:uuid', 'side:text'], returns: 'scalar' },
  handover_item_to_task: { args: ['item_id:uuid', 'title:text', 'owner_employee_id:uuid', 'due_at:timestamptz', 'priority:task_priority'], returns: 'scalar' },
  update_my_profile: { args: ['profile:jsonb'], returns: 'scalar' },
  set_recommendation: { args: ['employee_id:uuid', 'text:text'], returns: 'scalar' },
  plan_employee_comment: { args: ['plan_id:uuid', 'comment:text'], returns: 'scalar' },
  review_acknowledge: { args: ['review_id:uuid', 'comment:text'], returns: 'scalar' },
  rotation_calendar: { args: ['from:date', 'to:date'], returns: 'rows' },
  duty_roster: { args: ['date:date'], returns: 'rows' },
  employee_schedule: { args: ['employee_id:uuid', 'from:date', 'to:date'], returns: 'rows' },
  rotation_decide: { args: ['kind:text', 'id:uuid', 'decision:rotation_status', 'note:text'], returns: 'scalar' },
  leave_balance_report: { args: ['year:int', 'site_id:uuid'], returns: 'rows' },
  close_leave_year: { args: ['year:int'], returns: 'scalar' },
  resolve_employee_refs: { args: ['refs:jsonb'], returns: 'scalar' },
  rotation_dashboard: { args: ['site_id:uuid'], returns: 'scalar' },
};

api.post('/rpc/:fn', async (req, res, next) => {
  try {
    const def = RPC[req.params.fn];
    if (!def) throw new HttpError(404, 'العملية غير معروفة');
    const body = req.body || {};
    const values = def.args.map((a) => {
      const [name, type] = a.split(':');
      let v = body[name];
      if (v === '' || v === undefined) v = null;
      if (type === 'jsonb' && v !== null) v = JSON.stringify(v);
      return { v, type };
    });
    // drop trailing nulls so SQL defaults apply
    while (values.length && values[values.length - 1].v === null) values.pop();
    const sql = def.returns === 'rows'
      ? `select * from app.${req.params.fn}(${values.map((x, i) => `$${i + 1}::${x.type}`).join(', ')})`
      : `select app.${req.params.fn}(${values.map((x, i) => `$${i + 1}::${x.type}`).join(', ')}) as result`;
    const out = await withUser(req.user.id, async (c) => (await c.query(sql, values.map((x) => x.v))).rows);
    res.json(def.returns === 'rows' ? out : { result: out[0]?.result ?? null });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------
api.post('/files', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new HttpError(400, 'لم يتم اختيار ملف');
    const { entity_type, entity_id } = req.body;
    const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8').slice(0, 200);
    const row = await withUser(req.user.id, async (c) => (await c.query(
      `insert into attachments(entity_type, entity_id, file_name, storage_path, mime_type, size_bytes, uploaded_by)
       values ($1, $2, $3, $4, $5, $6, app.uid()) returning id, file_name, mime_type, size_bytes, created_at`,
      [entity_type, entity_id, name, req.file.filename, req.file.mimetype, req.file.size])).rows[0]);
    res.status(201).json(row);
  } catch (e) {
    if (req.file) fs.unlink(req.file.path, () => {});
    next(e);
  }
});

api.get('/files/:id', async (req, res, next) => {
  try {
    const row = await withUser(req.user.id, async (c) =>
      (await c.query(`select file_name, storage_path, mime_type from attachments where id::text = $1 and archived_at is null`, [req.params.id])).rows[0]);
    if (!row) throw new HttpError(404, 'الملف غير موجود أو ليست لديك صلاحية عليه');
    const p = path.join(UPLOAD_DIR, 'files', path.basename(row.storage_path));
    if (!fs.existsSync(p)) throw new HttpError(404, 'الملف غير متوفر على الخادم');
    res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const inline = /^(image\/|application\/pdf)/.test(row.mime_type || '') && req.query.download !== '1';
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.file_name)}`);
    fs.createReadStream(p).pipe(res);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------
// Users administration (password handling stays on the server)
// ---------------------------------------------------------------------
async function requirePerm(userId, key) {
  const ok = await withUser(userId, async (c) => (await c.query('select app.has_perm($1) ok', [key])).rows[0].ok);
  if (!ok) throw new HttpError(403, 'ليست لديك صلاحية لتنفيذ هذا الإجراء');
}

api.post('/admin/users', async (req, res, next) => {
  try {
    await requirePerm(req.user.id, 'users.manage');
    const email = String(req.body?.email || '').trim().toLowerCase();
    const fullName = String(req.body?.full_name || '').trim();
    const roles = Array.isArray(req.body?.roles) ? req.body.roles : [];
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'البريد الإلكتروني غير صحيح');
    if (fullName.length < 2) throw new HttpError(400, 'الاسم مطلوب');
    const pwErr = validatePassword(req.body?.password);
    if (pwErr) throw new HttpError(400, pwErr);
    const hash = await hashPassword(req.body.password);
    const id = await asOwner(async (c) => {
      const uid = (await c.query(`insert into users(email, password_hash, full_name, employee_id, created_by) values ($1, $2, $3, $4, $5) returning id`,
        [email, hash, fullName, req.body?.employee_id || null, req.user.id])).rows[0].id;
      for (const r of roles) await c.query('insert into user_roles(user_id, role, created_by) values ($1, $2::app_role, $3)', [uid, r, req.user.id]);
      return uid;
    }, req.user.id);
    res.status(201).json({ id });
  } catch (e) { next(e); }
});

api.post('/admin/users/:id/password', async (req, res, next) => {
  try {
    await requirePerm(req.user.id, 'users.manage');
    const pwErr = validatePassword(req.body?.password);
    if (pwErr) throw new HttpError(400, pwErr);
    const hash = await hashPassword(req.body.password);
    await asOwner(async (c) => {
      await c.query("select set_config('app.reason', 'إعادة تعيين كلمة المرور', true)");
      const n = (await c.query('update users set password_hash = $1 where id = $2', [hash, req.params.id])).rowCount;
      if (!n) throw new HttpError(404, 'المستخدم غير موجود');
      await c.query('delete from sessions where user_id = $1', [req.params.id]);
    }, req.user.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------
// Employees import (preview & column validation happen in the browser;
// the server validates again and writes everything in one transaction)
// ---------------------------------------------------------------------
api.post('/import/employees', async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length || rows.length > 2000) throw new HttpError(400, 'عدد الصفوف يجب أن يكون بين 1 و2000');
    const result = await withUser(req.user.id, async (c) => {
      const sites = new Map((await c.query('select id, code from sites where archived_at is null')).rows.map((s) => [s.code.toUpperCase(), s.id]));
      const shifts = (await c.query('select id, code, site_id from shifts where archived_at is null')).rows;
      const depts = new Map((await c.query('select id, name from departments where archived_at is null')).rows.map((d) => [d.name.trim(), d.id]));
      const errors = [];
      let inserted = 0, updated = 0;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const line = i + 2;
        const num = String(r.employee_number || '').trim();
        const name = String(r.full_name || '').trim();
        if (!num || !name) { errors.push({ line, error: 'الرقم الوظيفي والاسم مطلوبان' }); continue; }
        const siteId = r.site_code ? sites.get(String(r.site_code).trim().toUpperCase()) : null;
        if (r.site_code && !siteId) { errors.push({ line, error: `رمز الموقع غير موجود أو غير مصرح: ${r.site_code}` }); continue; }
        const shiftId = r.shift_code ? shifts.find((s) => s.code === String(r.shift_code).trim() && (!siteId || s.site_id === siteId || !s.site_id))?.id : null;
        if (r.shift_code && !shiftId) { errors.push({ line, error: `رمز الوردية غير موجود للموقع: ${r.shift_code}` }); continue; }
        const deptId = r.department ? depts.get(String(r.department).trim()) : null;
        const hire = r.hire_date ? String(r.hire_date).slice(0, 10) : null;
        if (hire && !/^\d{4}-\d{2}-\d{2}$/.test(hire)) { errors.push({ line, error: 'تاريخ التعيين يجب أن يكون بصيغة YYYY-MM-DD' }); continue; }
        await c.query('savepoint imp');
        try {
          const up = await c.query(
            `insert into employees(employee_number, full_name, job_title, department_id, primary_site_id, shift_id, hire_date, status)
             values ($1, $2, $3, $4, $5, $6, $7, coalesce($8::employee_status, 'active'))
             on conflict (employee_number) do update set full_name = excluded.full_name, job_title = coalesce(excluded.job_title, employees.job_title),
               department_id = coalesce(excluded.department_id, employees.department_id), primary_site_id = coalesce(excluded.primary_site_id, employees.primary_site_id),
               shift_id = coalesce(excluded.shift_id, employees.shift_id), hire_date = coalesce(excluded.hire_date, employees.hire_date)
             returning (xmax = 0) as inserted, id`,
            [num, name, r.job_title || null, deptId, siteId, shiftId, hire, r.status || null]);
          if (up.rows[0].inserted) inserted++; else updated++;
          if (r.phone || r.email) {
            await c.query(`insert into employee_private(employee_id, phone, email) values ($1, $2, $3)
                           on conflict (employee_id) do update set phone = coalesce(excluded.phone, employee_private.phone), email = coalesce(excluded.email, employee_private.email)`,
              [up.rows[0].id, r.phone || null, r.email || null]);
          }
          await c.query('release savepoint imp');
        } catch (err) {
          await c.query('rollback to savepoint imp');
          errors.push({ line, error: /row-level|permission/i.test(err.message) ? 'ليست لديك صلاحية على هذا الموقع أو الموظف' : 'بيانات غير صالحة (' + (err.code || '') + ')' });
        }
      }
      return { inserted, updated, errors };
    }, { reason: 'استيراد موظفين من ملف' });
    res.json(result);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------
// Settings: logo + bulk settings save
// ---------------------------------------------------------------------
api.post('/settings/logo', logoUpload.single('file'), async (req, res, next) => {
  try {
    await requirePerm(req.user.id, 'settings.manage');
    if (!req.file) throw new HttpError(400, 'لم يتم اختيار ملف');
    await withUser(req.user.id, (c) => c.query(`update system_settings set value = to_jsonb($1::text), updated_at = now(), updated_by = app.uid() where key = 'logo_path'`, [req.file.filename]));
    res.json({ ok: true, logo: req.file.filename });
  } catch (e) {
    if (req.file) fs.unlink(req.file.path, () => {});
    next(e);
  }
});

api.put('/settings', async (req, res, next) => {
  try {
    const allowed = ['platform_name', 'platform_name_en', 'org_name', 'org_info', 'default_timezone', 'qualified_level', 'rotation'];
    await withUser(req.user.id, async (c) => {
      for (const [k, v] of Object.entries(req.body || {})) {
        if (!allowed.includes(k)) continue;
        if (k === 'platform_name' && (typeof v !== 'string' || v.trim().length < 3)) throw new HttpError(400, 'اسم المنصة مطلوب');
        if (k === 'rotation') {
          const ok = v && typeof v === 'object' && /^[DNO]{2,28}$/.test(v.pattern) && /^\d{2}:\d{2}$/.test(v.day_start) && /^\d{2}:\d{2}$/.test(v.night_start);
          if (!ok) throw new HttpError(400, 'إعدادات الدورة غير صحيحة');
        }
        const n = (await c.query(`insert into system_settings(key, value, updated_by) values ($1, $2::jsonb, app.uid())
                                  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = app.uid()`, [k, JSON.stringify(v)])).rowCount;
        if (!n) throw new HttpError(403, 'ليست لديك صلاحية تعديل الإعدادات');
      }
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------
api.post('/notifications/read-all', async (req, res, next) => {
  try {
    const n = await withUser(req.user.id, async (c) => (await c.query('update notifications set read_at = now() where user_id = app.uid() and read_at is null')).rowCount);
    res.json({ updated: n });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------
// Integrations: honest status checks; no control commands exist anywhere.
// Secrets are read from server environment variables only.
// ---------------------------------------------------------------------
const INTEGRATION_ENV = {
  sap_pm: ['SAP_PM_BASE_URL', 'SAP_PM_USERNAME', 'SAP_PM_PASSWORD'],
  scada: ['SCADA_HISTORIAN_URL', 'SCADA_API_TOKEN'],
  email: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'],
  whatsapp: ['WHATSAPP_API_URL', 'WHATSAPP_TOKEN'],
};
api.get('/integrations/env', async (req, res, next) => {
  try {
    await requirePerm(req.user.id, 'integrations.manage');
    res.json(Object.fromEntries(Object.entries(INTEGRATION_ENV).map(([k, vars]) => [k, { required: vars, present: vars.filter((v) => !!process.env[v]) }])));
  } catch (e) { next(e); }
});
api.post('/integrations/:kind/test', async (req, res, next) => {
  try {
    await requirePerm(req.user.id, 'integrations.manage');
    const vars = INTEGRATION_ENV[req.params.kind];
    if (!vars) throw new HttpError(404, 'تكامل غير معروف');
    const missing = vars.filter((v) => !process.env[v]);
    let status, error = null;
    if (missing.length) {
      status = 'not_configured';
      error = `لم يتم إعداد المتغيرات على الخادم: ${missing.join(', ')}`;
    } else {
      const url = process.env[vars[0]];
      try {
        const ctl = AbortSignal.timeout(8000);
        const r = await fetch(url, { method: 'GET', signal: ctl });
        status = r.ok || r.status === 401 || r.status === 403 ? 'connected' : 'last_failed';
        if (status !== 'connected') error = `استجابة غير متوقعة من الخادم: ${r.status}`;
        else if (r.status !== 200) error = 'الخادم يستجيب لكن يتطلب مصادقة مكتملة؛ لم تُفعّل أي مزامنة.';
      } catch (err) {
        status = 'last_failed';
        error = 'تعذر الاتصال: ' + (err.name === 'TimeoutError' ? 'انتهت المهلة' : err.message);
      }
    }
    const row = await withUser(req.user.id, async (c) => (await c.query(
      `update integration_configs set status = $2::integration_status, last_checked_at = now(), last_error = $3 where kind = $1::integration_kind returning *`,
      [req.params.kind, status, error])).rows[0]);
    res.json(row);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------
// Public (no auth): branding for the login page
// ---------------------------------------------------------------------
export const publicRouter = express.Router();
publicRouter.get('/branding', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`select key, value from system_settings where key in ('platform_name','platform_name_en','org_name','logo_path')`);
    const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const hasAdmin = (await pool.query(`select 1 from user_roles where role = 'system_admin' limit 1`)).rowCount > 0;
    const signupEnabled = process.env.ALLOW_SIGNUP !== 'false';
    res.json({ ...s, setup_required: !hasAdmin, signup_enabled: signupEnabled,
      // the first account can only become admin through the form when both switches allow it
      setup_via_signup: !hasAdmin && signupEnabled && process.env.FIRST_USER_IS_ADMIN !== 'false' });
  } catch (e) { next(e); }
});
publicRouter.get('/logo', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`select value #>> '{}' as p from system_settings where key = 'logo_path'`);
    const p = rows[0]?.p;
    if (!p || p === 'null') return res.status(404).end();
    const file = path.join(UPLOAD_DIR, 'branding', path.basename(p));
    if (!fs.existsSync(file)) return res.status(404).end();
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.sendFile(file);
  } catch (e) { next(e); }
});
