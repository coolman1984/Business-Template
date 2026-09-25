/** Thin client for the platform API. The server enforces every rule; this only shapes requests. */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown, headers: Record<string, string> = {}, raw?: Blob): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? data?.code ?? 'error', data?.message ?? res.statusText, data?.details ?? {});
  return data as T;
}

export const get = <T>(url: string) => request<T>('GET', url);
export const post = <T>(url: string, body: unknown) => request<T>('POST', url, body);

export interface Label {
  ar: string;
  en: string;
}
export interface Branch {
  id: string;
  code: string;
  name: string;
}
export interface Me {
  tenant: { id: string; name: string; recipe: string };
  membership: { id: string; displayName: string };
  policyVersion: string;
  branches: Branch[];
  capabilities: { resource: string; action: string; branchIds: string[] }[];
}

/** Server-provided labels carry both languages; pick the one matching the active UI locale. */
export function pickLabel(label: Label, locale: 'ar' | 'en'): string {
  return label[locale];
}

export function can(me: Me, resource: string, action: string, branchId?: string): boolean {
  const c = me.capabilities.find((x) => x.resource === resource && x.action === action);
  if (!c) return false;
  return branchId === undefined || c.branchIds.includes('*') || c.branchIds.includes(branchId);
}

/** Runs a business command. Each click gets its own idempotency key; retries of it must reuse it. */
export function runCommand<T>(me: Me, name: string, input: unknown, idempotencyKey = crypto.randomUUID()) {
  return request<{ operationId: string; result: T; replayed: boolean }>('POST', `/commands/${name}`, input, {
    'idempotency-key': idempotencyKey,
    'x-policy-version': me.policyVersion,
  });
}

/** Sends a file's bytes as-is; the server quarantines them and queues a scan before anyone can download. */
export function uploadFile(me: Me, url: string, file: File, idempotencyKey = crypto.randomUUID()) {
  return uploadRaw<{ operationId: string; result: { fileId: string; versionId: string; jobId: string }; replayed: boolean }>(me, url, file, idempotencyKey);
}

export function uploadRaw<T>(me: Me, url: string, file: File, idempotencyKey = crypto.randomUUID()) {
  return request<T>('POST', url, undefined, {
    'content-type': 'application/octet-stream',
    'x-file-name': encodeURIComponent(file.name),
    'idempotency-key': idempotencyKey,
    'x-policy-version': me.policyVersion,
  }, file);
}

