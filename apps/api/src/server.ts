import {registerWorkspace} from './workspace.ts';
import { registerGoogle } from './google.ts';
import { googleStatus } from '@ai-chat/services';
import { googleConfigured, GoogleError } from '@ai-chat/integrations';
import { registerFiles } from './files.ts';
import { storageConfigured, verifySupabaseUser } from '@ai-chat/integrations';
import { modelCatalog, validateChatModel } from '@ai-chat/services';
import { randomUUID } from 'node:crypto';
import { AppError, isAppError, applicationOpenApi } from '@ai-chat/contracts';
import {
  conversationPatchSchema,
  createConversationSchema,
  credentialPutSchema,
  deleteAccountSchema,
  messageCreateSchema,
  profilePatchSchema,
} from '@ai-chat/contracts';
import {
  cancelRun,
  requestReplay,
  messageRequestHash,
  createConversation,
  createMessageRun,
  deleteConversation,
  deleteOpenRouter,
  eventsAfter,
  getConversation,
  getOpenRouter,
  getSnapshot,
  listConversations,
  listMessages,
  latestMessages,
  listRuns,
  retryMessage,
  saveOpenRouter,
  updateConversation,
  updateProfile,
  ensureProfile,
  credentialAad,
  lastFour,
  loadKeyring,
  seal,
  sha256,
  decideApproval,
  pingDatabase,
  pingQueue,
  withOwner,
} from '@ai-chat/database';
import { validateOpenRouterKey } from '@ai-chat/integrations';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { verifyAccessToken, type AccessClaims } from './auth.ts';
import { approvalDecisionSchema } from '@ai-chat/contracts';

const PUBLIC = new Set([
  '/health/live',
  '/health/ready',
  '/openapi.json',
  '/integrations/google/callback',
  '/v1/integrations/google/callback',
]);

