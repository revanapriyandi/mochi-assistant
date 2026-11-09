// Connected Accounts flow (My Account API): links the user's Google account so Token Vault can
// hand out Google Calendar tokens later.
import { randomUUID } from 'node:crypto';
import express from 'express';
import { requiresAuth } from '../auth/session.ts';
import { myAccount } from '../auth/tokens.ts';
import { config } from '../config.ts';
import { HttpError } from '../errors.ts';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const CALLBACK = () => `${config.baseUrl}/connect/callback`;

interface ConnectStart { auth_session: string; connect_uri: string; connect_params: Record<string, string> }
interface PendingConnect { state: string; auth_session: string }
// express-openid-connect stores the session on req.appSession but doesn't declare its type.
const store = (req: express.Request) => (req as express.Request & { appSession: { connect?: PendingConnect } }).appSession;

export const connectRoutes = express.Router();

connectRoutes.get('/connect/google', requiresAuth(), async (req, res) => {
  const state = randomUUID();
  let data: ConnectStart;
  try {
    data = await myAccount<ConnectStart>(req, '/connect', { connection: 'google-oauth2', state,
      redirect_uri: CALLBACK(), scopes: ['openid', 'profile', 'email', CALENDAR_SCOPE] });
  } catch (err) {
    // The My Account API wants a recent login; ask for a fresh one once, then come back here.
    if (!/unmet_authentication_requirements/.test((err as Error).message) || req.query.fresh) throw err;
    return res.oidc.login({ returnTo: '/connect/google?fresh=1', authorizationParams: { prompt: 'login' } });
  }
  store(req).connect = { state, auth_session: data.auth_session };
  res.redirect(`${data.connect_uri}?${new URLSearchParams(data.connect_params)}`);
});

connectRoutes.get('/connect/callback', requiresAuth(), async (req, res) => {
  // The code may arrive in the URL fragment; bounce it into the query once.
  if (!Object.keys(req.query).length) {
    res.send('<script>location.replace("?" + location.hash.slice(1))</script>');
    return;
  }
  const { connect_code, state, error, error_description } = req.query;
  if (error) throw new HttpError(400, `${error}: ${error_description ?? ''}`);
  const pending = store(req).connect;
  if (!pending || state !== pending.state || typeof connect_code !== 'string') throw new HttpError(400, 'Invalid or expired connect request');
  delete store(req).connect;
  await myAccount(req, '/complete', { auth_session: pending.auth_session, connect_code, redirect_uri: CALLBACK() });
  res.redirect('/settings?connected=google');
});
