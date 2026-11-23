import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { authRouter, sessionMiddleware, requireAuth } from './auth.js';
import { crudRouter, loadColumnInfo } from './crud.js';
import { api, publicRouter } from './routes.js';
import { HttpError, toHttpError } from './errors.js';
import { startJobs } from './jobs.js';
import { registerEnumArrayParsers } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'");
  next();
});
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
app.use(sessionMiddleware);

// CSRF defence: state-changing API calls must come from our own JS (custom header + same-site cookie)
app.use('/api', (req, _res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.get('X-Requested-With') !== 'ops-app') {
    return next(new HttpError(403, 'طلب غير موثوق', 'csrf'));
  }
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/public', publicRouter);
app.use('/api/auth', authRouter);
app.use('/api/r', requireAuth, crudRouter);
app.use('/api', requireAuth, api);
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'المسار غير موجود')));

// Static frontend (built by `npm run build`)
const dist = path.resolve(__dirname, '../web/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') err = new HttpError(400, 'حجم الملف أكبر من المسموح');
  const e = toHttpError(err);
  res.status(e.status).json({ error: e.message, code: e.code });
});

const port = Number(process.env.PORT || 3000);
await registerEnumArrayParsers();
await loadColumnInfo();
app.listen(port, () => {
  console.log(`[ops-platform] listening on http://localhost:${port}`);
  if (process.env.DISABLE_JOBS !== 'true') startJobs();
});
