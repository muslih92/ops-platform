export const TZ = 'Asia/Riyadh';
const LOCALE = 'ar-SA-u-ca-gregory-nu-latn';

const dFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, year: 'numeric', month: 'short', day: 'numeric' });
const dtFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const tFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const wdFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });

/** 'YYYY-MM-DD' (calendar date, no timezone) → localised text */
export function fmtDate(v?: string | null) {
  if (!v) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d)));
  }
  return dFmt.format(new Date(v));
}
export const fmtDateTime = (v?: string | null) => (v ? dtFmt.format(new Date(v)) : '—');
export const fmtTime = (v?: string | null) => {
  if (!v) return '—';
  if (/^\d{2}:\d{2}/.test(v)) return v.slice(0, 5);
  return tFmt.format(new Date(v));
};
export const fmtWeekday = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return wdFmt.format(new Date(Date.UTC(y, m - 1, d)));
};

/** Today's date in Riyadh as YYYY-MM-DD */
export function todayISO(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (!offsetDays) return parts;
  return addDays(parts, offsetDays);
}
export function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/** timestamptz → value for <input type="datetime-local"> in Riyadh time */
export function toLocalInput(v?: string | null) {
  if (!v) return '';
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date(v));
  const g = (t: string) => p.find((x) => x.type === t)?.value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`;
}
/** <input type="datetime-local"> value interpreted as Riyadh time (UTC+3, no DST) → ISO */
export function fromLocalInput(v?: string | null) {
  if (!v) return null;
  return new Date(`${v}:00+03:00`).toISOString();
}

export const fmtNum = (n?: number | null) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('en-US').format(n));
export const fmtBytes = (n?: number | null) => {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
};
