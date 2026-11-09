// Asynchronous authorization (Auth0 CIBA): before a high-impact action the agent pauses and Auth0 asks the
// user out of band (Guardian push, or email when CIBA_EXPIRY > 300). Resolves on approval, throws otherwise.
// ponytail: blocks the chat request while polling; a hosting proxy timeout below the expiry cuts it short.
import { config } from '../config.ts';

const form = (p: Record<string, string>) => ({
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...p }),
});
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Auth0 allows up to 64 chars of letters, digits, spaces and +-_.,:# in the binding message. */
export const bindingMessage = (s: string) => s.replace(/[^A-Za-z0-9\s+\-_.,:#]/g, '').replace(/\s+/g, ' ').trim().slice(0, 64);

export async function approve(sub: string, message: string, fetchFn: typeof fetch = fetch, sleep = wait): Promise<void> {
  const base = `https://${config.auth0Domain}`;
  const res = await fetchFn(`${base}/bc-authorize`, form({
    scope: 'openid', binding_message: bindingMessage(message), requested_expiry: process.env.CIBA_EXPIRY || '300',
    login_hint: JSON.stringify({ format: 'iss_sub', iss: `${base}/`, sub }),
  }));
  const start = await res.json() as { auth_req_id?: string; interval?: number; error_description?: string; error?: string };
  if (!res.ok || !start.auth_req_id) throw new Error(`Not approved: could not ask you for approval (${start.error_description ?? start.error ?? res.status})`);
  let interval = start.interval ?? 5;
  for (;;) {
    await sleep(interval * 1000);
    const r = await fetchFn(`${base}/oauth/token`, form({ grant_type: 'urn:openid:params:grant-type:ciba', auth_req_id: start.auth_req_id }));
    if (r.ok) return;
    const e = await r.json() as { error?: string; interval?: number };
    if (e.error === 'authorization_pending') continue;
    if (e.error === 'slow_down') { interval = e.interval ?? interval + 5; continue; }
    throw new Error(e.error === 'expired_token' ? 'Not approved: the approval request expired' : 'Not approved: you declined it');
  }
}
