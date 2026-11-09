// Keyword engine: the fast path. Answers simple, explicit requests without an LLM, and is the whole brain
// when no LLM key is set. It calls the same tools as the LLM agent, so the identity flow is identical.
// ponytail: regex intents (English + Indonesian keywords); anything vague goes to the LLM (handled: false).
import type { Briefing, Card, DayForecast, Lang, Profile, ToolName, ToolResults, Weather } from '../types.ts';
import type { ToolCtx } from './context.ts';
import { clock, isoDate, parseTimes, today, zoned, type YMD } from './time.ts';
import { runTool, type ToolInputs } from './tools.ts';

const DAYS: Record<string, number> = { today: 0, 'hari ini': 0, tonight: 0, 'nanti malam': 0, tomorrow: 1, besok: 1, lusa: 2 };
const DAY_RE = /\b(today|tonight|tomorrow|hari ini|nanti malam|besok|lusa)\b/i;
const QUOTED = /["'“‘](.+?)["'”’]/;

type Fc = DayForecast & { place: string; unit: string };
const langName = (p: Profile) => (p.language === 'id' ? 'Bahasa Indonesia' : 'English');

const SAY = {
  en: {
    days: ['today', 'tomorrow', 'the day after tomorrow'],
    notConnected: 'Your Google Calendar isn\'t connected yet. Connect it in Settings, then ask again.',
    vetoed: 'Not approved on your phone, so I left your calendar as it was.',
    askTitle: 'What should I call the event? Try: add "Demo prep" tomorrow at 4.',
    askTime: (t: string, d: string) => `What time should "${t}" be? Try: add "${t}" ${d} at 4.`,
    created: (t: string, d: string, c: string) => `Done. "${t}" is on your Google Calendar ${d} at ${c}.`,
    saved: (p: Profile) => `Saved: ${p.city}, ${p.units}, ${langName(p)}, ${p.eventMinutes}-minute events, ${p.style} replies${p.nickname ? `, and I'll call you ${p.nickname}` : ''}.`,
    busy: (t: string, c: string) => `You're busy then: "${t}" at ${c}.`,
    free: (w: string, c: string) => `You're free ${w} at ${c}.`,
    count: (n: number, w: string) => (n ? `You have ${n} event${n > 1 ? 's' : ''} ${w}.` : `Your calendar is clear ${w}.`),
    week: 'this week',
    noPlace: (c: string) => `I couldn't find a place called "${c}".`,
    weather: (w: Weather, fromProfile: boolean, city: string) => `It's ${w.desc} in ${w.place}, ${Math.round(w.temp)}${w.unit}${fromProfile ? ` (${city} is your default city)` : ''}.`,
    profile: (p: Profile) => `Your settings: ${p.city}, ${p.units}, ${langName(p)}, ${p.eventMinutes}-minute events, ${p.style} replies.`,
    hi: (n: string) => `Hi ${n}! I can check the weather, read and change your Google Calendar, find free time, brief you on your day, and change your settings.`,
    forecast: (f: Fc, w: string) => `${cap(w)} in ${f.place}: ${f.desc}, ${Math.round(f.min)} to ${Math.round(f.max)}${f.unit}${f.rain != null ? `, ${f.rain}% chance of rain` : ''}.`,
    week7: (place: string, days: string[]) => `This week in ${place}: ${days.join(', ')}.`,
    slots: (s: string[], w: string, m: number) => (s.length ? `You're free ${w} for ${m}+ minutes at ${s.join(', ')}.` : `No free ${m}-minute slot ${w} between 08:00 and 20:00.`),
    notFound: (t: string) => `I couldn't find an event called "${t}" in the next two weeks.`,
    many: (t: string, n: number) => `${n} events match "${t}". Say the full title so I change the right one.`,
    moved: (t: string, d: string, c: string) => `Moved "${t}" to ${d} at ${c}.`,
    deleted: (t: string, d: string) => `Deleted "${t}" (${d}) from your Google Calendar.`,
    briefing: (w: string, b: Briefing) => `Here's ${w}: ${b.forecast ? `${b.forecast.desc}, ${Math.round(b.forecast.min)} to ${Math.round(b.forecast.max)}${b.unit}` : 'no forecast'}, ${b.events.length} event${b.events.length === 1 ? '' : 's'}.`,
  },
  id: {
    days: ['hari ini', 'besok', 'lusa'],
    notConnected: 'Google Calendar kamu belum terhubung. Hubungkan di Pengaturan, lalu tanya lagi.',
    vetoed: 'Tidak disetujui di HP kamu, jadi kalendermu tidak kuubah.',
    askTitle: 'Acaranya mau dinamai apa? Coba: tambah "Persiapan demo" besok jam 4.',
    askTime: (t: string, d: string) => `Jam berapa "${t}"? Coba: tambah "${t}" ${d} jam 16.`,
    created: (t: string, d: string, c: string) => `Beres. "${t}" sudah masuk Google Calendar kamu ${d} jam ${c}.`,
    saved: (p: Profile) => `Tersimpan: ${p.city}, ${p.units}, ${langName(p)}, acara ${p.eventMinutes} menit, gaya ${p.style === 'concise' ? 'singkat' : 'ramah'}${p.nickname ? `, dan aku panggil kamu ${p.nickname}` : ''}.`,
    busy: (t: string, c: string) => `Kamu sibuk saat itu: "${t}" jam ${c}.`,
    free: (w: string, c: string) => `Kamu kosong ${w} jam ${c}.`,
    count: (n: number, w: string) => (n ? `Ada ${n} acara ${w}.` : `Kalender kamu kosong ${w}.`),
    week: 'minggu ini',
    noPlace: (c: string) => `Aku tidak menemukan tempat bernama "${c}".`,
    weather: (w: Weather, fromProfile: boolean, city: string) => `Di ${w.place} sekarang ${w.descId}, ${Math.round(w.temp)}${w.unit}${fromProfile ? ` (${city} kota default kamu)` : ''}.`,
    profile: (p: Profile) => `Pengaturanmu: ${p.city}, ${p.units}, ${langName(p)}, acara ${p.eventMinutes} menit, gaya ${p.style === 'concise' ? 'singkat' : 'ramah'}.`,
    hi: (n: string) => `Halo ${n}! Aku bisa cek cuaca, membaca dan mengubah Google Calendar kamu, mencari waktu kosong, memberi gambaran harimu, dan mengubah pengaturan.`,
    forecast: (f: Fc, w: string) => `${cap(w)} di ${f.place}: ${f.descId}, ${Math.round(f.min)} sampai ${Math.round(f.max)}${f.unit}${f.rain != null ? `, peluang hujan ${f.rain}%` : ''}.`,
    week7: (place: string, days: string[]) => `Minggu ini di ${place}: ${days.join(', ')}.`,
    slots: (s: string[], w: string, m: number) => (s.length ? `Kamu kosong ${w} (${m}+ menit) jam ${s.join(', ')}.` : `Tidak ada waktu kosong ${m} menit ${w} antara 08:00 dan 20:00.`),
    notFound: (t: string) => `Aku tidak menemukan acara "${t}" dalam dua minggu ke depan.`,
    many: (t: string, n: number) => `Ada ${n} acara yang cocok dengan "${t}". Sebut judul lengkapnya supaya tidak salah.`,
    moved: (t: string, d: string, c: string) => `"${t}" sudah dipindah ke ${d} jam ${c}.`,
    deleted: (t: string, d: string) => `"${t}" (${d}) sudah dihapus dari Google Calendar kamu.`,
    briefing: (w: string, b: Briefing) => `Gambaran ${w}: ${b.forecast ? `${b.forecast.descId}, ${Math.round(b.forecast.min)} sampai ${Math.round(b.forecast.max)}${b.unit}` : 'tanpa prakiraan'}, ${b.events.length} acara.`,
  },
} satisfies Record<Lang, unknown>;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export interface KeywordReply { text: string; cards: Card[]; handled?: false }

export async function localChat(message: string, ctx: ToolCtx): Promise<KeywordReply> {
  const text = message.trim();
  const lower = text.toLowerCase();
  const cards: Card[] = [];
  const tool = async <N extends ToolName>(name: N, input: ToolInputs[N]): Promise<ToolResults[N]> => {
    const data = await runTool(name, input, ctx);
    cards.push({ tool: name, data } as Card);
    return data;
  };
  let profile = await tool('get_profile', {}); // every reply follows the user's saved settings
  let L = SAY[profile.language] ?? SAY.en;
  const reply = (s: string): KeywordReply => ({ text: s, cards });
  const calendar = async (fn: () => Promise<KeywordReply>): Promise<KeywordReply> => {
    try { return await fn(); } catch (err) {
      if (/not connected/i.test((err as Error).message)) return reply(L.notConnected);
      if (/not approved/i.test((err as Error).message)) return reply(L.vetoed);
      throw err;
    }
  };
  const dayWord = lower.match(DAY_RE)?.[1];
  const offset = dayWord ? DAYS[dayWord] : 0;
  const day = today(ctx.timeZone, offset);
  const when = L.days[offset];
  const tz = ctx.timeZone;
  const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { timeZone: tz });

  // Create: "Add 'Demo prep' tomorrow 4-5pm" / "Tambah rapat besok jam 3"
  const create = text.match(/^(?:please\s+)?(?:add|create|schedule|book|tambah(?:kan)?|buat(?:kan)?|jadwalkan)\b\s*(.*)$/i);
  if (create) {
    const rest = create[1];
    const title = (rest.match(QUOTED)?.[1] ?? rest.split(/\b(?:today|tonight|tomorrow|hari ini|nanti malam|besok|lusa|at|jam|pukul|on|to my|ke)\b|\d/i)[0]).trim();
    const times = parseTimes(rest, profile.eventMinutes);
    if (!title) return reply(L.askTitle);
    if (!times) return reply(L.askTime(title, dayWord ?? L.days[1]));
    return calendar(async () => {
      const { created } = await tool('create_calendar_event', { summary: title,
        start: zoned(tz, day, ...times.start).toISOString(), end: zoned(tz, day, ...times.end).toISOString() });
      return reply(L.created(created.summary, when, clock(created.start, tz)));
    });
  }

  // Move / delete by title: "Move 'Demo prep' to 5pm" / "Hapus 'Rapat tim'"
  const move = text.match(/^(?:please\s+)?(?:move|reschedule|pindah(?:kan)?|geser|undur(?:kan)?|majukan)\b\s*(.*)$/i);
  const del = text.match(/^(?:please\s+)?(?:delete|remove|cancel|hapus(?:kan)?|batal(?:kan)?)\b\s*(.*)$/i);
  if (move || del) {
    const rest = (move ?? del)![1];
    const title = (rest.match(QUOTED)?.[1] ?? rest.split(/\b(?:to|ke|today|tomorrow|hari ini|besok|lusa|at|jam|pukul)\b|\d/i)[0])
      .replace(/\b(?:event|acara|my|the)\b/gi, '').trim();
    return calendar(async () => {
      const { events } = await tool('list_calendar_events', { time_min: new Date().toISOString(), time_max: new Date(Date.now() + 14 * 864e5).toISOString() });
      const t = title.toLowerCase();
      const exact = events.filter((e) => e.summary.toLowerCase() === t);
      const found = exact.length ? exact : events.filter((e) => e.summary.toLowerCase().includes(t));
      if (!title || !found.length) return reply(L.notFound(title));
      if (found.length > 1) return reply(L.many(title, found.length));
      const ev = found[0];
      if (del) {
        await tool('delete_calendar_event', { event_id: ev.id! });
        return reply(L.deleted(ev.summary, `${dateLabel(ev.start)} ${clock(ev.start, tz)}`));
      }
      const length = (new Date(ev.end).getTime() - new Date(ev.start).getTime()) / 60000;
      const times = parseTimes(rest.slice(rest.search(/\b(?:to|ke)\b/i) + 1), length);
      if (!times) return reply(L.askTime(ev.summary, dayWord ?? L.days[1]));
      const evDay: YMD = dayWord ? day : isoDate(new Date(ev.start), tz).split('-').map(Number) as YMD;
      const { updated } = await tool('update_calendar_event', { event_id: ev.id!,
        start: zoned(tz, evDay, ...times.start).toISOString(), end: zoned(tz, evDay, ...times.end).toISOString() });
      return reply(L.moved(updated.summary, dayWord ? when : dateLabel(updated.start), clock(updated.start, tz)));
    });
  }

  // Settings: city, units, nickname, language, event length, style
  const change: Partial<Profile> = {};
  const verb = /\b(use|speak|reply|switch|change|set|pakai|ganti|ubah|balas|jawab)\b/.test(lower);
  const city = text.match(/\b(?:change|set|update|ganti|ubah)\s+(?:my\s+)?(?:default\s+)?(?:city|kota)(?:\s+(?:saya|aku))?\s+(?:to|ke|jadi|menjadi)\s+(.+?)[.!?]*$/i)?.[1];
  if (city) change.city = city;
  const units = lower.match(/\b(fahrenheit|celsius)\b/)?.[1];
  if (units && verb) change.units = units as Profile['units'];
  const nick = text.match(/\b(?:call me|panggil (?:aku|saya))\s+(.+?)[.!?]*$/i)?.[1];
  if (nick) change.nickname = nick.slice(0, 40);
  if (/\b(bahasa indonesia|indonesian|pakai bahasa indo)/.test(lower) && verb) change.language = 'id';
  if (/\b(english|bahasa inggris|inggris)\b/.test(lower) && verb) change.language = 'en';
  const mins = lower.match(/\b(?:events?|acara)\b.*?\b(\d{1,3})\s*(?:min|minutes|menit)\b|\b(\d{1,3})\s*(?:min|minutes|menit)\s*(?:events?|acara)/);
  if (mins) change.eventMinutes = Math.min(480, Math.max(5, +(mins[1] ?? mins[2])));
  if (/\b(be (?:more )?concise|shorter|singkat|ringkas)\b/.test(lower)) change.style = 'concise';
  if (/\b(be (?:more )?friendly|friendlier|ramah)\b/.test(lower)) change.style = 'friendly';
  if (Object.keys(change).length) {
    profile = await tool('update_profile', change);
    L = SAY[profile.language] ?? SAY.en;
    return reply(L.saved(profile));
  }

  // Decisions / briefing: "Brief me on tomorrow" / "Sebaiknya aku bawa payung?" / "Best time to exercise"
  if (/brief|how does my day|how's my day|plan (?:my|for) (?:day|tomorrow)|should i|best time|recommend|advice|rencana hari|hariku|sebaiknya|waktu terbaik|saran|rekomendasi/.test(lower)) {
    const b = await tool('day_briefing', { date: isoDate(zoned(tz, day, 12), tz), city: profile.city, units: profile.units });
    const recs = b.recommendations.map((r) => r.text).join(' ');
    return reply(`${L.briefing(when, b)} ${recs}${b.calendar ? '' : ` ${L.notConnected}`}`.trim());
  }

  // Free time: "Find a free hour tomorrow" / "Cari waktu kosong besok 30 menit"
  if (/free (?:time|slot|hour)|find (?:a |me )?(?:free|slot|time)|waktu (?:kosong|luang)|slot kosong|cari waktu/.test(lower)) {
    return calendar(async () => {
      const m = lower.match(/(\d{1,3})\s*(min|minutes|menit|hours?|jam)\b/);
      const minutes = m ? +m[1] * (/^(h|jam)/.test(m[2]) ? 60 : 1) : /\b(an hour|1 hour|satu jam|sejam)\b/.test(lower) ? 60 : profile.eventMinutes;
      // ponytail: fixed 08:00-20:00 search window; make it a setting if people ask
      const { slots } = await tool('find_free_time', { time_min: zoned(tz, day, 8).toISOString(), time_max: zoned(tz, day, 20).toISOString(), minutes });
      return reply(L.slots(slots.map((s) => `${clock(s.start, tz)}-${clock(s.end, tz)}`), when, minutes));
    });
  }

  // Calendar questions: "What's on my calendar tomorrow?" / "Am I free at 3pm?" / "Jadwal besok"
  if (/calendar|kalender|agenda|schedule|jadwal|meeting|rapat|event|acara|\bfree\b|busy|kosong|sibuk/.test(lower)) {
    return calendar(async () => {
      const week = /this week|minggu ini/.test(lower);
      const { events } = await tool('list_calendar_events', { time_min: zoned(tz, day).toISOString(), time_max: zoned(tz, today(tz, offset + (week ? 7 : 1))).toISOString() });
      const span = week ? L.week : when;
      const times = parseTimes(text, 60);
      if (times && /free|busy|kosong|sibuk|available|luang/.test(lower)) {
        const s = zoned(tz, day, ...times.start), e = zoned(tz, day, ...times.end);
        const clash = events.find((ev) => new Date(ev.start) < e && new Date(ev.end) > s);
        return reply(clash ? L.busy(clash.summary, clock(clash.start, tz)) : L.free(span, clock(s, tz)));
      }
      return reply(L.count(events.length, span));
    });
  }

  // Weather: "Weather in Tokyo?" / "Cuaca hari ini?" / "Weather this week"
  if (/weather|cuaca|rain|hujan|temperature|suhu|panas|dingin|umbrella|payung/.test(lower)) {
    const asked = text.match(/\b(?:in|di)\s+([\p{L}][\p{L}\s.'-]*?)\s*(?:\b(?:today|tomorrow|now|right now|hari ini|besok|lusa|sekarang|this week|minggu ini)\b)?[?.!]*$/iu)?.[1]?.trim();
    const week = /this week|minggu ini|forecast|prakiraan|7 days|seminggu/.test(lower);
    const w = await tool('get_weather', { city: asked || profile.city, units: profile.units, days: week ? 7 : offset > 0 ? offset + 1 : 0 });
    if ('error' in w) return reply(L.noPlace(asked ?? profile.city));
    if (week && w.forecast) {
      const fmt = new Intl.DateTimeFormat(profile.language === 'id' ? 'id-ID' : 'en-GB', { weekday: 'short' });
      return reply(L.week7(w.place, w.forecast.map((d) => `${fmt.format(new Date(`${d.date}T12:00:00Z`))} ${Math.round(d.max)}${w.unit}`)));
    }
    const f = w.forecast?.[offset];
    if (offset > 0 && f) return reply(L.forecast({ ...f, place: w.place, unit: w.unit }, when));
    return reply(L.weather(w, !asked, profile.city));
  }

  if (/profile|profil|setting|pengaturan/.test(lower)) return reply(L.profile(profile));
  return { ...reply(L.hi(profile.nickname || ctx.name)), handled: false }; // not understood: the orchestrator may hand off
}
