// Voice in (Web Speech API) and voice out (the ElevenLabs AI voice from /tts, with audio-driven lip sync).
import type { Lang, Mood } from '../types.ts';

// Minimal typing for the (still prefixed in Chrome) Web Speech recognition API.
interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface Recognition {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type RecognitionCtor = new () => Recognition;
const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;

export const canListen = Boolean(SR);
export const speechLang = (lang: Lang) => (lang === 'id' ? 'id-ID' : 'en-US');

let rec: Recognition | null = null;

/** Listens for one utterance. Resolves with the final text ('' when nothing was said). */
export function listenOnce(lang: Lang, onInterim: (text: string) => void): Promise<string> {
  if (!SR) return Promise.reject(new Error('Speech recognition needs Chrome or Edge.'));
  stopListening();
  return new Promise((resolve, reject) => {
    const r = new SR();
    rec = r;
    r.lang = speechLang(lang); r.interimResults = true; r.continuous = false;
    let finalText = '';
    r.onresult = (e) => {
      let s = '';
      for (const res of Array.from(e.results)) s += res[0].transcript;
      onInterim(s);
      const last = e.results[e.results.length - 1];
      if (last?.isFinal) finalText = s;
    };
    r.onerror = (e) => { if (!['no-speech', 'aborted'].includes(e.error)) reject(new Error(`Microphone: ${e.error}`)); };
    r.onend = () => { if (rec === r) rec = null; resolve(finalText.trim()); };
    r.start();
  });
}
export const stopListening = () => { rec?.abort(); rec = null; };

// ---- voice out ----
let ctx: AudioContext | undefined;
let current: AudioBufferSourceNode | null = null;
let speakId = 0;

/** Call from a user gesture once so audio may play. */
export function unlockAudio() {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
}

export function stopSpeaking() {
  speakId++;
  try { current?.stop(); } catch { /* already stopped */ }
  current = null;
}

async function play(buf: ArrayBuffer, id: number, onLevel: (l: number) => void) {
  unlockAudio();
  const audio = await ctx!.decodeAudioData(buf);
  if (id !== speakId) return;
  const src = ctx!.createBufferSource(); src.buffer = audio;
  const analyser = ctx!.createAnalyser(); analyser.fftSize = 1024;
  src.connect(analyser); analyser.connect(ctx!.destination);
  const data = new Float32Array(analyser.fftSize);
  let raf = 0;
  const tick = () => {
    analyser.getFloatTimeDomainData(data);
    let sum = 0; for (const v of data) sum += v * v;
    onLevel(Math.min(1, Math.sqrt(sum / data.length) * 5.5));
    raf = requestAnimationFrame(tick);
  };
  current = src;
  await new Promise<void>((resolve) => { src.onended = () => resolve(); src.start(); tick(); });
  cancelAnimationFrame(raf);
}

export const speakable = (text: string) => text.replace(/\p{Extended_Pictographic}|️/gu, '').replace(/[*_#`"“”]/g, '').trim();

/** Speaks `text` with the AI voice. Resolves when done or interrupted; returns false when interrupted. */
export interface SpeakOptions {
  mood: Mood;
  voice?: string;
  lang: Lang;
  onStart?: () => void;
  onLevel: (level: number) => void;
  /** Where AI-voice audio goes instead of the speakers (e.g. a Simli avatar that plays it lip-synced). */
  sink?: (audio: ArrayBuffer, isCurrent: () => boolean) => Promise<void>;
}

export async function speak(text: string, opts: SpeakOptions): Promise<boolean> {
  const id = ++speakId;
  const clean = speakable(text);
  if (!clean) return true;
  try {
    const res = await fetch('/tts', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: clean.slice(0, 1500), mood: opts.mood, voice: opts.voice, lang: opts.lang }) });
    if (id !== speakId) return false;
    opts.onStart?.();
    if (res.status === 200) {
      const audio = await res.arrayBuffer();
      if (opts.sink) await opts.sink(audio, () => id === speakId);
      else await play(audio, id, opts.onLevel);
    } else if (res.status !== 204) { // 204 = no AI voice configured: Mochi answers in text only
      console.warn('TTS', res.status, await res.text());
    }
  } catch (err) {
    console.warn(err);
  }
  return id === speakId;
}
