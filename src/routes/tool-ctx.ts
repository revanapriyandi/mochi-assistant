import type { Request } from 'express';
import type { ToolCtx } from '../assistant/context.ts';
import { approve } from '../auth/ciba.ts';
import { asUser, googleToken } from '../auth/tokens.ts';
import type { Profile } from '../types.ts';

export const validZone = (tz: unknown): string => {
  try { new Intl.DateTimeFormat('en', { timeZone: String(tz) }); return String(tz); } catch { return 'UTC'; }
};

/** Tool context for this request: every tool call carries the user's own Auth0 / Token Vault credentials. */
export function toolCtx(req: Request, timeZone: unknown): ToolCtx {
  const u = req.oidc.user ?? {};
  return {
    name: String(u.given_name || u.name || 'there'),
    timeZone: validZone(timeZone),
    fetch,
    getProfile: () => asUser<Profile>(req),
    saveProfile: (p) => asUser<Profile>(req, 'PUT', p),
    googleToken: () => googleToken(req),
    approve: (message) => approve(req.oidc.user!.sub as string, message),
  };
}
