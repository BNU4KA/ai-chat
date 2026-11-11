import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const BLOCKED_HOSTS = new Set(['metadata.google.internal', 'metadata.google.com']);

export function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, '');
  const family = isIP(ip);
  if (family === 6) {
    // WHATWG URLs canonicalize dotted IPv4-mapped literals to hexadecimal IPv6.
    const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
    const halves = canonical.split('::');
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves[1] ? halves[1].split(':') : [];
    const words =
      halves.length === 2
        ? [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right]
        : left;
    const values = words.map((word) => Number.parseInt(word, 16));
    if (values.slice(0, 5).every((word) => word === 0) && values[5] === 0xffff) {
      const high = values[6]!;
      const low = values[7]!;
      return isPrivateAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
    // Only global unicast; exclude transition and documentation ranges as well.
    const first = values[0]!;
    const second = values[1]!;
    return (
      (first & 0xe000) !== 0x2000 ||
      first === 0x2002 ||
      (first === 0x2001 &&
        (second === 0 ||
          second === 0xdb8 ||
          (second & 0xfff0) === 0x10 ||
          (second & 0xfff0) === 0x20))
    );
  }
  if (family !== 4) return true;
  const parts = ip.split('.').map(Number);
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) ||
    (a === 100 && b! >= 64 && b! <= 127) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a! >= 224
  );
}

export async function resolvePublic(url: URL): Promise<string> {
  if (url.username || url.password) throw new Error('URLs with credentials are blocked');
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error('Only http and https are allowed');
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  if (port !== 80 && port !== 443) throw new Error('Only ports 80 and 443 are allowed');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('That address is blocked');
  }
  if (!isIP(host) && !/^[a-z0-9.-]+$/.test(host)) throw new Error('Hostname is not allowed');
  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true, verbatim: true })).map((item) => item.address);
  if (!addresses.length) throw new Error('DNS returned no addresses');
  if (addresses.some((address) => isPrivateAddress(address)))
    throw new Error('Private addresses are blocked');
  return addresses[0] ?? host;
}
