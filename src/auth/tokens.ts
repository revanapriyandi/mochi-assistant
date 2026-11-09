// Every outbound call acts as the signed-in user:
//   asUser       -> first-party API with the user's Auth0 access token
//   googleToken  -> Google access token from Auth0 Token Vault (the app never stores Google tokens)
//   myAccount    -> My Account API (Connected Accounts), via a Multi-Resource Refresh Token
import type { Request } from 'express';
import { config } from '../config.ts';
import { HttpError } from '../errors.ts';

export async function asUser<T>(req: Request, method = 'GET', body?: unknown): Promise<T> {
  let token = req.oidc.accessToken;
  if (!token) throw new HttpError(401, 'Session expired, log in again');
  if (token.isExpired()) token = await token.refresh();
  const res = await fetch(`${config.baseUrl}/api/profile`, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { authorization: `Bearer ${token.access_token}`, 'content-type': 'application/json' },
  });
  const data = await res.json() as T & { error?: string };
  if (!res.ok) throw new HttpError(res.status, data.error ?? `API ${res.status}`);
  return data;
}

async function auth0Token(params: Record<string, string>): Promise<string> {
  const res = await fetch(`https://${config.auth0Domain}/oauth/token`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, ...params }),
  });
  const data = await res.json() as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) throw new HttpError(502, `${data.error}: ${data.error_description ?? ''}`);
  return data.access_token;
}

function refreshToken(req: Request): string {
  const t = req.oidc.refreshToken;
  if (!t) throw new HttpError(401, 'No refresh token in session, log out and in again');
  return t;
}

export async function googleToken(req: Request): Promise<string> {
  try {
    return await auth0Token({
      grant_type: 'urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token',
      subject_token_type: 'urn:ietf:params:oauth:token-type:refresh_token',
      subject_token: refreshToken(req),
      requested_token_type: 'http://auth0.com/oauth/token-type/federated-connection-access-token',
      connection: 'google-oauth2',
    });
  } catch (err) {
    throw new HttpError(403, `Google Calendar is not connected (${(err as Error).message})`);
  }
}

export async function myAccount<T>(req: Request, path: string, body: unknown): Promise<T> {
  const token = await auth0Token({ grant_type: 'refresh_token', refresh_token: refreshToken(req),
    audience: `https://${config.auth0Domain}/me/`, scope: 'create:me:connected_accounts read:me:connected_accounts' });
  const res = await fetch(`https://${config.auth0Domain}/me/v1/connected-accounts${path}`, {
    method: 'POST', body: JSON.stringify(body),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  });
  const data = await res.json() as T & { detail?: string; title?: string };
  if (!res.ok) throw new HttpError(502, `My Account API ${res.status}: ${data.detail ?? data.title ?? JSON.stringify(data)}`);
  return data;
}
