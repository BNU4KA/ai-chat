import { afterEach, expect, it, vi } from 'vitest';
import { removeStoredObjects } from './storage.ts';
afterEach(() => vi.unstubAllEnvs());
it('requires private storage configuration when deleting existing objects', async () => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  await expect(removeStoredObjects(['synthetic/path'])).rejects.toThrow(/not configured/);
});
it('deletes through the Storage API and propagates cleanup failure', async () => {
  vi.stubEnv('SUPABASE_URL', 'https://synthetic.invalid');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'synthetic');
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
  await removeStoredObjects(['synthetic/path'], fetcher);
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
    method: 'DELETE',
    body: JSON.stringify({ prefixes: ['synthetic/path'] }),
  });
  fetcher.mockResolvedValue(new Response('', { status: 503 }));
  await expect(removeStoredObjects(['synthetic/path'], fetcher)).rejects.toThrow(/cleanup failed/);
});
