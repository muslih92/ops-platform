import { clsx } from 'clsx';
import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ChevronLeft, ChevronRight, FlaskConical, Inbox, Loader2, Lock, X } from 'lucide-react';

export const cx = clsx;

// ----------------------------------------------------------------- Button
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode }>(
  ({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...p }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        size === 'md' ? 'min-h-[44px] px-4 text-sm' : 'min-h-[36px] px-3 text-sm',
        variant === 'primary' && 'bg-primary text-primary-fg hover:bg-primary/90 active:bg-primary/80',
        variant === 'accent' && 'bg-accent text-accent-fg hover:bg-accent/90',
        variant === 'secondary' && 'border border-border bg-surface text-fg hover:bg-surface-2',
        variant === 'ghost' && 'text-fg hover:bg-surface-2',
        variant === 'danger' && 'bg-danger text-white hover:bg-danger/90',
        className,
      )}
      {...p}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

export function IconButton({ label, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} className={cx('inline-flex h-11 w-11 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50', className)} {...p}>
      {children}
    </button>
  );
}

// ----------------------------------------------------------------- Form controls
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cx('input', className)} {...p} />
));
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, rows = 3, ...p }, ref) => (
  <textarea ref={ref} rows={rows} className={cx('input min-h-[88px] leading-relaxed', className)} {...p} />
));
Textarea.displayName = 'Textarea';

export type Opt = { value: string; label: string };
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { options: Opt[]; placeholder?: string }>(
  ({ options, placeholder, className, ...p }, ref) => (
    <select ref={ref} className={cx('input pe-8', className)} {...p}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  ),
);
Select.displayName = 'Select';

export function Field({ label, required, hint, error, children, className }: { label: string; required?: boolean; hint?: string; error?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label} {required && <span className="text-danger" aria-hidden>*</span>}
      </label>
      {children(id)}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-danger" role="alert">{error}</p>}
    </div>
  );
}

export function Checkbox({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cx('inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-sm', disabled && 'cursor-not-allowed opacity-60')}>
      <input type="checkbox" className="h-5 w-5 rounded border-border accent-[hsl(var(--accent))]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function MultiCheck({ options, value, onChange, columns = 2 }: { options: Opt[]; value: string[]; onChange: (v: string[]) => void; columns?: number }) {
  return (
    <div className={cx('grid max-h-56 gap-x-4 overflow-y-auto rounded-md border border-border p-2', columns === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2')}>
      {options.length === 0 && <p className="p-2 text-sm text-muted">لا توجد خيارات</p>}
      {options.map((o) => (
        <Checkbox key={o.value} label={o.label} checked={value.includes(o.value)}
          onChange={(c) => onChange(c ? [...value, o.value] : value.filter((x) => x !== o.value))} />
      ))}
    </div>
  );
}

// ----------------------------------------------------------------- Display
type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
      tone === 'neutral' && 'bg-surface-2 text-muted',
      tone === 'success' && 'bg-success-soft text-success',
      tone === 'warning' && 'bg-warning-soft text-warning',
      tone === 'danger' && 'bg-danger-soft text-danger',
      tone === 'info' && 'bg-info-soft text-info',
      tone === 'accent' && 'bg-accent/10 text-accent',
      className)}>
      {children}
    </span>
  );
}

export function DemoBadge({ show = true }: { show?: boolean }) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded border border-dashed border-warning/60 px-1.5 py-0 text-[11px] font-medium text-warning" title="بيانات تجريبية غير حقيقية">
      <FlaskConical className="h-3 w-3" aria-hidden /> تجريبي
    </span>
  );
}

