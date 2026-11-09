import { createApp } from './app.ts';
import { brain } from './assistant/index.ts';
import { config } from './config.ts';
import { ttsProvider } from './routes/tts.ts';

createApp().listen(config.port, (err?: Error) => {
  if (err) throw err; // e.g. EADDRINUSE: Express 5 passes it here instead of throwing
  console.log(`Context Assistant on ${config.baseUrl} (brain: ${brain()}, voice: ${ttsProvider()})`);
});
