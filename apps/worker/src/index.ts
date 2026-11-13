import {
  workspaceMessages,
  projectDocumentPorts,
  maintainSchedules,
  processFile,
  purgeFile,
  filePorts,
  googlePorts,
  prepareGoogleWrite,
  authorizeTool,
  revokeConnection,
  purgeAccount,
  maintainTasks,
  pickImageModel,
  switchConversationModel,
  saveGeneratedImage,
} from '@ai-chat/services';
import { executeRun } from '@ai-chat/agent-runtime';
import {
  credentialAad,
  databaseConnectionString,
  loadKeyring,
  markOutbox,
  open,
  readOpenRouterSecret,
  takeOutbox,
  purgeConversation,
  recoverExpiredRuns,
  readRun,
} from '@ai-chat/database';
import {
  createOpenRouterModel,
  generateOpenRouterImage,
  readPublicPage,
  searchWeb,
  searchWebOpenRouter,
  TavilyError,
  removeStoredObjects,
} from '@ai-chat/integrations';
import { PgBoss } from 'pg-boss';

if (process.env.NODE_ENV === 'production' && process.env.AI_CHAT_MODEL_ADAPTER) {
  throw new Error('AI_CHAT_MODEL_ADAPTER cannot be set in production');
}

if (!process.env.DATABASE_URL) {
  console.log({ service: 'worker', queue: 'unconfigured' });
  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => resolve());
    process.on('SIGTERM', () => resolve());
  });
  process.exit(0);
}

const boss = new PgBoss({ connectionString: databaseConnectionString(), schema: 'pgboss' });
boss.on('error', (error: Error) => {
  console.log({ service: 'worker', status: 'queue_error', message: error.message });
});
await boss.start();
await boss.createQueue('run.execute');
await boss.createQueue('file.process');
await boss.work('file.process', async (jobs) => {
  for (const job of jobs) await processFile(String((job.data as { fileId: string }).fileId));
});
const model = createOpenRouterModel();
const keyring = process.env.ENCRYPTION_KEYS ? loadKeyring(process.env.ENCRYPTION_KEYS) : null;

async function readOwnerKey(ownerId: string) {
  if (!keyring) return null;
  const stored = await readOpenRouterSecret(ownerId);
  if (!stored) return null;
  return {
    version: stored.version,
    apiKey: open(
      keyring,
      stored.sealed,
      credentialAad(ownerId, 'openrouter', stored.version),
    ),
  };
}

