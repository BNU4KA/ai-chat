import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

if (existsSync('.env')) {
  console.log({ wrote: false });
  process.exit(0);
}

const example = readFileSync('.env.example', 'utf8');
const key = randomBytes(32).toString('base64url');
writeFileSync('.env', example.replace('v1:replace-with-base64url-32-byte-key', `v1:${key}`));
console.log({ wrote: true });
