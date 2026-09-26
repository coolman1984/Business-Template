/** Thin client for the platform API. The server enforces every rule; this only shapes requests. */
import { ar } from './i18n/ar';
import { en } from './i18n/en';

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

let errorLocale: 'ar' | 'en' = 'ar';
/** Set by I18nProvider whenever the active locale changes, so describeError can stay locale-aware without changing its signature at every call site. */
export function setErrorLocale(locale: 'ar' | 'en') {
  errorLocale = locale;
}

/** Turns a server or network failure into a sentence from the translation files (keys `error.<code>`). */
export function describeError(error: unknown): string {
  const dict = errorLocale === 'en' ? en : ar;
  const pick = (code: string | undefined) => (code ? dict[`error.${code}`] ?? ar[`error.${code}`] : undefined);
  if (error instanceof ApiError) {
    const reason = typeof error.details.reasonCode === 'string' ? error.details.reasonCode : undefined;
    return pick(reason) ?? pick(error.code) ?? pick('generic') ?? '';
  }
  return pick('network') ?? '';
}
