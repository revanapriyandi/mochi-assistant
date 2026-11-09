// History page: everything said to and by Mochi in this session.
import type { Mood, TranscriptLine } from '../../types.ts';
import { $, call, el, t } from '../api.ts';
import { fmt } from '../cards.ts';
import { mountShell } from '../shell.ts';

const lang = await mountShell('history');
const FACE: Record<Mood, string> = { happy: '😺', concerned: '😿', confused: '🙀', neutral: '🐱' };
const list = $('#content');

async function load() {
  const lines = await call<TranscriptLine[]>('/history/data');
  list.replaceChildren();
  if (!lines.length) {
    list.append(el('p', 'muted', t(lang, 'No conversation yet. Go to Talk and say hi to Mochi.', 'Belum ada percakapan. Buka Bicara dan sapa Mochi.')));
    return;
  }
  let lastDay = '';
  for (const line of lines) {
    const iso = new Date(line.at).toISOString();
    const day = fmt(iso, lang, { weekday: 'long', day: 'numeric', month: 'long' });
    if (day !== lastDay) { list.append(el('h3', 'day', day)); lastDay = day; }
    const row = el('div', `line ${line.who}`);
    const bubble = el('div', 'bubble', line.text);
    const meta = el('small', 'meta', `${line.who === 'bot' ? `${FACE[line.mood ?? 'neutral']} Mochi · ` : ''}${fmt(iso, lang, { hour: '2-digit', minute: '2-digit' })}`);
    if (line.tools?.length) meta.title = line.tools.join(', ');
    row.append(bubble, meta);
    list.append(row);
  }
  list.lastElementChild?.scrollIntoView({ block: 'end' });
}

$('#title').textContent = t(lang, 'History', 'Riwayat');
$('#clear').textContent = t(lang, 'Clear', 'Hapus');
$('#clear').addEventListener('click', async () => {
  if (!confirm(t(lang, 'Clear the whole conversation? Mochi also forgets its context.', 'Hapus seluruh percakapan? Mochi juga melupakan konteksnya.'))) return;
  await call('/history/data', 'DELETE');
  await load();
});
await load();
