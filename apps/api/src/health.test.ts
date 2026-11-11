import { describe, expect, it } from 'vitest';
import { buildServer } from './server.ts';

describe('health', () => {
  it('answers live and reports an unconfigured database as not ready', async () => {
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    const app = buildServer();
    const live = await app.inject({ method: 'GET', url: '/health/live' });
    const ready = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(live.statusCode).toBe(200);
    expect(live.json()).toEqual({ status: 'ok' });
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toEqual({
      status: 'not_ready',
      checks: { database: 'unconfigured', queue: 'unconfigured' },
    });
    expect(JSON.stringify(ready.json())).not.toMatch(/postgres:|secret|key/i);
    await app.close();
    if (previous) process.env.DATABASE_URL = previous;
  });
});
