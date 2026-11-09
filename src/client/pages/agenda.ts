// Agenda page: the week at a glance (forecast, today/tomorrow briefings, upcoming events).
import type { AgendaData, CalEvent } from '../../types.ts';
import { $, call, el, t, timeZone } from '../api.ts';
import { briefingCard, eventRow, fmt, panel, weatherCard } from '../cards.ts';
import { mountShell } from '../shell.ts';

const lang = await mountShell('agenda');
const main = $('#content');

async function load() {
  main.replaceChildren(el('p', 'muted', t(lang, 'Loading…', 'Memuat…')));
  let d: AgendaData;
  try {
    d = await call<AgendaData>(`/agenda/data?tz=${encodeURIComponent(timeZone)}`);
  } catch (err) {
    main.replaceChildren(el('p', 'error', `⚠️ ${(err as Error).message}`));
    return;
  }
  const top = el('div', 'grid');
  if (!('error' in d.weather)) top.append(weatherCard(d.weather, lang));
  d.briefings.forEach((b, i) => top.append(briefingCard(b, lang, i ? t(lang, 'Tomorrow', 'Besok') : t(lang, 'Today', 'Hari ini'))));

  const week = el('div', 'grid');
  if (d.events === null) {
    const cta = el('section', 'panel cta');
    const a = el('a', 'button', t(lang, '📅 Connect Google Calendar', '📅 Hubungkan Google Calendar')); a.href = '/connect/google';
    cta.append(el('p', null, t(lang, 'Connect your Google Calendar to see your week here. Mochi uses Auth0 Token Vault, so this app never stores your Google tokens.',
      'Hubungkan Google Calendar untuk melihat minggumu di sini. Mochi memakai Auth0 Token Vault, jadi aplikasi ini tidak pernah menyimpan token Google kamu.')), a);
    week.append(cta);
  } else {
    const byDay = new Map<string, CalEvent[]>();
    for (const e of d.events) {
      const key = fmt(e.start.includes('T') ? e.start : `${e.start}T12:00:00Z`, lang, { weekday: 'long', day: 'numeric', month: 'long' });
      byDay.set(key, [...(byDay.get(key) ?? []), e]);
    }
    if (!byDay.size) week.append(panel(t(lang, 'Next 7 days', '7 hari ke depan'), [], t(lang, 'Nothing scheduled. Enjoy!', 'Tidak ada acara. Selamat menikmati!')));
    for (const [day, events] of byDay) week.append(panel(day, events.map((e) => eventRow(e, lang)), ''));
  }
  main.replaceChildren(el('h2', null, t(lang, 'This week', 'Minggu ini')), top, el('h2', null, t(lang, 'Upcoming', 'Mendatang')), week);
}

$('#refresh').textContent = t(lang, '↻ Refresh', '↻ Muat ulang');
$('#title').textContent = 'Agenda';
$('#refresh').addEventListener('click', load);
await load();