await boss.work('run.execute', async (jobs) => {
  for (const job of jobs) {
    const runId = String((job.data as { runId?: string }).runId ?? '');
    if (!runId) continue;
    const run = await readRun(runId);
    if (!run) continue;
    await executeRun(runId, {
      authorizeTool,
      prepareWrite: prepareGoogleWrite,
      prepareMessages: workspaceMessages(),
      now: () => new Date(),
      model,
      ports: {
        ...projectDocumentPorts(String(run.owner_id), String(run.conversation_id)),
        ...filePorts(String(run.owner_id), String(run.conversation_id)),
        ...googlePorts(String(run.owner_id), runId),
        switchModel: async ({ ownerId, conversationId, query }) =>
          switchConversationModel(ownerId, conversationId, query),
        generateImage: async ({
          ownerId,
          conversationId,
          assistantMessageId,
          prompt,
          modelQuery,
          signal,
        }) => {
          const key = await readOwnerKey(ownerId);
          if (!key) {
            return {
              ok: false,
              error: { code: 'KEY_MISSING', message: 'OpenRouter key is missing.', retryable: false },
            };
          }
          try {
            const chosen = await pickImageModel(ownerId, modelQuery);
            const generated = await generateOpenRouterImage({
              apiKey: key.apiKey,
              model: chosen.id,
              prompt,
              signal,
            });
            const ext = generated.mime.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
            const saved = await saveGeneratedImage({
              ownerId,
              conversationId,
              assistantMessageId,
              bytes: generated.bytes,
              mime: generated.mime,
              filename: `generated-${Date.now()}.${ext}`,
            });
            return {
              ok: true,
              data: {
                ...saved,
                model_id: chosen.id,
                model_name: chosen.name,
                cost_usd: generated.costUsd,
              },
            };
          } catch (error) {
            const code =
              error instanceof Error && 'code' in error ? String(error.code) : 'PROVIDER_ERROR';
            return {
              ok: false,
              error: {
                code,
                message: error instanceof Error ? error.message : 'Image generation failed',
                retryable: false,
              },
            };
          }
        },
        searchWeb: async (query, max) => {
          const tavilyKey = process.env.TAVILY_API_KEY?.trim();
          let hits;
          if (tavilyKey) {
            try {
              hits = await searchWeb(tavilyKey, query, max);
            } catch (error) {
              if (error instanceof TavilyError && !error.fallbackable) throw error;
              console.log({
                service: 'worker',
                status: 'tavily_fallback_to_openrouter',
                http_status: error instanceof TavilyError ? error.status : null,
              });
            }
          }
          if (!hits) {
            const key = await readOwnerKey(String(run.owner_id));
            if (!key) throw new Error('OpenRouter key is missing for web search');
            hits = await searchWebOpenRouter({
              apiKey: key.apiKey,
              query,
              maxResults: max,
            });
          }
          return {
            ok: true,
            data: hits,
            sources: hits
              .filter((hit) => hit.url)
              .map((hit) => ({
                kind: 'web',
                title: hit.title,
                url: hit.url,
                excerpt: hit.excerpt,
              })),
          };
        },
        readPage: async (url) => {
          const page = await readPublicPage(url);
          return {
            ok: true,
            data: page,
            sources: [
              {
                kind: 'web',
                title: page.title,
                url: page.finalUrl,
                excerpt: page.text.slice(0, 240),
              },
            ],
          };
        },
      },
      loadKey: readOwnerKey,
    });
  }
});

let dispatching = false;
const timer = setInterval(() => {
  if (dispatching) return;
  dispatching = true;
  void dispatch()
    .catch((error: unknown) => {
      console.log({
        service: 'worker',
        status: 'dispatch_error',
        message: error instanceof Error ? error.message : 'failed',
      });
    })
    .finally(() => {
      dispatching = false;
    });
}, 1000);

// Provider metadata checks for scheduled work must not delay outbox delivery.
let scheduling = false;
const scheduleTimer = setInterval(() => {
  if (scheduling) return;
  scheduling = true;
  void maintainSchedules()
    .catch(() => console.log({ service: 'worker', status: 'schedule_maintenance_error' }))
    .finally(() => {
      scheduling = false;
    });
}, 10000);

let maintainedAt = 0;
async function dispatch(): Promise<void> {
  if (Date.now() - maintainedAt > 10000) {
    await maintainTasks();
    maintainedAt = Date.now();
  }
  await recoverExpiredRuns();
  const rows = await takeOutbox(20);
  for (const row of rows) {
    try {
      if (row.topic === 'run.execute') {
        const payload = row.payload as { runId?: string };
        await boss.send('run.execute', { runId: payload.runId });
      } else if (row.topic === 'file.process') {
        await boss.send('file.process', { fileId: (row.payload as { fileId: string }).fileId });
      } else if (row.topic === 'file.purge') {
        await purgeFile(String(row.owner_id), (row.payload as { fileId: string }).fileId);
      } else if (row.topic === 'integration.revoke') {
        await revokeConnection((row.payload as { revocationId: string }).revocationId);
      } else if (row.topic === 'conversation.purge') {
        const payload = row.payload as { conversationId?: string };
        if (!payload.conversationId) throw new Error('Invalid conversation cleanup job');
        await purgeConversation(String(row.owner_id), payload.conversationId, removeStoredObjects);
      } else if (row.topic === 'account.purge') {
        await purgeAccount(String(row.owner_id));
        continue;
      } else {
        throw new Error('Unknown outbox topic');
      }
      await markOutbox(String(row.id), true);
    } catch {
      await markOutbox(String(row.id), false);
    }
  }
}

console.log({ service: 'worker', status: 'listening' });
await new Promise<void>((resolve) => {
  const stop = () => {
    clearInterval(timer);
    clearInterval(scheduleTimer);
    void boss.stop().finally(() => resolve());
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
});