export function buildServer(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: 'info',
      serializers: {
        req(request) {
          return { method: request.method, url: request.url.split('?')[0] };
        },
      },
    },
    genReqId: () => randomUUID(),
    bodyLimit: 1_000_000,
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const origin = request.headers.origin;
    const allowed = (process.env.CLIENT_ORIGINS ?? 'http://localhost:8081')
      .split(',')
      .map((item) => item.trim());
    if (typeof origin === 'string' && allowed.includes(origin)) {
      reply.header('access-control-allow-origin', origin);
      reply.header('vary', 'origin');
      reply.header(
        'access-control-allow-headers',
        'authorization,content-type,idempotency-key,if-match,last-event-id',
      );
      reply.header('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    }
    if (request.method === 'OPTIONS') {
      return reply.status(204).send();
    }
  });

  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof GoogleError) {
      reply
        .status(error.code === 'TOOL_NOT_CONFIGURED' ? 503 : 422)
        .send({
          error: { code: error.code, message: error.message, request_id: request.id, details: {} },
        });
      return;
    }
    if (error instanceof Error && error.name === 'ZodError') {
      reply.status(422).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request is invalid',
          request_id: request.id,
          details: {},
        },
      });
      return;
    }
    if (isAppError(error)) {
      reply.status(error.status).send({
        error: {
          code: error.code,
          message: error.message,
          request_id: request.id,
          details: error.details,
        },
      });
      return;
    }
    const statusCode =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    reply.status(statusCode).send({
      error: {
        code: statusCode === 400 ? 'INVALID_REQUEST' : 'PROVIDER_ERROR',
        message: statusCode === 400 ? 'Request could not be read' : 'The request failed',
        request_id: request.id,
        details: {},
      },
    });
  });

  app.get('/openapi.json', async () => applicationOpenApi());
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => {
    const database = await pingDatabase();
    const queue = await pingQueue();
    const ready = database === 'ok' && queue === 'ok';
    reply.status(ready ? 200 : 503);
    return { status: ready ? 'ok' : 'not_ready', checks: { database, queue } };
  });

  app.addHook('preHandler', async (request) => {
    if (PUBLIC.has(request.url.split('?')[0] ?? '')) return;
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer '))
      throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue');
    try {
      request.claims = await verifyAccessToken(header.slice(7));
    } catch (error) {
      if (isAppError(error)) throw error;
      throw new AppError(401, 'SESSION_EXPIRED', 'Sign in again');
    }
    request.ownerId = request.claims.sub;
    const profile = await withOwner(
      request.ownerId,
      async (tx) =>
        (
          await tx.query('select id,deletion_requested_at from profiles where id=$1', [
            request.ownerId,
          ])
        ).rows[0],
    );
    if (profile?.deletion_requested_at)
      throw new AppError(401, 'SESSION_EXPIRED', 'This account is being deleted.');
    if (!profile && !process.env.AI_CHAT_TEST_JWT_SECRET) {
      try {
        if ((await verifySupabaseUser(header.slice(7))) !== request.ownerId)
          throw new Error('Invalid identity');
      } catch {
        throw new AppError(401, 'SESSION_EXPIRED', 'Sign in again');
      }
    }
    await ensureProfile(request.ownerId, profileInput(request.claims));
  });

  app.get('/v1/profile', async (request) => {
    const row = await ensureProfile(request.ownerId, profileInput(request.claims));
    return { data: profileDto(row) };
  });

  app.patch('/v1/profile', async (request) => {
    const body = profilePatchSchema.parse(request.body ?? {});
    if (body.timezone && !isTimeZone(body.timezone)) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Timezone is not a valid IANA name');
    }
    const row = await updateProfile(request.ownerId, versionOf(request), {
      displayName: body.display_name,
      theme: body.theme,
      timezone: body.timezone,
      locale: body.locale,
    });
    return { data: profileDto(row) };
  });

  app.get('/v1/capabilities', async (request) => {
    const google = await googleStatus(request.ownerId);
    return {
      data: {
        tools: {
          web: process.env.TAVILY_API_KEY ? 'available' : 'unconfigured',
          files: storageConfigured() ? 'available' : 'unconfigured',
          gmail:
            google.capabilities.gmail && google.status === 'connected'
              ? 'available'
              : googleConfigured()
                ? 'connect'
                : 'unconfigured',
          calendar:
            google.capabilities.calendar && google.status === 'connected'
              ? 'available'
              : googleConfigured()
                ? 'connect'
                : 'unconfigured',
        },
        limits: { file_bytes: 20 * 1024 * 1024 },
      },
    };
  });

  app.get('/v1/models', async (request) => {
    const query = request.query as {
      search?: string;
      tools_required?: string;
      limit?: string;
      cursor?: string;
    };
    const limit = limitOf(query.limit ?? '100');
    const offset = query.cursor ? Number(Buffer.from(query.cursor, 'base64url').toString()) : 0;
    if (!Number.isSafeInteger(offset) || offset < 0)
      throw new AppError(422, 'VALIDATION_ERROR', 'Invalid cursor');
    const models = (await modelCatalog(request.ownerId)).filter(
      (model) =>
        (!query.search ||
          `${model.id} ${model.name}`.toLowerCase().includes(query.search.toLowerCase())) &&
        (query.tools_required !== 'true' || model.supports_tools),
    );
    return {
      data: models.slice(offset, offset + limit),
      next_cursor:
        offset + limit < models.length
          ? Buffer.from(String(offset + limit)).toString('base64url')
          : null,
    };
  });

  app.get('/v1/credentials/openrouter', async (request) => {
    const row = await getOpenRouter(request.ownerId);
    return {
      data: row
        ? {
            configured: Boolean(row.configured),
            last_four: row.last_four ?? null,
            status: row.configured ? 'valid' : 'missing',
            version: Number(row.credential_version),
            validated_at: row.validated_at
              ? new Date(String(row.validated_at)).toISOString()
              : null,
          }
        : { configured: false, last_four: null, status: 'missing', version: 0, validated_at: null },
    };
  });

  app.put('/v1/credentials/openrouter', async (request) => {
    const body = credentialPutSchema.parse(request.body);
    const expected = versionOf(request);
    const verdict = await validateOpenRouterKey(body.api_key);
    if (verdict === 'invalid')
      throw new AppError(422, 'KEY_INVALID', 'OpenRouter rejected this key');
    if (verdict === 'unavailable') {
      throw new AppError(503, 'KEY_VALIDATION_UNAVAILABLE', 'OpenRouter could not be reached');
    }
    const ring = loadKeyring(process.env.ENCRYPTION_KEYS);
    const nextVersion = expected + 1;
    const sealed = seal(
      ring,
      body.api_key,
      credentialAad(request.ownerId, 'openrouter', nextVersion),
    );
    const saved = await saveOpenRouter(request.ownerId, expected, {
      ...sealed,
      lastFour: lastFour(body.api_key),
    });
    return {
      data: {
        configured: true,
        last_four: saved.last_four,
        status: 'valid',
        version: Number(saved.credential_version),
        validated_at: new Date(String(saved.validated_at)).toISOString(),
      },
    };
  });

  app.delete('/v1/credentials/openrouter', async (request, reply) => {
    await deleteOpenRouter(request.ownerId, versionOf(request));
    reply.status(204).send();
  });

  app.post('/v1/conversations', async (request, reply) => {
    const body = createConversationSchema.parse(request.body ?? {});
    const created = await createConversation(request.ownerId, {
      modelId: body.model_id,
      enabledTools: body.enabled_tools ?? defaultTools(),
    });
    reply.status(201);
    return { data: created };
  });

  app.get('/v1/conversations', async (request) => {
    const query = request.query as { query?: string; limit?: string; cursor?: string };
    const page = await listConversations(
      request.ownerId,
      query.query ?? null,
      limitOf(query.limit),
      query.cursor ?? null,
    );
    return { data: page.items, next_cursor: page.next };
  });

  app.get('/v1/conversations/:id', async (request) => {
    const params = request.params as { id: string };
    return { data: await getConversation(request.ownerId, params.id) };
  });

  app.patch('/v1/conversations/:id', async (request) => {
    const params = request.params as { id: string };
    const body = conversationPatchSchema.parse(request.body ?? {});
    return {
      data: await updateConversation(request.ownerId, params.id, versionOf(request), {
        title: body.title,
        modelId: body.model_id,
        enabledTools: body.enabled_tools,
        projectId:body.project_id, researchMode:body.research_mode,budgetUsd:body.budget_usd,
      }),
    };
  });

  app.delete('/v1/conversations/:id', async (request, reply) => {
    const params = request.params as { id: string };
    await deleteConversation(request.ownerId, params.id);
    reply.status(202);
    return { data: { deletion_status: 'scheduled' } };
  });

  app.get('/v1/conversations/:id/messages', async (request) => {
    const params = request.params as { id: string };
    const query = request.query as {
      limit?: string;
      cursor?: string;
      tail?: string;
      before_seq?: string;
    };
    if (query.tail === 'true') {
      if (query.before_seq && !/^\d+$/.test(query.before_seq))
        throw new AppError(422, 'VALIDATION_ERROR', 'Invalid message cursor');
      const page = await latestMessages(
        request.ownerId,
        params.id,
        limitOf(query.limit),
        query.before_seq,
      );
      return { data: page.items, next_cursor: page.next };
    }
    const page = await listMessages(
      request.ownerId,
      params.id,
      limitOf(query.limit),
      query.cursor ?? null,
    );
    return { data: page.items, next_cursor: page.next };
  });

  app.post('/v1/conversations/:id/messages', async (request, reply) => {
    const params = request.params as { id: string };
    const body = messageCreateSchema.parse(request.body);
    const key = idempotencyOf(request);
    const replay = await requestReplay(
      request.ownerId,
      'POST /messages',
      key,
      messageRequestHash(params.id, {
        clientMessageId: body.client_message_id,
        text: body.text,
        fileIds: body.file_ids,
      }),
    );
    if (replay) {
      reply.header('idempotent-replayed', 'true').status(replay.status);
      return { data: replay.body };
    }
    const model = await validateChatModel(request.ownerId, params.id, body.file_ids);
    const created = await createMessageRun(request.ownerId, params.id, idempotencyOf(request), {
      clientMessageId: body.client_message_id,
      text: body.text,
      fileIds: body.file_ids,
      contextLength: model.contextLength,
      maxOutputTokens: model.maxOutputTokens,
      supportsTools: model.supportsTools,
      googleSubject: model.googleSubject,
      googleIntegrationId: model.googleIntegrationId,
      inputPrice:model.inputPrice,outputPrice:model.outputPrice,
    });
    if (created.replayed) reply.header('idempotent-replayed', 'true');
    reply.status(created.status);
    return { data: created.body };
  });

  app.post('/v1/messages/:id/retry', async (request, reply) => {
    const params = request.params as { id: string };
    const key = idempotencyOf(request);
    const replay = await requestReplay(
      request.ownerId,
      'POST /messages/retry',
      key,
      sha256(params.id),
    );
    if (replay) {
      reply.header('idempotent-replayed', 'true').status(replay.status);
      return { data: replay.body };
    }
    const chat = await withOwner(
      request.ownerId,
      async (tx) =>
        (
          await tx.query(
            'select m.conversation_id from messages m join conversations c on c.id=m.conversation_id where m.id=$1',
            [params.id],
          )
        ).rows[0],
    );
    if (!chat) throw new AppError(404, 'NOT_FOUND', 'Message not found');
    const meta = await validateChatModel(request.ownerId, String(chat.conversation_id));
    const created = await retryMessage(request.ownerId, params.id, key, sha256(params.id), meta);
    if (created.replayed) reply.header('idempotent-replayed', 'true');
    reply.status(created.status as number);
    return { data: created.body };
  });

  app.get('/v1/conversations/:id/runs', async (request) => {
    const params = request.params as { id: string };
    const query = request.query as { limit?: string };
    return {
      data: await listRuns(request.ownerId, params.id, limitOf(query.limit)),
      next_cursor: null,
    };
  });

  app.get('/v1/runs/:id', async (request) => ({
    data: await getSnapshot(request.ownerId, (request.params as { id: string }).id),
  }));

  app.post('/v1/runs/:id/cancel', async (request) => ({
    data: await cancelRun(request.ownerId, (request.params as { id: string }).id),
  }));

  app.post('/v1/approvals/:id/decision', async (request) => {
    const body = approvalDecisionSchema.parse(request.body);
    const result = await decideApproval(
      request.ownerId,
      (request.params as { id: string }).id,
      body.decision,
      body.args_hash,
    );
    return { data: result };
  });

  app.get('/v1/runs/:id/events', async (request, reply) => {
    const runId = (request.params as { id: string }).id;
    const query = request.query as { after_seq?: string };
    const header = request.headers['last-event-id'];
    const raw = typeof header === 'string' && header ? header : query.after_seq;
    let after = 0n;
    if (raw) {
      if (!/^\d+$/.test(raw))
        throw new AppError(422, 'VALIDATION_ERROR', 'Event cursor is invalid');
      after = BigInt(raw);
    }
    const existing = await eventsAfter(request.ownerId, runId, after);
    reply.hijack();
    for (const [name, value] of Object.entries(reply.getHeaders())) {
      if (value !== undefined) reply.raw.setHeader(name, value);
    }
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    let cursor = after;
    let ended = false;
    const timers: {
      poll?: ReturnType<typeof setInterval>;
      heartbeat?: ReturnType<typeof setInterval>;
    } = {};
    const close = () => {
      ended = true;
      clearInterval(timers.poll);
      clearInterval(timers.heartbeat);
      reply.raw.end();
    };
    reply.raw.on('close', () => {
      ended = true;
      clearInterval(timers.poll);
      clearInterval(timers.heartbeat);
    });
    const writeEvent = (row: Record<string, unknown>) => {
      if (ended) return;
      cursor = BigInt(String(row.seq));
      reply.raw.write(
        `id: ${row.seq}\nevent: ${row.type}\ndata: ${JSON.stringify({
          run_id: runId,
          seq: String(row.seq),
          type: row.type,
          timestamp: new Date(String(row.emitted_at)).toISOString(),
          payload: row.payload,
        })}\n\n`,
      );
      if (['run.completed', 'run.failed', 'run.cancelled'].includes(String(row.type))) close();
    };
    for (const row of existing) writeEvent(row as Record<string, unknown>);
    if (ended) return;
    let polling = false;
    timers.poll = setInterval(() => {
      if (polling || ended) return;
      polling = true;
      void eventsAfter(request.ownerId, runId, cursor)
        .then((rows) => {
          for (const row of rows) writeEvent(row as Record<string, unknown>);
        })
        .catch(() => close())
        .finally(() => {
          polling = false;
        });
    }, 500);
    timers.heartbeat = setInterval(() => reply.raw.write(': ping\n\n'), 15_000);
  });

  app.post('/v1/account', async () => {
    throw new AppError(422, 'VALIDATION_ERROR', 'Use DELETE /v1/account');
  });

  app.delete('/v1/account', async (request, reply) => {
    deleteAccountSchema.parse(request.body ?? {});
    const version = versionOf(request);
    await withOwner(request.ownerId, async (tx) => {
      const current = await tx.query(
        'select version from profiles where id = $1 and deletion_requested_at is null for update',
        [request.ownerId],
      );
      if (!current.rowCount) throw new AppError(404, 'NOT_FOUND', 'Profile not found');
      if (Number(current.rows[0]?.version) !== version) {
        throw new AppError(409, 'VERSION_CONFLICT', 'Profile was updated', {
          version: Number(current.rows[0]?.version),
        });
      }
      await tx.query(
        `update profiles set deletion_requested_at = now(), version = version + 1, updated_at = now() where id = $1`,
        [request.ownerId],
      );
      await tx.query(
        `update runs set cancel_requested_at = coalesce(cancel_requested_at, now()), updated_at = now()
         where status in ('queued', 'running', 'waiting_approval')`,
      );
      await tx.query(
        `insert into outbox (owner_id, topic, payload) values ($1, 'account.purge', '{}'::jsonb)`,
        [request.ownerId],
      );
    });
    reply.status(202);
    return { data: { deletion_status: 'scheduled' } };
  });

  registerWorkspace(app,versionOf);
  registerFiles(app, versionOf);
  registerGoogle(app, versionOf);
  return app;
}

