import express from 'express';
import { pool, withUser } from './db.js';
import { HttpError } from './errors.js';
import { resources } from './resources.js';

const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new HttpError(400, 'اسم حقل غير صالح');
  return `"${s}"`;
};

// relation name -> { column -> { cast, isArray, isJson } }
const columnInfo = new Map();
export async function loadColumnInfo() {
  const { rows } = await pool.query(
    `select table_name, column_name, data_type, udt_name from information_schema.columns where table_schema = 'public'`);
  for (const r of rows) {
    if (!columnInfo.has(r.table_name)) columnInfo.set(r.table_name, {});
    let cast = r.data_type;
    if (r.data_type === 'ARRAY') cast = `${r.udt_name.slice(1)}[]`;
    else if (r.data_type === 'USER-DEFINED') cast = r.udt_name;
    columnInfo.get(r.table_name)[r.column_name] = { cast, isArray: r.data_type === 'ARRAY', isJson: r.udt_name === 'jsonb' || r.udt_name === 'json', type: r.data_type };
  }
}
const cols = (rel) => columnInfo.get(rel) || {};

function getRes(name) {
  const r = resources[name];
  if (!r) throw new HttpError(404, 'المورد غير موجود');
  return r;
}

function coerce(rel, col, value) {
  const info = cols(rel)[col];
  if (!info) throw new HttpError(400, `حقل غير معروف: ${col}`);
  if (value === '' || value === undefined) return { v: null, cast: info.cast };
  if (info.isJson) return { v: value === null ? null : JSON.stringify(value), cast: info.cast };
  if (info.isArray && value !== null && !Array.isArray(value)) throw new HttpError(400, `الحقل ${col} يجب أن يكون قائمة`);
  if (typeof value === 'string') value = value.trim();
  if (typeof value === 'string' && value.length > 10000) throw new HttpError(400, `قيمة الحقل ${col} طويلة جدًا`);
  return { v: value, cast: info.cast };
}

function buildWrite(res, body) {
  const out = [];
  for (const [k, v] of Object.entries(body || {})) {
    if (!res.write.includes(k)) continue; // silently ignore non-writable keys
    const { v: val, cast } = coerce(res.table, k, v);
    out.push({ col: k, val, cast });
  }
  return out;
}

const viewOf = (res) => res.view || res.table;
const keyOf = (res) => res.key || 'id';

function buildList(res, q) {
  const rel = viewOf(res);
  const c = cols(rel);
  const where = [];
  const params = [];
  const p = (v) => { params.push(v); return `$${params.length}`; };

  if (c.archived_at) {
    if (q.archived === 'only') where.push('archived_at is not null');
    else if (q.archived !== 'include') where.push('archived_at is null');
  }
  if (q.search && res.search?.length) {
    const term = `%${String(q.search).trim().replace(/[%_\\]/g, (m) => '\\' + m)}%`;
    const ph = p(term);
    where.push('(' + res.search.map((s) => `${ident(s)}::text ilike ${ph}`).join(' or ') + ')');
  }
  for (const [rawKey, rawVal] of Object.entries(q)) {
    if (!rawKey.startsWith('f.') || rawVal === '' || rawVal === undefined) continue;
    let key = rawKey.slice(2);
    let op = '=';
    if (key.endsWith('__gte')) { key = key.slice(0, -5); op = '>='; }
    else if (key.endsWith('__lte')) { key = key.slice(0, -5); op = '<='; }
    else if (key.endsWith('__null')) {
      key = key.slice(0, -6);
      if (!(res.filters || []).includes(key) || !c[key]) throw new HttpError(400, 'فلتر غير مسموح');
      where.push(`${ident(key)} is ${rawVal === 'true' ? '' : 'not '}null`);
      continue;
    }
    if (key === 'unread' && rel === 'notifications') { if (rawVal === 'true') where.push('read_at is null'); continue; }
    if (!(res.filters || []).includes(key) || !c[key]) throw new HttpError(400, `فلتر غير مسموح: ${key}`);
    const info = c[key];
    if (op === '=' && String(rawVal).includes(',')) {
      where.push(`${ident(key)}::text = any(${p(String(rawVal).split(','))}::text[])`);
    } else if (info.isArray) {
      where.push(`${p(rawVal)}::text = any(${ident(key)}::text[])`);
    } else {
      where.push(`${ident(key)} ${op} ${p(rawVal)}::${info.cast}`);
    }
  }
  let sort = String(q.sort || res.defaultSort || 'id');
  let dir = 'asc';
  if (sort.startsWith('-')) { dir = 'desc'; sort = sort.slice(1); }
  if (!(res.sort || []).includes(sort) && sort !== res.defaultSort?.replace(/^-/, '')) throw new HttpError(400, 'ترتيب غير مسموح');
  const pageSize = Math.min(Math.max(parseInt(q.pageSize || '20', 10) || 20, 1), q.export === '1' ? 10000 : 1000);
  const page = Math.max(parseInt(q.page || '1', 10) || 1, 1);
  const tie = c.id ? ', id' : '';
  const sql = `select *, count(*) over() as __total from ${ident(rel)} ${where.length ? 'where ' + where.join(' and ') : ''}
               order by ${ident(sort)} ${dir} nulls last${tie} limit ${pageSize} offset ${(page - 1) * pageSize}`;
  return { sql, params, page, pageSize };
}

