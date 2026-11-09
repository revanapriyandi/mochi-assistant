// Visual cards for tool results: weather, events, free time, day briefings.
import type { Briefing, CalEvent, Card, Lang, Weather } from '../types.ts';
import { el, t, timeZone } from './api.ts';

const locale = (lang: Lang) => (lang === 'id' ? 'id-ID' : 'en-GB');
export const fmt = (iso: string, lang: Lang, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString(locale(lang), { timeZone, ...opts });
const clock = (iso: string, lang: Lang) => fmt(iso, lang, { hour: '2-digit', minute: '2-digit' });
const noon = (date: string) => `${date}T12:00:00Z`;

const KIND: [number[], string, string][] = [[[0, 1], 'clear', '☀️'], [[2, 3], 'cloud', '⛅'], [[45, 48], 'fog', '🌫️'], [[71, 73, 75, 77, 85, 86], 'snow', '❄️'], [[95, 96, 99], 'storm', '⛈️']];
export function weatherKind(code: number, day = true): [string, string] {
  const k = KIND.find(([codes]) => codes.includes(code)) ?? [[], 'rain', '🌧️'];
  return k[1] === 'clear' && !day ? ['night', '🌙'] : [k[1], k[2]];
}

export function weatherCard(w: Weather, lang: Lang): HTMLElement {
  const [cls, icon] = weatherKind(w.code, w.day);
  const c = el('div', `weather w-${cls}`);
  const meta = el('div', 'meta');
  if (w.feels != null) meta.append(el('span', null, `${t(lang, 'Feels', 'Terasa')} ${Math.round(w.feels)}${w.unit}`));
  if (w.humidity != null) meta.append(el('span', null, `💧 ${w.humidity}%`));
  if (w.wind != null) meta.append(el('span', null, `💨 ${w.wind} km/h`));
  c.append(el('div', 'place', w.place), el('div', 'icon', icon), el('div', 'temp', `${Math.round(w.temp)}${w.unit}`),
    el('div', 'desc', lang === 'id' ? w.descId : w.desc), meta);
  if (w.forecast?.length) {
    const f = el('div', 'forecast');
    for (const d of w.forecast) {
      const tile = el('div');
      tile.title = `${lang === 'id' ? d.descId : d.desc}${d.rain != null ? `, ${d.rain}% ${t(lang, 'rain', 'hujan')}` : ''}`;
      tile.append(fmt(noon(d.date), lang, { weekday: 'short' }), el('b', null, weatherKind(d.code)[1]), `${Math.round(d.max)}°`);
      f.append(tile);
    }
    c.append(f);
  }
  return c;
}

export function panel(title: string, rows: HTMLElement[], empty: string): HTMLElement {
  const c = el('section', 'panel');
  c.append(el('h4', null, title));
  if (!rows.length) c.append(el('div', 'empty', empty));
  c.append(...rows);
  return c;
}

export function eventRow(e: CalEvent, lang: Lang): HTMLElement {
  const row = el('a', 'row');
  if (e.link) { row.href = e.link; row.target = '_blank'; row.rel = 'noopener'; }
  const info = el('div');
  info.append(el('b', null, e.summary), el('small', null, fmt(e.start.includes('T') ? e.start : noon(e.start), lang, { weekday: 'short', day: 'numeric', month: 'short' })));
  row.append(el('time', null, e.start.includes('T') ? clock(e.start, lang) : t(lang, 'All day', 'Seharian')), info);
  return row;
}

export function briefingCard(b: Briefing, lang: Lang, title?: string): HTMLElement {
  const rows = b.recommendations.map((r) => { const row = el('div', 'row rec'); row.append(el('span', null, r.icon), el('div', null, r.text)); return row; });
  const head = title ?? fmt(noon(b.date), lang, { weekday: 'long', day: 'numeric', month: 'short' });
  return panel(`🧭 ${head}${b.place ? ` · ${b.place}` : ''}`, rows, t(lang, 'Nothing to flag.', 'Tidak ada catatan.'));
}

/** The card for one tool result in a chat reply (null when it has nothing to show). */
export function cardFor(c: Card, lang: Lang, mutated: boolean): HTMLElement | null {
  switch (c.tool) {
    case 'get_weather': return 'error' in c.data ? null : weatherCard(c.data, lang);
    case 'list_calendar_events': return mutated ? null : panel(t(lang, 'Your calendar', 'Kalendermu'), c.data.events.map((e) => eventRow(e, lang)), t(lang, 'Nothing scheduled.', 'Tidak ada acara.'));
    case 'create_calendar_event': return panel(t(lang, '✅ Added', '✅ Ditambahkan'), [eventRow(c.data.created, lang)], '');
    case 'update_calendar_event': return panel(t(lang, '↪️ Moved', '↪️ Dipindah'), [eventRow(c.data.updated, lang)], '');
    case 'delete_calendar_event': return panel(t(lang, '🗑 Deleted', '🗑 Dihapus'), [eventRow(c.data.deleted, lang)], '');
    case 'find_free_time': return panel(t(lang, '🕒 Free time', '🕒 Waktu kosong'),
      c.data.slots.map((s) => { const r = el('div', 'row'); r.append(el('time', null, clock(s.start, lang)), el('div', null, `→ ${clock(s.end, lang)}`)); return r; }),
      t(lang, 'No free slot.', 'Tidak ada waktu kosong.'));
    case 'day_briefing': return briefingCard(c.data, lang);
    default: return null;
  }
}
