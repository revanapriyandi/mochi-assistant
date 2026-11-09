// Talk page: voice mode. Tap Mochi once and just talk: it listens, answers aloud, then listens again
// until you tap it to stop. Tapping while it speaks interrupts it (barge-in). Typing is a hidden fallback.
import type { ChatReply, Profile } from '../../types.ts';
import { $, call, el, getMe, t, timeZone } from '../api.ts';
import { cardFor } from '../cards.ts';
import { createCat, type CatState } from '../cat.ts';
import { mountShell } from '../shell.ts';
import type { SimliAvatar } from '../simli.ts';
import { canListen, listenOnce, speak, stopListening, stopSpeaking, unlockAudio } from '../voice.ts';

const lang = await mountShell('talk');
const me = await getMe();
let profile: Profile = me.profile;

const stage = $('#cat');
const cat = createCat(stage);

// Optional photo-real avatar (Simli, when the server has its keys). The 2D cat shows until its video is live.
let simli: SimliAvatar | null = null;
if (me.avatar === 'simli') {
  const { SimliAvatar } = await import('../simli.ts');
  const video = el('video'); video.autoplay = true; video.playsInline = true;
  const audio = el('audio'); audio.autoplay = true;
  stage.append(video, audio);
  simli = new SimliAvatar(video, audio, (live) => stage.classList.toggle('simli-on', live));
}

const STATUS: Record<CatState, string> = {
  idle: canListen ? t(lang, 'Tap Mochi and just talk', 'Ketuk Mochi lalu bicara saja') : t(lang, 'Voice needs Chrome or Edge: tap ⌨ to type', 'Suara butuh Chrome/Edge: ketuk ⌨ untuk mengetik'),
  listening: t(lang, 'Listening…', 'Mendengarkan…'),
  thinking: t(lang, 'Thinking…', 'Berpikir…'),
  speaking: t(lang, 'Speaking · tap to interrupt', 'Berbicara · ketuk untuk menyela'),
  sleeping: t(lang, 'Zzz… tap to wake Mochi', 'Zzz… ketuk untuk membangunkan Mochi'),
};
let session = false, phase: CatState = 'idle', misses = 0;

function setPhase(p: CatState) {
  phase = p;
  cat.setState(p);
  stage.dataset.state = p;
  $('#status').textContent = STATUS[p];
  $('#session').hidden = !session;
}

function render(r: ChatReply) {
  $('#said').textContent = r.text;
  const badges = $('#badges'); badges.replaceChildren();
  if (r.decision) {
    const b = el('span', 'badge strong', `🧭 ${r.decision.route === 'quick' ? t(lang, 'Fast path', 'Jalur cepat') : 'Agent'}`);
    b.title = r.decision.reason + (r.decision.tools.length ? `\n${r.decision.tools.join(', ')}` : '');
    badges.append(b);
  }
  if (r.note) badges.append(el('span', 'badge', `⚡ ${r.note}`));
  const mutated = r.cards.some((c) => c.tool === 'update_calendar_event' || c.tool === 'delete_calendar_event');
  const cards = $('#cards'); cards.replaceChildren();
  for (const c of r.cards) {
    if (c.tool === 'update_profile') profile = c.data;
    const card = cardFor(c, profile.language, mutated);
    if (card) cards.append(card);
  }
}

async function respond(message: string, byVoice: boolean) {
  $('#heard').textContent = message;
  $('#said').textContent = '';
  $('#badges').replaceChildren(); $('#cards').replaceChildren();
  setPhase('thinking');
  let r: ChatReply;
  try {
    r = await call<ChatReply>('/chat', 'POST', { message, timeZone });
  } catch (err) {
    cat.setMood('confused'); $('#said').textContent = `⚠️ ${(err as Error).message}`;
    return;
  }
  cat.setMood(r.mood);
  render(r);
  if (byVoice && !session) return; // the session was ended while thinking
  setPhase('speaking');
  await speak(r.text, { mood: r.mood, voice: profile.voice, lang: profile.language, onLevel: (l) => cat.setVoiceLevel(l),
    sink: simli?.connected ? (audio, isCurrent) => simli!.say(audio, isCurrent) : undefined });
}

async function conversation() {
  while (session) {
    setPhase('listening');
    let heard: string;
    try {
      heard = await listenOnce(profile.language, (s) => { $('#heard').textContent = s; });
    } catch (err) {
      $('#said').textContent = `⚠️ ${(err as Error).message}`; cat.setMood('confused');
      end(); return;
    }
    if (!session) return;
    if (!heard) { // silence: give it one more try, then take a nap
      if (++misses >= 2) { end(true); return; }
      continue;
    }
    misses = 0;
    await respond(heard, true);
  }
}

function start() {
  unlockAudio();
  session = true; misses = 0;
  cat.wake();
  $('#hint').hidden = true;
  simli?.start().catch((err) => console.warn('Simli unavailable, staying 2D:', err));
  void conversation();
}
function end(sleepy = false) {
  session = false;
  stopListening(); stopSpeaking();
  void simli?.stop(); // free tier is per minute: don't keep the stream open between conversations
  setPhase(sleepy ? 'sleeping' : 'idle');
}

function tap() {
  if (!canListen) { toggleKeyboard(true); return; }
  if (!session) start();
  else if (phase === 'speaking') { stopSpeaking(); simli?.interrupt(); } // barge-in: the loop goes back to listening
  else end();
}
stage.addEventListener('click', tap);
stage.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(); } });
$('#session').addEventListener('click', () => end());
addEventListener('keydown', (e) => { if (e.key === 'Escape' && session) end(); });

// Typing: hidden by default, for browsers without speech recognition or quiet places.
function toggleKeyboard(show = $('#typing').hidden) {
  $('#typing').hidden = !show;
  $('#kbd').setAttribute('aria-expanded', String(show));
  if (show) $<HTMLInputElement>('#msg').focus();
}
$('#kbd').addEventListener('click', () => toggleKeyboard());
$<HTMLFormElement>('#typing').addEventListener('submit', async (e) => {
  e.preventDefault();
  unlockAudio();
  const input = $<HTMLInputElement>('#msg');
  const m = input.value.trim(); input.value = '';
  if (!m) return;
  if (session) end();
  await respond(m, false);
  setPhase('idle');
});

$('#hint').textContent = t(lang, '🎙 One tap starts a voice conversation · tap again to stop · stroke Mochi to pet',
  '🎙 Sekali ketuk untuk mulai ngobrol · ketuk lagi untuk berhenti · elus Mochi dengan menggeser');
$('#session').textContent = t(lang, '■ End conversation', '■ Akhiri percakapan');
$<HTMLInputElement>('#msg').placeholder = t(lang, 'Type to Mochi…', 'Ketik ke Mochi…');
$('#kbd').title = t(lang, 'Type instead', 'Ketik saja');
const name = profile.nickname || me.user.given_name || '';
$('#said').textContent = t(lang, `Hi ${name}! Tap me and just talk.`, `Halo ${name}! Ketuk aku lalu bicara saja.`);
cat.setMood('happy');
setPhase('idle');