export function Card({ title, actions, children, className, bodyClass }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cx('card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx('p-4', bodyClass)}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions, icon }: { title: string; description?: string; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="mt-0.5 hidden rounded-lg bg-accent/10 p-2 text-accent sm:block">{icon}</div>}
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, icon, tone = 'neutral', hint, onClick }: { label: string; value: ReactNode; icon?: ReactNode; tone?: Tone; hint?: string; onClick?: () => void }) {
  const C = onClick ? 'button' : 'div';
  return (
    <C onClick={onClick} className={cx('card flex w-full items-start gap-3 p-4 text-start', onClick && 'transition-colors hover:border-accent/60 hover:bg-surface-2')}>
      {icon && (
        <div className={cx('rounded-lg p-2',
          tone === 'danger' ? 'bg-danger-soft text-danger' : tone === 'warning' ? 'bg-warning-soft text-warning' : tone === 'success' ? 'bg-success-soft text-success' : tone === 'info' ? 'bg-info-soft text-info' : 'bg-accent/10 text-accent')}>
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <div className="text-sm text-muted">{label}</div>
        <div className="num text-2xl font-bold">{value}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
    </C>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-3 rounded-full bg-surface-2 p-3 text-muted">{icon || <Inbox className="h-6 w-6" aria-hidden />}</div>
      <h3 className="font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = (error as Error)?.message || 'حدث خطأ';
  const forbidden = (error as any)?.status === 403;
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center" role="alert">
      <div className="mb-3 rounded-full bg-danger-soft p-3 text-danger">{forbidden ? <Lock className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}</div>
      <h3 className="font-semibold">{forbidden ? 'لا تملك صلاحية الاطلاع' : 'تعذر تحميل البيانات'}</h3>
      <p className="mt-1 max-w-md text-sm text-muted">{msg}</p>
      {onRetry && !forbidden && <Button variant="secondary" className="mt-4" onClick={onRetry}>إعادة المحاولة</Button>}
    </div>
  );
}

export function PermissionDenied({ message }: { message?: string }) {
  return (
    <div className="card mx-auto mt-10 max-w-lg">
      <EmptyState icon={<Lock className="h-6 w-6" />} title="ليست لديك صلاحية للوصول إلى هذه الصفحة"
        description={message || 'إذا كنت تحتاج إلى هذه الصلاحية، تواصل مع مدير النظام لمراجعة دورك.'} />
    </div>
  );
}

export function Spinner({ label = 'جارٍ التحميل…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-8 text-muted" role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> <span className="text-sm">{label}</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-md bg-surface-2', className)} aria-hidden />;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="no-print mb-4 flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={cx('-mb-px min-h-[44px] whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors',
            value === t.value ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-fg')}>
          {t.label}{t.count !== undefined && <span className="ms-1.5 rounded-full bg-surface-2 px-1.5 text-xs">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="no-print flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-sm" aria-label="ترقيم الصفحات">
      <span className="text-muted num">{from}–{to} من {total}</span>
      <div className="flex items-center gap-1">
        <IconButton label="الصفحة السابقة" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronRight className="h-4 w-4" /></IconButton>
        <span className="num px-2">{page} / {pages}</span>
        <IconButton label="الصفحة التالية" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronLeft className="h-4 w-4" /></IconButton>
      </div>
    </nav>
  );
}

// ----------------------------------------------------------------- Overlays
function useLockBody(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  useLockBody(open);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    setTimeout(() => ref.current?.querySelector<HTMLElement>('input,select,textarea,button:not([data-close])')?.focus(), 30);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div ref={ref} className={cx('relative flex max-h-[92vh] w-full flex-col rounded-t-xl bg-surface shadow-xl sm:rounded-xl',
        size === 'sm' && 'sm:max-w-md', size === 'md' && 'sm:max-w-2xl', size === 'lg' && 'sm:max-w-4xl', size === 'xl' && 'sm:max-w-6xl')}>
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <IconButton label="إغلاق" onClick={onClose} data-close><X className="h-5 w-5" /></IconButton>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'تأكيد', danger, loading, children }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean; children?: ReactNode;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<>
        <Button variant="secondary" onClick={onClose}>إلغاء</Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
      </>}>
      <div className="text-sm leading-relaxed">{message}</div>
      {children}
    </Modal>
  );
}

export function Alert({ tone = 'info', title, children, className }: { tone?: 'info' | 'warning' | 'danger' | 'success'; title?: string; children?: ReactNode; className?: string }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('rounded-lg border p-3 text-sm',
      tone === 'info' && 'border-info/30 bg-info-soft text-fg', tone === 'warning' && 'border-warning/40 bg-warning-soft text-fg',
      tone === 'danger' && 'border-danger/40 bg-danger-soft text-fg', tone === 'success' && 'border-success/40 bg-success-soft text-fg', className)}>
      {title && <div className={cx('mb-0.5 font-semibold', tone === 'warning' && 'text-warning', tone === 'danger' && 'text-danger', tone === 'success' && 'text-success', tone === 'info' && 'text-info')}>{title}</div>}
      {children}
    </div>
  );
}

export function Progress({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full', v >= 100 ? 'bg-success' : 'bg-accent')} style={{ width: `${v}%` }} />
    </div>
  );
}

export function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium">{children ?? '—'}</dd>
    </div>
  );
}
