// Simli real-time avatar: the server mints a short-lived session token so the API key never reaches the browser.
import express from 'express';
import { requiresAuth } from '../auth/session.ts';
import { HttpError } from '../errors.ts';

export const simliEnabled = () => Boolean(process.env.SIMLI_API_KEY && process.env.SIMLI_FACE_ID);

export const simliRoutes = express.Router();

simliRoutes.post('/simli/token', requiresAuth(), async (_req, res) => {
  if (!simliEnabled()) throw new HttpError(404, 'Simli is not configured (SIMLI_API_KEY, SIMLI_FACE_ID)');
  const r = await fetch('https://api.simli.ai/compose/token', {
    method: 'POST',
    headers: { 'x-simli-api-key': process.env.SIMLI_API_KEY!, 'content-type': 'application/json' },
    body: JSON.stringify({ faceId: process.env.SIMLI_FACE_ID, maxSessionLength: 900, maxIdleTime: 120, handleSilence: true }),
  });
  const data = await r.json().catch(() => ({})) as { session_token?: string; detail?: unknown };
  if (!r.ok || !data.session_token) throw new HttpError(502, `Simli ${r.status}: ${JSON.stringify(data.detail ?? data).slice(0, 200)}`);
  res.json({ session_token: data.session_token });
});
