import { afterEach, describe, expect, it, vi } from 'vitest';
import { databaseConnectionString } from './pool.ts';

afterEach(() => vi.unstubAllEnvs());

describe('database TLS configuration', () => {
  it('requires certificate and hostname verification for remote connections', () => {
    vi.stubEnv('DATABASE_SSL_CA_FILE', '.local/synthetic-ca.crt');
    const url = new URL(
      databaseConnectionString(
        'postgres://user:synthetic@db.example.com/db?sslmode=no-verify&uselibpqcompat=true',
      ),
    );
    expect(url.searchParams.get('sslmode')).toBe('verify-full');
    expect(url.searchParams.has('uselibpqcompat')).toBe(false);
    expect(url.searchParams.get('sslrootcert')).toMatch(/\.local\/synthetic-ca\.crt$/);
  });

  it('preserves an explicitly provided CA when no local override is configured', () => {
    vi.stubEnv('DATABASE_SSL_CA_FILE', '');
    const url = new URL(
      databaseConnectionString(
        'postgres://user:synthetic@db.example.com/db?sslrootcert=/tmp/synthetic-ca.crt',
      ),
    );
    expect(url.searchParams.get('sslmode')).toBe('verify-full');
    expect(url.searchParams.get('sslrootcert')).toBe('/tmp/synthetic-ca.crt');
  });

  it('allows a disposable local database without TLS', () => {
    vi.stubEnv('DATABASE_SSL_CA_FILE', '/missing/synthetic-ca.crt');
    const url = new URL(databaseConnectionString('postgres://user:synthetic@127.0.0.1:64090/test'));
    expect(url.searchParams.has('sslmode')).toBe(false);
    expect(url.searchParams.has('sslrootcert')).toBe(false);
  });
});
