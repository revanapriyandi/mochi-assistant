// Universal Login session (express-openid-connect). offline_access gives the refresh token that
// Token Vault and the My Account API (Connected Accounts) need.
import { createRequire } from 'node:module';
import { config } from '../config.ts';

// The package is CommonJS without detectable named exports, so load it with require.
const oidc = createRequire(import.meta.url)('express-openid-connect') as typeof import('express-openid-connect');

export const requiresAuth = oidc.requiresAuth;

export const session = oidc.auth({
  issuerBaseURL: `https://${config.auth0Domain}`,
  baseURL: config.baseUrl,
  clientID: config.clientId,
  clientSecret: config.clientSecret,
  clientAuthMethod: 'client_secret_post',
  secret: config.sessionSecret,
  authRequired: false,
  idpLogout: true, // log out of Auth0 too, so the next login is a real one
  authorizationParams: { response_type: 'code', audience: config.audience, scope: 'openid profile email offline_access' },
});
