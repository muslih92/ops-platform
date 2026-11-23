import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, Checkbox, cx, Field, Input, Modal, MultiCheck, Select, Textarea, type Opt } from './ui';
import { options as enumOptions } from '@/lib/i18n';
import { fromLocalInput, toLocalInput } from '@/lib/format';

export type FieldDef = {
  name: string;
  label: string;
  type?: 'text' | 'textarea' | 'number' | 'date' | 'datetime' | 'time' | 'select' | 'multiselect' | 'checkbox' | 'weekdays' | 'color' | 'email' | 'tel' | 'password';
  required?: boolean;
  options?: Opt[];
  placeholder?: string;
  hint?: string;
  min?: number;
  max?: number;
  maxLength?: number;
  wide?: boolean;
  show?: (v: Record<string, any>) => boolean;
  disabled?: boolean;
};

const WEEKDAYS = enumOptions('weekday');

/** Convert a DB row into form values (datetime → local input etc.). */
export function rowToForm(fields: FieldDef[], row: Record<string, any> | null | undefined) {
  const v: Record<string, any> = {};
  for (const f of fields) {
    const raw = row?.[f.name];
    if (f.type === 'datetime') v[f.name] = toLocalInput(raw);
    else if (f.type === 'time') v[f.name] = raw ? String(raw).slice(0, 5) : '';
    else if (f.type === 'checkbox') v[f.name] = !!raw;
    else if (f.type === 'multiselect' || f.type === 'weekdays') v[f.name] = (raw ?? (f.type === 'weekdays' ? [0, 1, 2, 3, 4, 5, 6] : [])).map(String);
    else v[f.name] = raw ?? '';
  }
  return v;
}

/** Convert form values into an API payload. */
export function formToPayload(fields: FieldDef[], v: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const f of fields) {
    if (f.show && !f.show(v)) { out[f.name] = null; continue; }
    const x = v[f.name];
    if (f.type === 'datetime') out[f.name] = fromLocalInput(x);
    else if (f.type === 'number') out[f.name] = x === '' || x === null ? null : Number(x);
    else if (f.type === 'weekdays') out[f.name] = (x || []).map(Number).sort();
    else if (f.type === 'checkbox') out[f.name] = !!x;
    else if (typeof x === 'string') out[f.name] = x.trim() === '' ? null : x.trim();
    else out[f.name] = x;
  }
  return out;
}

export function validate(fields: FieldDef[], v: Record<string, any>) {
  const errs: Record<string, string> = {};
  for (const f of fields) {
    if (f.show && !f.show(v)) continue;
    const x = v[f.name];
    const empty = x === '' || x === null || x === undefined || (Array.isArray(x) && x.length === 0);
    if (f.required && empty) errs[f.name] = 'هذا الحقل مطلوب';
    else if (!empty && f.type === 'number') {
      const n = Number(x);
      if (Number.isNaN(n)) errs[f.name] = 'أدخل رقمًا صحيحًا';
      else if (f.min !== undefined && n < f.min) errs[f.name] = `الحد الأدنى ${f.min}`;
      else if (f.max !== undefined && n > f.max) errs[f.name] = `الحد الأعلى ${f.max}`;
    } else if (!empty && typeof x === 'string') {
      if (f.maxLength && x.length > f.maxLength) errs[f.name] = `الحد الأقصى ${f.maxLength} حرفًا`;
      if (f.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)) errs[f.name] = 'صيغة البريد غير صحيحة';
      if (f.type === 'tel' && !/^[0-9+ ()-]{6,20}$/.test(x)) errs[f.name] = 'رقم غير صالح';
    }
  }
  return errs;
}

