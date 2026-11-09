// Settings page: the user's profile (stored by the first-party API), voice, and connections.
import type { Me, Profile } from '../../types.ts';
import { $, call, el, getMe, t } from '../api.ts';
import { mountShell } from '../shell.ts';
import { speak, unlockAudio } from '../voice.ts';

const lang = await mountShell('settings');
const me: Me = await getMe();
const form = $<HTMLFormElement>('#profile');
const FIELDS: (keyof Profile)[] = ['nickname', 'city', 'units', 'language', 'style', 'eventMinutes', 'voice'];
const field = (k: keyof Profile) => form.elements.namedItem(k) as HTMLInputElement | HTMLSelectElement;

const LABELS: Record<string, [string, string]> = {
  title: ['Settings', 'Pengaturan'], profileTitle: ['Profile', 'Profil'], voiceTitle: ['Voice', 'Suara'], connTitle: ['Connections', 'Koneksi'],
  nickname: ['Call me', 'Panggil aku'], city: ['Default city', 'Kota default'], units: ['Units', 'Satuan'], language: ['Language', 'Bahasa'],
  style: ['Reply style', 'Gaya balasan'], eventMinutes: ['Default event length (min)', 'Durasi acara default (menit)'], voice: ["Mochi's voice", 'Suara Mochi'],
  save: ['Save', 'Simpan'], test: ['▶ Test voice', '▶ Coba suara'], logout: ['Log out', 'Keluar'],
};
for (const node of document.querySelectorAll<HTMLElement>('[data-label]')) {
  const pair = LABELS[node.dataset.label!];
  if (pair) node.firstChild!.textContent = t(lang, ...pair);
}

function fill(p: Profile) { for (const k of FIELDS) field(k).value = String(p[k]); }
fill(me.profile);

function connections(m: Me) {
  const list = $('#connections'); list.replaceChildren();
  const row = (label: string, value: string | HTMLElement, ok = true) => {
    const r = el('div', 'conn'); r.append(el('span', ok ? 'dot ok' : 'dot'), el('b', null, label));
    const v = el('span', 'value'); v.append(value); r.append(v); list.append(r);
  };
  row('Auth0', `${t(lang, 'Signed in as', 'Masuk sebagai')} ${m.user.email ?? m.user.name ?? ''}`);
  row(t(lang, 'Profile API', 'API Profil'), t(lang, 'Called with your Auth0 access token', 'Dipanggil dengan access token Auth0 kamu'));
  if (m.calendar) row('Google Calendar', t(lang, 'Connected via Auth0 Token Vault', 'Terhubung lewat Auth0 Token Vault'));
  else {
    const a = el('a', 'button small', t(lang, 'Connect', 'Hubungkan')); a.href = '/connect/google';
    row('Google Calendar', a, false);
  }
  row(t(lang, 'Brain', 'Otak'), m.brain);
  row(t(lang, 'Voice', 'Suara'), m.voice === 'off' ? t(lang, 'Off: Mochi replies in text (set ELEVENLABS_API_KEY for its voice)', 'Mati: Mochi membalas lewat teks (isi ELEVENLABS_API_KEY untuk suaranya)') : m.voice);
}
connections(me);

const params = new URLSearchParams(location.search);
const note = $('#note');
if (params.get('error')) { note.textContent = `⚠️ ${params.get('error')}`; note.className = 'note error'; }
else if (params.has('connected')) note.textContent = me.calendar ? t(lang, '📅 Google Calendar connected!', '📅 Google Calendar terhubung!') : '';
if (params.size) history.replaceState(null, '', '/settings');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(FIELDS.map((k) => [k, k === 'eventMinutes' ? Number(field(k).value) : field(k).value.trim()]));
  try {
    const saved = await call<Profile>('/settings', 'PUT', body);
    fill(saved);
    note.className = 'note'; note.textContent = t(lang, '✅ Saved', '✅ Tersimpan');
    if (saved.language !== lang) location.reload(); // relabel the app in the new language
  } catch (err) {
    note.className = 'note error'; note.textContent = `⚠️ ${(err as Error).message}`;
  }
});

$('#test').addEventListener('click', () => {
  unlockAudio();
  const sample = field('language').value === 'id' ? 'Halo! Aku Mochi. Begini suaraku kalau aku sedang senang.' : "Hi! I'm Mochi. This is how I sound when I'm happy.";
  void speak(sample, { mood: 'happy', voice: field('voice').value, lang: field('language').value === 'id' ? 'id' : 'en', onLevel: () => {} });
});
