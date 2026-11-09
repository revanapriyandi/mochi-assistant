// Wall-clock time in the user's timezone, without a date library.

export type YMD = [year: number, month: number, day: number];
export type HM = [hour: number, minute: number];

/** Today's date in tz, plus `add` days (day overflow is fine: Date.UTC normalises it). */
export function today(tz: string, add = 0): YMD {
  const [y, m, d] = isoDate(new Date(), tz).split('-').map(Number) as YMD;
  return [y, m, d + add];
}

/** YYYY-MM-DD of an instant in tz. */
export const isoDate = (d: Date, tz: string): string => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);

/** The UTC instant of a wall-clock time in tz (offset corrected twice so DST edges land right). */
export function zoned(tz: string, [y, m, d]: YMD, h = 0, min = 0): Date {
  const off = (t: number) => Date.parse(new Date(t).toLocaleString('en-US', { timeZone: tz }))
    - Date.parse(new Date(t).toLocaleString('en-US', { timeZone: 'UTC' }));
  const guess = Date.UTC(y, m - 1, d, h, min);
  return new Date(guess - off(guess - off(guess)));
}

export const clock = (iso: string | Date, tz: string): string =>
  new Date(iso).toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' });

const h24 = (h: number, ap?: string): number => {
  const p = ap?.toLowerCase();
  return p === 'pm' && h < 12 ? h + 12 : p === 'am' && h === 12 ? 0 : h;
};

const T = String.raw`(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?`;
const RANGE_RE = new RegExp(`${T}\\s*(?:-|–|to|sampai|s/d)\\s*${T}`, 'i');
const AT_RE = new RegExp(`(?:\\bat|\\bjam|\\bpukul|@)\\s*${T}|\\b(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm)\\b`, 'i');

export interface Times { start: HM; end: HM }

/** "4-5pm", "jam 15.30", "at 9am" -> start/end. Without an end, the event lasts `minutes`. */
export function parseTimes(text: string, minutes = 60): Times | null {
  const r = text.match(RANGE_RE);
  if (r) {
    const endAp = r[6];
    const startAp = r[3] ?? endAp;
    return { start: [h24(+r[1], startAp), +(r[2] ?? 0)], end: [h24(+r[4], endAp), +(r[5] ?? 0)] };
  }
  const a = text.match(AT_RE);
  if (!a) return null;
  const [h, m, ap] = a[1] ? [a[1], a[2], a[3]] : [a[4], a[5], a[6]];
  const start: HM = [h24(+h, ap), +(m ?? 0)];
  return { start, end: [start[0], start[1] + minutes] };
}
