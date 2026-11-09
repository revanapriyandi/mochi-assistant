// Mochi's voice: ElevenLabs only (an AI voice with character, no Google or browser voices).
// Without ELEVENLABS_API_KEY this answers 204 and Mochi replies in text only.
import express from 'express';
import { PROFILE_RULES } from '../api/profile.ts';
import { requiresAuth } from '../auth/session.ts';
import { HttpError } from '../errors.ts';
import type { Me, Mood } from '../types.ts';

export const ttsProvider = (): Me['voice'] => (process.env.ELEVENLABS_API_KEY ? 'ElevenLabs' : 'off');

// Close to ElevenLabs' defaults (stability 0.5, style 0, speed 1): a normal speaking voice. Low stability or
// high style made it drag vowels ("akuuuu"). Moods only nudge it. ELEVENLABS_SPEED (0.7-1.2) scales all moods.
const SPEED = Number(process.env.ELEVENLABS_SPEED) || 1;
const STYLE: Record<Mood, { stability: number; style: number; speed: number }> = {
  happy: { stability: 0.5, style: 0.1, speed: 1 }, concerned: { stability: 0.6, style: 0, speed: 0.95 },
  confused: { stability: 0.55, style: 0, speed: 0.97 }, neutral: { stability: 0.55, style: 0, speed: 1 },
};
const speedFor = (m: Mood) => Math.min(1.2, Math.max(0.7, STYLE[m].speed * SPEED));
const isMood = (m: unknown): m is Mood => typeof m === 'string' && m in STYLE;
export const DEFAULT_VOICE = 'cgSgspJ2msm6clMCkdW9'; // Jessica: young, playful, bright

export const ttsRoutes = express.Router();

ttsRoutes.post('/tts', requiresAuth(), async (req, res) => {
  const { text, mood, voice, lang } = (req.body ?? {}) as { text?: unknown; mood?: unknown; voice?: unknown; lang?: unknown };
  if (typeof text !== 'string' || !text.trim() || text.length > 1500) throw new HttpError(400, 'text (1-1500 chars) required');
  if (voice !== undefined && !PROFILE_RULES.voice(voice)) throw new HttpError(400, 'invalid voice');
  if (ttsProvider() === 'off') {
    res.status(204).end();
    return;
  }
  const m = isMood(mood) ? mood : 'neutral';
  // A profile voice is an ElevenLabs voice id (20 chars); anything older falls back to the configured voice.
  const id = typeof voice === 'string' && voice.length === 20 ? voice : process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${id}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY!, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5',
      // Tell the model the language, else it may read Indonesian with an English accent.
      ...(lang === 'id' || lang === 'en' ? { language_code: lang } : {}),
      voice_settings: { similarity_boost: 0.8, ...STYLE[m], speed: speedFor(m) } }),
  });
  if (!r.ok) throw new HttpError(502, `ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
  res.set('X-TTS-Provider', 'ElevenLabs').type('audio/mpeg').send(Buffer.from(await r.arrayBuffer()));
});
