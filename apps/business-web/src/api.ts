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

async function request<T>(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
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
  tenant: { id: string; name: string };
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

const messages: Record<string, string> = {
  forbidden: 'ليست لديك صلاحية لهذه العملية.',
  delegation_ceiling: 'لا يمكنك منح صلاحية لا تملكها أنت في هذا النطاق.',
  self_change: 'لا يمكنك تعديل صلاحياتك بنفسك؛ اطلب ذلك من مدير آخر.',
  policy_changed: 'تغيرت صلاحياتك منذ فتح الصفحة. أعد التحميل ثم حاول مرة أخرى.',
  stale_version: 'عدّل شخص آخر هذا السجل. أعد التحميل ثم حاول مرة أخرى.',
  last_administrator: 'هذا التغيير سيترك الشركة بلا مدير صلاحيات.',
  invalid_input: 'البيانات غير مكتملة أو غير صحيحة.',
  not_found: 'العنصر غير موجود.',
  INVALID_EMAIL_OR_PASSWORD: 'البريد أو كلمة المرور غير صحيحة.',
};

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const reason = typeof error.details.reasonCode === 'string' ? error.details.reasonCode : undefined;
    return messages[reason ?? ''] ?? messages[error.code] ?? 'حدث خطأ غير متوقع. لم يُحفظ شيء.';
  }
  return 'تعذر الاتصال بالخادم.';
}