function profileInput(claims: AccessClaims) {
  return {
    displayName: claims.name ?? claims.email ?? null,
    avatarUrl: claims.avatar ?? null,
    timezone: 'UTC',
  };
}

function profileDto(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    display_name: (row.display_name as string | null) ?? null,
    avatar_url: (row.avatar_url as string | null) ?? null,
    locale: row.locale === 'en' || row.locale === 'ru' ? row.locale : 'auto',
    timezone: String(row.timezone),
    theme: row.theme,
    version: Number(row.version),
    created_at: new Date(String(row.created_at)).toISOString(),
    updated_at: new Date(String(row.updated_at)).toISOString(),
  };
}

function versionOf(request: FastifyRequest): number {
  const header = request.headers['if-match'];
  if (typeof header !== 'string')
    throw new AppError(428, 'VERSION_REQUIRED', 'If-Match is required');
  const match = /^"(\d+)"$/.exec(header.trim());
  if (!match?.[1]) throw new AppError(428, 'VERSION_REQUIRED', 'If-Match must be a quoted version');
  return Number(match[1]);
}

function idempotencyOf(request: FastifyRequest): string {
  const header = request.headers['idempotency-key'];
  if (typeof header !== 'string' || !/^[0-9a-f-]{36}$/i.test(header)) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Idempotency-Key must be a UUID');
  }
  return header;
}

function limitOf(value: string | undefined): number {
  const parsed = value ? Number(value) : 30;
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new AppError(422, 'VALIDATION_ERROR', 'limit must be from 1 to 100');
  }
  return parsed;
}

function defaultTools(): ('web' | 'files')[] {
  const tools: ('web' | 'files')[] = [];
  if (process.env.TAVILY_API_KEY) tools.push('web');
  if (storageConfigured()) tools.push('files');
  return tools;
}

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export type { FastifyReply };
