import { createApp } from './app.js';
import { config } from './shared/config.js';
import type { AppContext } from './system.js';
const app = createApp();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const server = app.listen(port, host, () =>
  console.log(`Smart E-Mobility Hub: http://${host}:${port}`),
);
const timer = setInterval(() => {
  const c = app.locals.context as AppContext;
  try {
    c.current.jobs.tick(c.current.now());
  } catch (error) {
    console.error('Background job failed', error);
  }
}, config.jobIntervalMs);
timer.unref();
server.on('close', () => clearInterval(timer));
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    clearInterval(timer);
    server.close();
  });
