// Simli real-time avatar: a photo-real Mochi made from a single photo. We send it the AI voice audio
// (16-bit PCM, 16 kHz, mono) and it plays that audio with a lip-synced video of the cat.
import { LogLevel, SimliClient } from 'simli-client';
import { call } from './api.ts';

/** Decode any audio (WAV/MP3) and resample it to 16 kHz mono PCM16 bytes, as Simli expects. */
async function toPcm16(audio: ArrayBuffer): Promise<Uint8Array> {
  const decoded = await new OfflineAudioContext(1, 1, 16000).decodeAudioData(audio); // decodes at 16 kHz
  const ch = decoded.numberOfChannels;
  const out = new Int16Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) {
    let s = 0;
    for (let c = 0; c < ch; c++) s += decoded.getChannelData(c)[i];
    out[i] = Math.max(-1, Math.min(1, s / ch)) * 0x7fff;
  }
  return new Uint8Array(out.buffer);
}

export class SimliAvatar {
  private video: HTMLVideoElement;
  private audio: HTMLAudioElement;
  private client: SimliClient | null = null;
  private starting: Promise<void> | null = null;
  private talking = false;
  private done: (() => void) | null = null;
  private onLive: (live: boolean) => void;

  constructor(video: HTMLVideoElement, audio: HTMLAudioElement, onLive: (live: boolean) => void) {
    this.video = video;
    this.audio = audio;
    this.onLive = onLive;
  }

  get connected() { return this.client !== null; }

  /** Opens a session (a few seconds). Safe to call repeatedly. */
  start(): Promise<void> {
    if (this.client) return Promise.resolve();
    this.starting ??= (async () => {
      const { session_token } = await call<{ session_token: string }>('/simli/token', 'POST');
      const c = new SimliClient(session_token, this.video, this.audio, null, LogLevel.ERROR);
      c.on('speaking', () => { this.talking = true; });
      c.on('silent', () => { if (this.talking) this.finish(); });
      c.on('stop', () => this.lost());
      c.on('error', (detail) => { console.warn('Simli:', detail); this.lost(); });
      await c.start(); // resolves when the first frame is on screen
      this.client = c;
      this.onLive(true);
    })().finally(() => { this.starting = null; });
    return this.starting;
  }

  /** Speaks an audio clip through the avatar; resolves when it has finished (or was interrupted). */
  async say(audio: ArrayBuffer, isCurrent: () => boolean): Promise<void> {
    const pcm = await toPcm16(audio);
    if (!this.client || !isCurrent()) return;
    this.finish(); // a new clip replaces any wait still pending
    this.talking = false;
    const seconds = pcm.length / 32000;
    const ended = new Promise<void>((resolve) => {
      this.done = resolve;
      setTimeout(resolve, seconds * 1000 + 2500); // never hang if a 'silent' event is missed
    });
    for (let i = 0; i < pcm.length; i += 6000) this.client.sendAudioData(pcm.subarray(i, i + 6000));
    await ended;
  }

  /** Stops talking right away (barge-in). */
  interrupt() {
    try { this.client?.ClearBuffer(); } catch { /* not connected */ }
    this.finish();
  }

  async stop() {
    const c = this.client;
    this.lost();
    await c?.stop().catch(() => {});
  }

  private lost() {
    this.client = null;
    this.finish();
    this.onLive(false);
  }

  private finish() {
    this.done?.();
    this.done = null;
  }
}
