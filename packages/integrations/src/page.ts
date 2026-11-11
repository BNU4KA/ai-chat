import http from 'node:http';
import https from 'node:https';
import { resolvePublic } from './ssrf.ts';

const MAX_BYTES = 2 * 1024 * 1024;

export async function readPublicPage(
  rawUrl: string,
): Promise<{ title: string; finalUrl: string; text: string }> {
  let current = new URL(rawUrl);
  const deadline = Date.now() + 10_000;
  for (let hop = 0; hop <= 3; hop += 1) {
    const address = await boundedResolve(current, deadline);
    const response = await requestOnce(current, address, Math.max(1, deadline - Date.now()));
    if (response.status >= 300 && response.status < 400 && response.location) {
      if (hop === 3) throw new Error('Too many redirects');
      current = new URL(response.location, current);
      continue;
    }
    if (response.status < 200 || response.status >= 300) throw new Error('Page could not be read');
    const type = (response.contentType.split(';')[0] ?? '').trim().toLowerCase();
    if (type && !['text/html', 'text/plain', 'application/xhtml+xml'].includes(type)) {
      throw new Error('Page is not readable text');
    }
    return {
      title: titleOf(response.body) || current.hostname,
      finalUrl: current.toString(),
      text: stripHtml(response.body).slice(0, 20_000),
    };
  }
  throw new Error('Too many redirects');
}

function requestOnce(
  url: URL,
  address: string,
  timeoutMs: number,
): Promise<{ status: number; location?: string; contentType: string; body: string }> {
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (
      error?: Error,
      value?: { status: number; location?: string; contentType: string; body: string },
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else if (value) resolve(value);
    };
    const req = transport.request(
      url,
      {
        method: 'GET',
        family: address.includes(':') ? 6 : 4,
        headers: { accept: 'text/html,text/plain' },
        lookup: (_hostname, _options, callback) => {
          callback(null, address, address.includes(':') ? 6 : 4);
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            req.destroy();
            finish(new Error('Page is too large'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('error', (error) => finish(error));
        res.on('aborted', () => finish(new Error('Page transfer interrupted')));
        res.on('end', () => {
          finish(undefined, {
            status: res.statusCode ?? 0,
            location: typeof res.headers.location === 'string' ? res.headers.location : undefined,
            contentType: String(res.headers['content-type'] ?? ''),
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    const timer = setTimeout(() => {
      req.destroy();
      finish(new Error('Page timed out'));
    }, timeoutMs);
    req.on('error', (error) => finish(error));
    req.end();
  });
}

function titleOf(html: string): string {
  const match = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return stripHtml(match?.[1] ?? '').trim();
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function boundedResolve(url: URL, deadline: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      resolvePublic(url),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('Page timed out')),
          Math.max(1, deadline - Date.now()),
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