const messages: Record<'ar' | 'en', Record<string, string>> = {
  ar: {
    forbidden: 'ليست لديك صلاحية لهذه العملية.',
    delegation_ceiling: 'لا يمكنك منح صلاحية لا تملكها أنت في هذا النطاق.',
    self_change: 'لا يمكنك تعديل صلاحياتك بنفسك؛ اطلب ذلك من مدير آخر.',
    policy_changed: 'تغيرت صلاحياتك منذ فتح الصفحة. أعد التحميل ثم حاول مرة أخرى.',
    stale_version: 'عدّل شخص آخر هذا السجل. أعد التحميل ثم حاول مرة أخرى.',
    last_administrator: 'هذا التغيير سيترك الشركة بلا مدير صلاحيات.',
    invalid_input: 'البيانات غير مكتملة أو غير صحيحة.',
    not_found: 'العنصر غير موجود.',
    file_too_large: 'الملف أكبر من الحد المسموح (٢٥ ميجا).',
    not_deletable: 'الطلب المعتمد لا يُحذف؛ يمكن إلغاؤه فقط.',
    already_deleted: 'العنصر موجود في سلة المحذوفات بالفعل.',
    not_deleted: 'العنصر ليس في سلة المحذوفات.',
    parent_deleted: 'استرجع الطلب صاحب هذا الملف أولًا.',
    not_failed: 'لا يُعاد إلا المهام المتعثرة.',
    not_cancellable: 'لا تُلغى إلا المهام المنتظرة أو المتعثرة.',
    insufficient_stock: 'الرصيد لا يكفي، ولم يُرحّل شيء.',
    not_draft: 'المستند لم يعد مسودة (رُحّل أو أُلغي). أعد التحميل.',
    not_posted: 'لا يُعكس إلا مستند مُرحّل.',
    already_reversed: 'هذا المستند عُكس من قبل.',
    cannot_reverse_reversal: 'مستند العكس لا يُعكس؛ اعمل مستندًا جديدًا.',
    duplicate_code: 'هذا الكود مستخدم بالفعل.',
    unit_in_use: 'لا تتغير الوحدة بعد استخدام الصنف في مستند.',
    item_inactive: 'في المستند صنف موقوف.',
    warehouse_inactive: 'المخزن موقوف.',
    no_change: 'لا يوجد تغيير للحفظ.',
    import_has_errors: 'في الملف صفوف بها أخطاء. صححها وارفع الملف مرة أخرى.',
    import_changed: 'البيانات تغيرت بعد المعاينة. ارفع الملف مرة أخرى.',
    import_decided: 'تم التصرف في هذا الاستيراد من قبل.',
    missing_columns: 'الملف يحتاج عمودين: «كود الصنف» و«الكمية». نزّل القالب.',
    unsupported_file_type: 'المقبول ملفات إكسل الحديثة (xlsx) أو csv فقط.',
    not_a_workbook: 'الملف تالف أو ليس ملف إكسل.',
    workbook_too_large_or_damaged: 'الملف تالف أو أكبر من المسموح.',
    macros_not_allowed: 'ملفات الماكرو غير مقبولة.',
    too_many_rows: 'عدد الصفوف أكبر من المسموح (٢٠ ألف صف).',
    too_many_columns: 'عدد الأعمدة أكبر من المسموح.',
    empty_file: 'الملف فارغ.',
    csv_not_utf8: 'احفظ الملف بترميز UTF-8.',
    invalid_transition: 'لا يمكن نقل الطلب لهذه الحالة الآن. أعد التحميل.',
    parts_not_allowed: 'تُصرف القطع أثناء الفحص أو الإصلاح فقط.',
    other_branch_warehouse: 'القطع تُصرف من مخزن فرع الطلب نفسه.',
    INVALID_EMAIL_OR_PASSWORD: 'البريد أو كلمة المرور غير صحيحة.',
    generic: 'حدث خطأ غير متوقع. لم يُحفظ شيء.',
    network: 'تعذر الاتصال بالخادم.',
  },
  en: {
    forbidden: 'You do not have permission for this operation.',
    delegation_ceiling: 'You cannot grant a permission you do not hold in this scope.',
    self_change: 'You cannot change your own permissions; ask another administrator.',
    policy_changed: 'Your permissions changed since this page opened. Reload and try again.',
    stale_version: 'Someone else edited this record. Reload and try again.',
    last_administrator: 'This change would leave the company without a permissions administrator.',
    invalid_input: 'The data is incomplete or invalid.',
    not_found: 'The item was not found.',
    file_too_large: 'The file exceeds the allowed size (25 MB).',
    not_deletable: 'An approved order cannot be deleted; it can only be cancelled.',
    already_deleted: 'The item is already in the recycle bin.',
    not_deleted: 'The item is not in the recycle bin.',
    parent_deleted: 'Restore the order that owns this file first.',
    not_failed: 'Only failed jobs can be retried.',
    not_cancellable: 'Only queued or failed jobs can be cancelled.',
    insufficient_stock: 'Stock is insufficient; nothing was posted.',
    not_draft: 'The document is no longer a draft (posted or cancelled). Reload.',
    not_posted: 'Only a posted document can be reversed.',
    already_reversed: 'This document was already reversed.',
    cannot_reverse_reversal: 'A reversal document cannot itself be reversed; create a new document.',
    duplicate_code: 'This code is already in use.',
    unit_in_use: 'The unit cannot change once the item has been used in a document.',
    item_inactive: 'The document contains an inactive item.',
    warehouse_inactive: 'The warehouse is inactive.',
    no_change: 'There is no change to save.',
    import_has_errors: 'Some rows in the file have errors. Fix them and upload the file again.',
    import_changed: 'The data changed since the preview. Upload the file again.',
    import_decided: 'This import has already been acted on.',
    missing_columns: 'The file needs two columns: "Item code" and "Quantity". Download the template.',
    unsupported_file_type: 'Only modern Excel files (xlsx) or CSV are accepted.',
    not_a_workbook: 'The file is corrupted or is not an Excel file.',
    workbook_too_large_or_damaged: 'The file is corrupted or larger than allowed.',
    macros_not_allowed: 'Macro-enabled files are not accepted.',
    too_many_rows: 'Too many rows (the limit is 20,000).',
    too_many_columns: 'Too many columns.',
    empty_file: 'The file is empty.',
    csv_not_utf8: 'Save the file with UTF-8 encoding.',
    invalid_transition: 'The order cannot move to this status now. Reload.',
    parts_not_allowed: 'Parts can only be issued while diagnosing or repairing.',
    other_branch_warehouse: 'Parts are issued from a warehouse of the order’s own branch.',
    INVALID_EMAIL_OR_PASSWORD: 'Incorrect email or password.',
    generic: 'An unexpected error occurred. Nothing was saved.',
    network: 'Could not reach the server.',
  },
};

let errorLocale: 'ar' | 'en' = 'ar';
/** Set by I18nProvider whenever the active locale changes, so describeError can stay locale-aware without changing its signature at every call site. */
export function setErrorLocale(locale: 'ar' | 'en') {
  errorLocale = locale;
}

export function describeError(error: unknown): string {
  const dict = messages[errorLocale];
  if (error instanceof ApiError) {
    const reason = typeof error.details.reasonCode === 'string' ? error.details.reasonCode : undefined;
    return dict[reason ?? ''] ?? dict[error.code] ?? dict.generic ?? '';
  }
  return dict.network ?? '';
}
