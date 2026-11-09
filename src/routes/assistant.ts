// JSON endpoints used by the pages: /me, settings, chat, agenda, history.
import express from 'express';
import { brain, chat, clearTranscript, resetChat, transcript } from '../assistant/index.ts';
import { isoDate } from '../assistant/time.ts';
import { runTool } from '../assistant/tools.ts';
import { requiresAuth } from '../auth/session.ts';
import { asUser, googleToken } from '../auth/tokens.ts';
import { HttpError } from '../errors.ts';
import type { AgendaData, Me, Profile } from '../types.ts';
import { toolCtx } from './tool-ctx.ts';
import { simliEnabled } from './simli.ts';
import { ttsProvider } from './tts.ts';

export const assistantRoutes = express.Router();
const sub = (req: express.Request) => req.oidc.user!.sub as string;

assistantRoutes.get('/me', requiresAuth(), async (req, res) => {
  const [profile, calendar] = await Promise.all([asUser<Profile>(req), googleToken(req).then(() => true, () => false)]);
  const { name, given_name, email, picture } = req.oidc.user ?? {};
  const voice = ttsProvider();
  // Simli lip-syncs the audio we send it, so it needs the AI voice.
  const avatar = simliEnabled() && voice !== 'off' ? 'simli' : 'cat';
  const me: Me = { user: { name, given_name, email, picture }, profile, calendar, brain: brain(), voice, avatar };
  res.json(me);
});

assistantRoutes.put('/settings', requiresAuth(), async (req, res) => {
  res.json(await asUser<Profile>(req, 'PUT', req.body));
});

assistantRoutes.post('/chat', requiresAuth(), async (req, res) => {
  const message: unknown = req.body?.message;
  if (typeof message !== 'string' || !message.trim() || message.length > 2000) throw new HttpError(400, 'message (1-2000 chars) required');
  res.json(await chat(sub(req), message.trim(), toolCtx(req, req.body.timeZone)));
});
assistantRoutes.post('/chat/reset', requiresAuth(), (req, res) => { res.json({ ok: resetChat(sub(req)) }); });

assistantRoutes.get('/history/data', requiresAuth(), async (req, res) => { res.json(await transcript(sub(req))); });
assistantRoutes.delete('/history/data', requiresAuth(), async (req, res) => { await clearTranscript(sub(req)); res.json({ ok: true }); });

// Agenda page: 7-day forecast, today's and tomorrow's briefings, next 7 days of events.
assistantRoutes.get('/agenda/data', requiresAuth(), async (req, res) => {
  const ctx = toolCtx(req, req.query.tz);
  const profile = await ctx.getProfile();
  const date = (n: number) => isoDate(new Date(Date.now() + n * 864e5), ctx.timeZone);
  const [weather, briefings, events] = await Promise.all([
    runTool('get_weather', { city: profile.city, units: profile.units, days: 7 }, ctx),
    Promise.all([0, 1].map((n) => runTool('day_briefing', { date: date(n), city: profile.city, units: profile.units }, ctx))),
    runTool('list_calendar_events', { time_min: new Date().toISOString(), time_max: new Date(Date.now() + 7 * 864e5).toISOString() }, ctx)
      .then((r) => r.events, () => null), // null = calendar not connected
  ]);
  const data: AgendaData = { profile, weather, briefings, events };
  res.json(data);
});