export function FormFields({ fields, values, onChange, errors }: { fields: FieldDef[]; values: Record<string, any>; onChange: (name: string, v: any) => void; errors: Record<string, string> }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {fields.filter((f) => !f.show || f.show(values)).map((f) => (
        <Field key={f.name} label={f.label} required={f.required} hint={f.hint} error={errors[f.name]}
          className={cx((f.wide || f.type === 'textarea' || f.type === 'multiselect' || f.type === 'weekdays') && 'sm:col-span-2')}>
          {(id) => {
            const common = { id, disabled: f.disabled, 'aria-invalid': !!errors[f.name] || undefined };
            switch (f.type) {
              case 'textarea':
                return <Textarea {...common} value={values[f.name] ?? ''} maxLength={f.maxLength} placeholder={f.placeholder} onChange={(e) => onChange(f.name, e.target.value)} />;
              case 'select':
                return <Select {...common} value={values[f.name] ?? ''} options={f.options || []} placeholder={f.placeholder ?? '— اختر —'} onChange={(e) => onChange(f.name, e.target.value)} />;
              case 'multiselect':
                return <MultiCheck options={f.options || []} value={values[f.name] || []} onChange={(v) => onChange(f.name, v)} />;
              case 'weekdays':
                return (
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map((d) => {
                      const on = (values[f.name] || []).includes(d.value);
                      return (
                        <button type="button" key={d.value} aria-pressed={on}
                          onClick={() => onChange(f.name, on ? values[f.name].filter((x: string) => x !== d.value) : [...(values[f.name] || []), d.value])}
                          className={cx('min-h-[44px] rounded-md border px-3 text-sm', on ? 'border-accent bg-accent text-accent-fg' : 'border-border bg-surface')}>
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                );
              case 'checkbox':
                return <Checkbox label={f.hint || f.label} checked={!!values[f.name]} onChange={(v) => onChange(f.name, v)} disabled={f.disabled} />;
              case 'color':
                return <Input {...common} type="color" className="h-11 w-24 p-1" value={values[f.name] || '#0e7490'} onChange={(e) => onChange(f.name, e.target.value)} />;
              default:
                return (
                  <Input {...common}
                    type={f.type === 'datetime' ? 'datetime-local' : f.type || 'text'}
                    dir={['email', 'tel', 'number', 'date', 'datetime', 'time', 'password'].includes(f.type || '') ? 'ltr' : undefined}
                    className={['email', 'tel', 'number', 'date', 'datetime', 'time'].includes(f.type || '') ? 'text-end' : undefined}
                    value={values[f.name] ?? ''} min={f.min} max={f.max} maxLength={f.maxLength} placeholder={f.placeholder}
                    onChange={(e) => onChange(f.name, e.target.value)} />
                );
            }
          }}
        </Field>
      ))}
    </div>
  );
}

export function FormModal({ open, onClose, title, fields, initial, onSubmit, submitLabel = 'حفظ', extraValidate, children, size = 'md' }: {
  open: boolean; onClose: () => void; title: string; fields: FieldDef[]; initial?: Record<string, any> | null;
  onSubmit: (payload: Record<string, any>, values: Record<string, any>) => Promise<unknown>; submitLabel?: string;
  extraValidate?: (v: Record<string, any>) => Record<string, string>; children?: (values: Record<string, any>) => ReactNode; size?: 'sm' | 'md' | 'lg';
}) {
  const [values, setValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) { setValues(rowToForm(fields, initial)); setErrors({}); setServerError(null); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const errs = { ...validate(fields, values), ...(extraValidate?.(values) || {}) };
    setErrors(errs);
    if (Object.keys(errs).length) { setServerError('يرجى تصحيح الحقول المحددة'); return; }
    setSaving(true); setServerError(null);
    try {
      await onSubmit(formToPayload(fields, values), values);
      onClose();
    } catch (err: any) {
      setServerError(err?.message || 'تعذر الحفظ');
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} size={size}
      footer={<>
        <Button variant="secondary" onClick={onClose}>إلغاء</Button>
        <Button onClick={() => submit()} loading={saving}>{submitLabel}</Button>
      </>}>
      <form onSubmit={submit} noValidate>
        {serverError && <Alert tone="danger" className="mb-4">{serverError}</Alert>}
        <FormFields fields={fields} values={values} errors={errors} onChange={(n, v) => setValues((s) => ({ ...s, [n]: v }))} />
        {children?.(values)}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
