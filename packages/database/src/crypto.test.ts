import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { credentialAad, loadKeyring, open, seal } from './crypto.ts';

describe('credential encryption', () => {
  it('round-trips with the owner context and fails if the context changes', () => {
    const ring = loadKeyring(`v1:${randomBytes(32).toString('base64url')}`);
    const aad = credentialAad('user', 'openrouter', 1);
    const sealed = seal(ring, 'sk-secret', aad);
    expect(open(ring, sealed, aad)).toBe('sk-secret');
    expect(() => open(ring, sealed, credentialAad('other', 'openrouter', 1))).toThrow();
  });
});
