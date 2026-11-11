import { buildServer } from './server.ts';
import { assertRuntimeIsProductionSafe } from './auth.ts';

assertRuntimeIsProductionSafe();
if (
  process.env.NODE_ENV === 'production' &&
  (!process.env.DATABASE_URL || !process.env.ENCRYPTION_KEYS)
) {
  throw new Error('DATABASE_URL and ENCRYPTION_KEYS are required in production');
}

const app = buildServer();
const port = Number(process.env.API_PORT ?? 3001);
await app.listen({ port, host: process.env.API_HOST ?? '0.0.0.0' });
let stopping = false;
for (const name of ['SIGINT', 'SIGTERM'] as const) {
  process.on(name, () => {
    if (stopping) return;
    stopping = true;
    void app.close().finally(() => process.exit(0));
  });
}
console.log({ service: 'api', status: 'listening', port });
