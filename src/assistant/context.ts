import type { Profile, ToolName } from '../types.ts';

/** Everything a tool needs to act as the signed-in user. Built per request by the server. */
export interface ToolCtx {
  name: string;
  timeZone: string;
  fetch: typeof fetch;
  /** First-party API, called with the user's Auth0 access token. */
  getProfile(): Promise<Profile>;
  saveProfile(change: Partial<Profile>): Promise<Profile>;
  /** Google access token from Auth0 Token Vault; throws "not connected" when the user hasn't linked Google. */
  googleToken(): Promise<string>;
  /** Set by the orchestrator: the tools the agent may use this turn (null = all). */
  tools?: Set<ToolName> | null;
}
