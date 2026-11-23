export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const PERMISSION_MSG = 'ليست لديك صلاحية لتنفيذ هذا الإجراء';

/** Translate PostgreSQL / app errors into safe Arabic API errors. */
export function toHttpError(err) {
  if (err instanceof HttpError) return err;
  const code = err?.code;
  const msg = String(err?.message || '');
  const isArabic = /[؀-ۿ]/.test(msg);
  if (code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return new HttpError(403, isArabic ? msg : PERMISSION_MSG, 'forbidden');
  }
  if (code === 'P0001') {
    return new HttpError(err.hint === 'coverage_override_required' ? 409 : 400, msg, err.hint || 'rule');
  }
  if (code === '23505') return new HttpError(409, 'القيمة مستخدمة مسبقًا (مكررة). تحقق من الرمز أو الرقم.', 'duplicate');
  if (code === '23503') return new HttpError(400, 'السجل مرتبط بسجل غير موجود أو لا يمكن الوصول إليه.', 'foreign_key');
  if (code === '23514') return new HttpError(400, 'بعض القيم غير صالحة. تحقق من الحقول المطلوبة وصيغتها.', 'check');
  if (code === '23502') return new HttpError(400, 'يوجد حقل مطلوب فارغ.', 'not_null');
  if (code === '22P02' || code === '22007' || code === '22008' || code === '22003') return new HttpError(400, 'صيغة إحدى القيم غير صحيحة.', 'format');
  console.error('[unexpected]', err);
  return new HttpError(500, 'تعذر تنفيذ العملية بسبب خطأ غير متوقع في الخادم.', 'server');
}
