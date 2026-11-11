import { describe, expect, it } from 'vitest';
import { isPrivateAddress, resolvePublic } from './ssrf.ts';

describe('ssrf guard', () => {
  it('blocks loopback, link-local, and mapped private addresses', () => {
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '192.168.1.1',
      '169.254.169.254',
      '::1',
      '::ffff:127.0.0.1',
      'fe80::1',
    ]) {
      expect(isPrivateAddress(address)).toBe(true);
    }
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
  });

  it('rejects a loopback URL before connecting', async () => {
    await expect(resolvePublic(new URL('http://127.0.0.1/secret'))).rejects.toThrow(/blocked/i);
    await expect(resolvePublic(new URL('http://example.com:22/'))).rejects.toThrow(/port/i);
  });
});

it('blocks hexadecimal mapped and expanded IPv6 internal addresses', async () => {
  for (const address of [
    '::ffff:7f00:1',
    '0:0:0:0:0:ffff:7f00:1',
    '::ffff:a00:1',
    'fe90::1',
    'febf::1',
    '2002:7f00:1::',
    '2001:db8::1',
    '198.18.0.1',
  ]) {
    expect(isPrivateAddress(address), address).toBe(true);
  }
  expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false);
  expect(isPrivateAddress('::ffff:808:808')).toBe(false);
  for (const url of [
    'http://[::ffff:127.0.0.1]/secret',
    'http://[::ffff:10.0.0.1]/',
    'http://[fe90::1]/',
  ]) {
    await expect(resolvePublic(new URL(url))).rejects.toThrow(/blocked/i);
  }
});
