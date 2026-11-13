import { randomUUID } from 'node:crypto';
import {
  AppError,
  adminAssignKeySchema,
  adminOpenRouterKeyCreateSchema,
} from '@ai-chat/contracts';
import {
  assignManagedOpenRouterKey,
  credentialAad,
  deleteManagedOpenRouterKey,
  getAdminUser,
  insertManagedOpenRouterKey,
  lastFour,
  listAdminUsers,
  listManagedOpenRouterKeys,
  loadKeyring,
  scheduleAccountDeletion,
  seal,
} from '@ai-chat/database';
import { validateOpenRouterKey } from '@ai-chat/integrations';
import type { FastifyInstance } from 'fastify';
import { requireAdmin } from './auth.ts';

export function registerAdmin(app: FastifyInstance): void {
  app.get('/v1/admin/openrouter-keys', async (request) => {
    requireAdmin(request);
    return { data: await listManagedOpenRouterKeys() };
  });

  app.post('/v1/admin/openrouter-keys', async (request, reply) => {
    requireAdmin(request);
    const body = adminOpenRouterKeyCreateSchema.parse(request.body ?? {});
    const verdict = await validateOpenRouterKey(body.api_key);
    if (verdict === 'invalid') throw new AppError(422, 'KEY_INVALID', 'OpenRouter rejected this key');
    if (verdict === 'unavailable') {
      throw new AppError(503, 'KEY_VALIDATION_UNAVAILABLE', 'OpenRouter could not be reached');
    }
    const id = randomUUID();
    const sealed = seal(
      loadKeyring(process.env.ENCRYPTION_KEYS),
      body.api_key,
      credentialAad(id, 'managed_openrouter', 1),
    );
    const created = await insertManagedOpenRouterKey({
      id,
      label: body.label,
      ...sealed,
      lastFour: lastFour(body.api_key),
    });
    reply.status(201);
    return { data: created };
  });

  app.delete('/v1/admin/openrouter-keys/:id', async (request, reply) => {
    requireAdmin(request);
    const params = request.params as { id: string };
    if (!isUuid(params.id)) throw new AppError(422, 'VALIDATION_ERROR', 'Invalid key id');
    const removed = await deleteManagedOpenRouterKey(params.id);
    if (!removed) throw new AppError(404, 'NOT_FOUND', 'Server key not found');
    reply.status(204).send();
  });

  app.get('/v1/admin/users', async (request) => {
    requireAdmin(request);
    const query = request.query as { query?: string; limit?: string; cursor?: string };
    const page = await listAdminUsers(query.query ?? null, limitOf(query.limit), query.cursor ?? null);
    return { data: page.items, next_cursor: page.next };
  });

  app.patch('/v1/admin/users/:id/openrouter-key', async (request) => {
    requireAdmin(request);
    const params = request.params as { id: string };
    if (!isUuid(params.id)) throw new AppError(422, 'VALIDATION_ERROR', 'Invalid user id');
    const body = adminAssignKeySchema.parse(request.body ?? {});
    return {
      data: await assignManagedOpenRouterKey(params.id, body.managed_key_id, body.key_priority),
    };
  });

  app.delete('/v1/admin/users/:id', async (request, reply) => {
    requireAdmin(request);
    const params = request.params as { id: string };
    if (!isUuid(params.id)) throw new AppError(422, 'VALIDATION_ERROR', 'Invalid user id');
    if (params.id === request.ownerId) {
      throw new AppError(422, 'VALIDATION_ERROR', 'You cannot delete your own account here');
    }
    await getAdminUser(params.id);
    await scheduleAccountDeletion(params.id, null);
    reply.status(202);
    return { data: { deletion_status: 'scheduled' } };
  });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(value);
}

function limitOf(value: string | undefined): number {
  const parsed = value ? Number(value) : 30;
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new AppError(422, 'VALIDATION_ERROR', 'limit must be from 1 to 100');
  }
  return parsed;
}
