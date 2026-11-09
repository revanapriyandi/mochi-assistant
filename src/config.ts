// Environment. Required values fail fast at startup; optional ones are read where they are used.
const need = (key: string): string => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing ${key} in .env (see .env.example)`);
  return v;
};

export const config = {
  auth0Domain: need('AUTH0_DOMAIN'),
  clientId: need('AUTH0_CLIENT_ID'),
  clientSecret: need('AUTH0_CLIENT_SECRET'),
  audience: need('AUTH0_AUDIENCE'),
  sessionSecret: need('SESSION_SECRET'),
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  port: Number(process.env.PORT || 3000),
};
