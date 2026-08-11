import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
// pnpm/turbo run package scripts with the package dir as cwd, but the repo
// keeps a single .env at the repo root (alongside docker-compose.yml) -
// dotenv/config's cwd-relative default would never find it.
loadDotenv({ path: resolve(process.cwd(), '../../.env') });

import { buildApp } from './app.js';
import { loadConfig, type Config } from './config.js';

let config: Config;
try {
  config = loadConfig(process.env);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

const app = buildApp({ config });

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'shutting down');
  try {
    await app.close();
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'error during shutdown');
    process.exit(1);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

app
  .listen({ port: config.PORT, host: '0.0.0.0' })
  .catch((err: Error) => {
    app.log.error({ err }, 'failed to start server');
    process.exit(1);
  });
