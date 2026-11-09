// Decision support: deterministic rules, so every brain (LLM or keyword engine) gives the same advice.
import type { CalEvent, DayForecast, Lang, Recommendation, Slot, Weather } from '../types.ts';
import { clock, zoned, type YMD } from './time.ts';

const OUTDOOR = /\b(run|jog|walk|hike|bike|cycling|futsal|football|soccer|tennis|picnic|bbq|outdoor|lari|jalan|sepeda|olahraga|piknik|taman|renang|swim)\b/i;

const TEXT = {
  en: {
    rain: (p: number) => `High chance of rain (${p}%): bring an umbrella.`,
    hot: (t: string) => `Hot day (up to ${t}): stay hydrated.`,
    busy: (n: number) => `Busy day with ${n} events: plan short breaks.`,
    free: 'Your calendar is free: a good day for deep work or rest.',
    b2b: (a: string, b: string) => `Back-to-back: "${a}" runs straight into "${b}".`,
    best: (s: string) => `Best free block: ${s}.`,
    move: (e: string) => `Rain is likely during "${e}": consider moving it indoors or to another day.`,
    early: (e: string, c: string) => `Early start: "${e}" at ${c}.`,
  },
  id: {
    rain: (p: number) => `Peluang hujan tinggi (${p}%): bawa payung.`,
    hot: (t: string) => `Hari panas (sampai ${t}): banyak minum.`,
    busy: (n: number) => `Hari padat dengan ${n} acara: sisipkan jeda singkat.`,
    free: 'Kalendermu kosong: cocok untuk fokus kerja atau istirahat.',
    b2b: (a: string, b: string) => `Berurutan: "${a}" langsung disambung "${b}".`,
    best: (s: string) => `Blok kosong terbaik: ${s}.`,
    move: (e: string) => `Kemungkinan hujan saat "${e}": pertimbangkan pindah ke dalam ruangan atau hari lain.`,
    early: (e: string, c: string) => `Mulai pagi: "${e}" jam ${c}.`,
  },
} satisfies Record<Lang, unknown>;

export interface RecommendInput {
  forecast?: DayForecast | null;
  unit?: Weather['unit'];
  events?: CalEvent[];
  slots?: Slot[];
  tz?: string;
  lang?: Lang;
}

export function recommend({ forecast, unit = '°C', events = [], slots = [], tz = 'UTC', lang = 'en' }: RecommendInput): Recommendation[] {
  const t = TEXT[lang] ?? TEXT.en;
  const out: Recommendation[] = [];
  const timed = events.filter((e) => e.start.includes('T'));
  const rainy = (forecast?.rain ?? 0) >= 60;
  if (rainy) out.push({ icon: '☔', text: t.rain(forecast!.rain!) });
  if (forecast && forecast.max >= (unit === '°F' ? 90 : 32)) out.push({ icon: '🥤', text: t.hot(`${Math.round(forecast.max)}${unit}`) });
  if (rainy) for (const e of timed.filter((e) => OUTDOOR.test(e.summary))) out.push({ icon: '🔁', text: t.move(e.summary) });
  const first = timed[0];
  if (first && +clock(first.start, tz).slice(0, 2) < 8) out.push({ icon: '⏰', text: t.early(first.summary, clock(first.start, tz)) });
  for (let i = 1; i < timed.length; i++) {
    if (new Date(timed[i].start).getTime() - new Date(timed[i - 1].end).getTime() < 10 * 60000) {
      out.push({ icon: '⏱️', text: t.b2b(timed[i - 1].summary, timed[i].summary) });
    }
  }
  if (events.length >= 4) out.push({ icon: '📅', text: t.busy(events.length) });
  if (!events.length) out.push({ icon: '🌿', text: t.free });
  const len = (s: Slot) => new Date(s.end).getTime() - new Date(s.start).getTime();
  const best = [...slots].sort((a, b) => len(b) - len(a))[0];
  if (best) out.push({ icon: '🎯', text: t.best(`${clock(best.start, tz)}-${clock(best.end, tz)}`) });
  return out;
}

/** Midnight / 08:00 / 20:00 of a YYYY-MM-DD in tz, as UTC ISO strings. */
export function dayBounds(date: string, tz: string) {
  const ymd = date.split('-').map(Number) as YMD;
  const at = (h: number) => zoned(tz, ymd, h).toISOString();
  return { start: at(0), end: at(24), from: at(8), to: at(20) };
}
