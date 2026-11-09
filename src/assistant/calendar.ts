// Google Calendar, called with a Google token that Auth0 Token Vault hands out per request.
import type { CalEvent, Slot } from '../types.ts';
import type { ToolCtx } from './context.ts';

interface GEvent { id: string; summary?: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string }; htmlLink?: string }

async function api<T>(ctx: ToolCtx, path = '', { method = 'GET', body }: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await ctx.googleToken(); // throws when Google is not connected
  const res = await ctx.fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events${path}`, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  });
  if (res.status === 204) return {} as T; // DELETE
  const data = await res.json() as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Google Calendar ${res.status}: ${data.error?.message ?? 'request failed'}`);
  return data;
}

const toEvent = (e: GEvent): CalEvent => ({ id: e.id, summary: e.summary ?? '(no title)',
  start: e.start.dateTime ?? e.start.date ?? '', end: e.end.dateTime ?? e.end.date ?? '', link: e.htmlLink });
const at = (iso: string, timeZone: string) => ({ dateTime: iso, timeZone });
const one = (id: string) => `/${encodeURIComponent(id)}`;

export async function listEvents(ctx: ToolCtx, timeMin: string, timeMax: string): Promise<CalEvent[]> {
  const q = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '50' });
  return (await api<{ items: GEvent[] }>(ctx, `?${q}`)).items.map(toEvent);
}

export const createEvent = async (ctx: ToolCtx, summary: string, start: string, end: string) =>
  toEvent(await api<GEvent>(ctx, '', { method: 'POST', body: { summary, start: at(start, ctx.timeZone), end: at(end, ctx.timeZone) } }));

export const updateEvent = async (ctx: ToolCtx, id: string, change: { summary?: string; start?: string; end?: string }) =>
  toEvent(await api<GEvent>(ctx, one(id), { method: 'PATCH', body: {
    ...(change.summary && { summary: change.summary }),
    ...(change.start && { start: at(change.start, ctx.timeZone) }),
    ...(change.end && { end: at(change.end, ctx.timeZone) }),
  } }));

export async function deleteEvent(ctx: ToolCtx, id: string): Promise<CalEvent> {
  const old = toEvent(await api<GEvent>(ctx, one(id)));
  await api(ctx, one(id), { method: 'DELETE' });
  return old;
}

/** Gaps of at least `minutes` between [from, to), given events sorted by start. All-day events don't block time. */
export function freeSlots(events: CalEvent[], from: string, to: string, minutes: number): Slot[] {
  const slots: Slot[] = [];
  const min = minutes * 60000;
  let cursor = new Date(from).getTime();
  for (const e of events.filter((e) => e.start.includes('T'))) {
    const s = new Date(e.start).getTime();
    const en = new Date(e.end).getTime();
    if (s - cursor >= min) slots.push({ start: new Date(cursor).toISOString(), end: new Date(s).toISOString() });
    cursor = Math.max(cursor, en);
  }
  const end = new Date(to).getTime();
  if (end - cursor >= min) slots.push({ start: new Date(cursor).toISOString(), end: new Date(end).toISOString() });
  return slots;
}
