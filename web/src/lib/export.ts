import writeXlsxFile from 'write-excel-file';
import readXlsxFile from 'read-excel-file';
import { fmtDateTime } from './format';

export type ExportCol<T> = { header: string; value: (r: T) => string | number | null | undefined };
export type ExportMeta = { title: string; filters: string; preparedBy: string };

/** Excel export with a header block (title, prepared at, filters, prepared by). */
export async function exportXlsx<T>(fileName: string, cols: ExportCol<T>[], rows: T[], meta: ExportMeta) {
  const head = (v: string) => ({ value: v, fontWeight: 'bold' as const });
  const data: any[] = [
    [head(meta.title)],
    [{ value: `تاريخ الإعداد: ${fmtDateTime(new Date().toISOString())} (توقيت الرياض)` }],
    [{ value: `الفلاتر: ${meta.filters || 'بدون'}` }],
    [{ value: `معد التقرير: ${meta.preparedBy}` }],
    [],
    cols.map((c) => ({ ...head(c.header), backgroundColor: '#E2EEF5' })),
    ...rows.map((r) => cols.map((c) => {
      const v = c.value(r);
      return { value: v === null || v === undefined ? '' : v, type: typeof v === 'number' ? Number : String };
    })),
  ];
  await writeXlsxFile(data, { fileName: `${fileName}.xlsx`, rightToLeft: true, columns: cols.map(() => ({ width: 24 })) } as any);
}

export function exportCsv<T>(fileName: string, cols: ExportCol<T>[], rows: T[], meta?: ExportMeta) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [];
  if (meta) {
    lines.push(esc(meta.title), esc(`تاريخ الإعداد: ${fmtDateTime(new Date().toISOString())}`), esc(`الفلاتر: ${meta.filters || 'بدون'}`), esc(`معد التقرير: ${meta.preparedBy}`), '');
  }
  lines.push(cols.map((c) => esc(c.header)).join(','));
  for (const r of rows) lines.push(cols.map((c) => esc(c.value(r))).join(','));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${fileName}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',' || ch === ';') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Read a CSV or XLSX file into an array of rows (first row = headers). */
export async function readSheet(file: File): Promise<string[][]> {
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
    const text = (await file.text()).replace(/^﻿/, '');
    return parseCsv(text);
  }
  const rows = await readXlsxFile(file);
  return rows.map((r) => r.map((c) => {
    if (c instanceof Date) return c.toISOString().slice(0, 10);
    return c === null || c === undefined ? '' : String(c);
  }));
}
