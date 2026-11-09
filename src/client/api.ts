// Small DOM + fetch helpers shared by every page.
import type { Lang, Me } from '../types.ts';

export const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string | null, text?: string | null): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export async function call<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

let me: Promise<Me> | undefined;
export const getMe = (fresh = false): Promise<Me> => (me = fresh || !me ? call<Me>('/me') : me);

/** Pick the English or Indonesian string. */
export const t = (lang: Lang, en: string, id: string) => (lang === 'id' ? id : en);
