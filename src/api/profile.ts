// First-party API: trusts only a Bearer access token issued by Auth0 for this API's audience.
import express from 'express';
import { auth as bearer } from 'express-oauth2-jwt-bearer';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { config } from '../config.ts';
import type { Profile } from '../types.ts';

export const DEFAULT_PROFILE: Profile = { city: 'Jakarta', units: 'celsius', nickname: '', language: 'en', eventMinutes: 60, style: 'friendly', voice: 'cgSgspJ2msm6clMCkdW9' };

export const PROFILE_RULES: { [K in keyof Profile]: (v: unknown) => boolean } = {
  city: (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= 80,
  units: (v) => v === 'celsius' || v === 'fahrenheit',
  nickname: (v) => typeof v === 'string' && v.length <= 40,
  language: (v) => v === 'en' || v === 'id',
  eventMinutes: (v) => Number.isInteger(v) && (v as number) >= 5 && (v as number) <= 480,
  style: (v) => v === 'concise' || v === 'friendly',
  voice: (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{2,40}$/.test(v), // ElevenLabs voice id
};

// ponytail: a JSON file keyed by user id; use a real database for more than one instance.
const DB = new URL('../../profiles.json', import.meta.url);
const load = (): Record<string, Partial<Profile>> => (existsSync(DB) ? JSON.parse(readFileSync(DB, 'utf8')) : {});

export const profileApi = express.Router();
profileApi.use(bearer({ audience: config.audience, issuerBaseURL: `https://${config.auth0Domain}/` }));

profileApi.get('/profile', (req, res) => {
  res.json({ ...DEFAULT_PROFILE, ...load()[req.auth!.payload.sub!] });
});

profileApi.put('/profile', (req, res) => { // partial update: only the fields sent change
  const body = (req.body ?? {}) as Record<string, unknown>;
  const bad = Object.keys(body).filter((k) => !(k in PROFILE_RULES) || !PROFILE_RULES[k as keyof Profile](body[k]));
  if (bad.length) {
    res.status(400).json({ error: `invalid: ${bad.join(', ')}` });
    return;
  }
  const db = load();
  const sub = req.auth!.payload.sub!;
  db[sub] = { ...DEFAULT_PROFILE, ...db[sub], ...body, ...(typeof body.city === 'string' && { city: body.city.trim() }) };
  writeFileSync(DB, JSON.stringify(db, null, 2));
  res.json(db[sub]);
});
