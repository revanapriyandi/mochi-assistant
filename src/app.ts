import express, { type NextFunction, type Request, type Response } from 'express';
import { fileURLToPath } from 'node:url';
import { profileApi } from './api/profile.ts';
import { requiresAuth, session } from './auth/session.ts';
import { HttpError } from './errors.ts';
import { assistantRoutes } from './routes/assistant.ts';
import { connectRoutes } from './routes/connect.ts';
import { simliRoutes } from './routes/simli.ts';
import { ttsRoutes } from './routes/tts.ts';

// Only public/ is served statically (never the project root: it holds .env). Pages need a login.
const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const PAGES: Record<string, string> = { '/': 'index.html', '/agenda': 'agenda.html', '/history': 'history.html', '/settings': 'settings.html' };

export function createApp() {
  const app = express();
  app.set('trust proxy', true); // behind a hosting proxy: https and client IPs come from X-Forwarded-*
  app.use(express.json());
  app.use('/api', profileApi); // first-party API: Bearer tokens only, no session
  app.use(session);
  for (const [path, file] of Object.entries(PAGES)) app.get(path, requiresAuth(), (_req, res) => res.sendFile(file, { root: PUBLIC }));
  app.use(express.static(PUBLIC, { index: false }));
  app.use(connectRoutes, assistantRoutes, ttsRoutes, simliRoutes);

  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof HttpError ? err.status : (err as { status?: number }).status ?? 500;
    if (status >= 500 || req.path.startsWith('/connect')) console.error(req.path, err.message);
    if (!req.path.startsWith('/connect')) {
      res.status(status).json({ error: err.message });
      return;
    }
    res.redirect(`/settings?error=${encodeURIComponent(err.message)}`); // browser-facing redirects: show it on a page
  });
  return app;
}
