import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { eventEnvelopeSchema, messageCreateSchema } from './schemas.ts';

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures');

describe('canonical fixtures', () => {
  it('accepts the message request fixture and rejects unknown fields', () => {
    const body = JSON.parse(readFileSync(resolve(fixtures, 'message-request.json'), 'utf8'));
    expect(messageCreateSchema.parse(body).text).toContain('Summarize');
    expect(messageCreateSchema.safeParse({ ...body, model_id: 'hidden' }).success).toBe(false);
  });

  it('accepts the delta event fixture', () => {
    const body = JSON.parse(readFileSync(resolve(fixtures, 'event-delta.json'), 'utf8'));
    expect(eventEnvelopeSchema.parse(body).type).toBe('message.delta');
  });
});