export const crudRouter = express.Router();

crudRouter.get('/:res', async (req, res, next) => {
  try {
    const r = getRes(req.params.res);
    const { sql, params, page, pageSize } = buildList(r, req.query);
    const rows = await withUser(req.user.id, async (c) => (await c.query(sql, params)).rows);
    const total = rows[0]?.__total ?? 0;
    rows.forEach((x) => delete x.__total);
    res.json({ rows, total, page, pageSize });
  } catch (e) { next(e); }
});

crudRouter.get('/:res/:id', async (req, res, next) => {
  try {
    const r = getRes(req.params.res);
    const row = await withUser(req.user.id, async (c) =>
      (await c.query(`select * from ${ident(viewOf(r))} where ${ident(keyOf(r))}::text = $1`, [req.params.id])).rows[0]);
    if (!row) throw new HttpError(404, 'السجل غير موجود أو ليست لديك صلاحية الاطلاع عليه');
    res.json(row);
  } catch (e) { next(e); }
});

crudRouter.post('/:res', async (req, res, next) => {
  try {
    const r = getRes(req.params.res);
    if (r.readOnly || r.noInsert) throw new HttpError(405, 'العملية غير مسموحة');
    const fields = buildWrite(r, req.body);
    if (!fields.length) throw new HttpError(400, 'لا توجد بيانات للحفظ');
    const row = await withUser(req.user.id, async (c) => {
      const sql = `insert into ${ident(r.table)} (${fields.map((f) => ident(f.col)).join(', ')})
                   values (${fields.map((f, i) => `$${i + 1}::${f.cast}`).join(', ')})
                   ${r.compositeKey ? 'on conflict do nothing' : ''} returning *`;
      const ins = (await c.query(sql, fields.map((f) => f.val))).rows[0];
      if (!ins || r.compositeKey || !r.view) return ins || {};
      return (await c.query(`select * from ${ident(r.view)} where ${ident(keyOf(r))} = $1`, [ins[keyOf(r)]])).rows[0] || ins;
    }, { reason: req.body?._reason });
    res.status(201).json(row);
  } catch (e) { next(e); }
});

crudRouter.patch('/:res/:id', async (req, res, next) => {
  try {
    const r = getRes(req.params.res);
    if (r.readOnly || r.noUpdate) throw new HttpError(405, 'العملية غير مسموحة');
    const fields = buildWrite(r, req.body).filter((f) => f.col !== keyOf(r));
    if (!fields.length) throw new HttpError(400, 'لا توجد بيانات للحفظ');
    const row = await withUser(req.user.id, async (c) => {
      const sql = `update ${ident(r.table)} set ${fields.map((f, i) => `${ident(f.col)} = $${i + 1}::${f.cast}`).join(', ')}
                   where ${ident(keyOf(r))}::text = $${fields.length + 1} returning *`;
      const up = (await c.query(sql, [...fields.map((f) => f.val), req.params.id])).rows[0];
      if (!up) throw new HttpError(403, 'ليست لديك صلاحية تعديل هذا السجل أو أنه غير موجود');
      if (!r.view) return up;
      return (await c.query(`select * from ${ident(r.view)} where ${ident(keyOf(r))} = $1`, [up[keyOf(r)]])).rows[0] || up;
    }, { reason: req.body?._reason });
    res.json(row);
  } catch (e) { next(e); }
});

async function setArchived(req, res, next, archive) {
  try {
    const r = getRes(req.params.res);
    if (!r.archivable) throw new HttpError(405, 'هذا السجل لا يدعم الأرشفة');
    const row = await withUser(req.user.id, async (c) => {
      const sql = archive
        ? `update ${ident(r.table)} set archived_at = now(), archived_by = app.uid() where id::text = $1 and archived_at is null returning id`
        : `update ${ident(r.table)} set archived_at = null, archived_by = null where id::text = $1 returning id`;
      const up = (await c.query(sql, [req.params.id])).rows[0];
      if (!up) throw new HttpError(403, 'ليست لديك صلاحية أرشفة هذا السجل أو أنه غير موجود');
      return up;
    }, { reason: req.body?.reason });
    res.json(row);
  } catch (e) { next(e); }
}
crudRouter.post('/:res/:id/archive', (req, res, next) => setArchived(req, res, next, true));
crudRouter.post('/:res/:id/restore', (req, res, next) => setArchived(req, res, next, false));

// delete for join tables only (composite keys)
crudRouter.delete('/:res', async (req, res, next) => {
  try {
    const r = getRes(req.params.res);
    if (!r.deletable || !r.compositeKey) throw new HttpError(405, 'الحذف غير مسموح، استخدم الأرشفة');
    const vals = r.compositeKey.map((k) => {
      if (!req.body?.[k]) throw new HttpError(400, 'بيانات ناقصة');
      return req.body[k];
    });
    const n = await withUser(req.user.id, async (c) =>
      (await c.query(`delete from ${ident(r.table)} where ${r.compositeKey.map((k, i) => `${ident(k)}::text = $${i + 1}`).join(' and ')}`, vals)).rowCount);
    if (!n) throw new HttpError(403, 'ليست لديك صلاحية الحذف أو أن السجل غير موجود');
    res.json({ ok: true });
  } catch (e) { next(e); }
});
