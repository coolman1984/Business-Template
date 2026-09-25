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

const messages: Record<string, string> = {
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
};

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const reason = typeof error.details.reasonCode === 'string' ? error.details.reasonCode : undefined;
    return messages[reason ?? ''] ?? messages[error.code] ?? 'حدث خطأ غير متوقع. لم يُحفظ شيء.';
  }
  return 'تعذر الاتصال بالخادم.';
}
