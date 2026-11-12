import { AppError, LIMITS, modelSchema } from '@ai-chat/contracts';
import {
  credentialAad,
  loadKeyring,
  open,
  readOpenRouterSecret,
  withOwner,
} from '@ai-chat/database';
import { fetchModelCatalog } from '@ai-chat/integrations';

type Model = ReturnType<typeof modelSchema.parse>;
const cache = new Map<string, { at: number; models: Model[] }>();
const pending = new Map<string, Promise<Model[]>>();
export async function modelCatalog(ownerId: string): Promise<Model[]> {
  const stored = await readOpenRouterSecret(ownerId);
  if (!stored) throw new AppError(422, 'KEY_MISSING', 'Add your OpenRouter key to choose a model.');
  const id = `${ownerId}:${stored.version}`;
  const saved = cache.get(id);
  const now = Date.now();
  if (saved && now - saved.at < LIMITS.catalogFreshMs) return saved.models;
  if (pending.has(id)) return pending.get(id)!;
  const promise = (async () => {
    try {
      const key = open(
        loadKeyring(process.env.ENCRYPTION_KEYS),
        stored.sealed,
        credentialAad(ownerId, 'openrouter', stored.version),
      );
      const models = (await fetchModelCatalog(key)).map((model) => modelSchema.parse(model));
      for (const old of cache.keys()) if (old.startsWith(`${ownerId}:`)) cache.delete(old);
      if (cache.size > 1000) cache.delete(cache.keys().next().value!);
      cache.set(id, { at: Date.now(), models });
      return models;
    } catch {
      if (saved && now - saved.at < LIMITS.catalogStaleMs)
        return saved.models.map((model) => ({ ...model, catalog_stale: true }));
      throw new AppError(
        503,
        'PROVIDER_UNAVAILABLE',
        'The model catalog is unavailable. Please try again.',
      );
    } finally {
      pending.delete(id);
    }
  })();
  pending.set(id, promise);
  return promise;
}
export async function validateChatModel(
  ownerId: string,
  conversationId: string,
  fileIds: string[] = [],
) {
  const chat = await withOwner(
    ownerId,
    async (tx) =>
      (
        await tx.query('select model_id,enabled_tools from conversations where id=$1', [
          conversationId,
        ])
      ).rows[0],
  );
  if (!chat) throw new AppError(404, 'NOT_FOUND', 'Conversation not found');
  const model = (await modelCatalog(ownerId)).find((value) => value.id === chat.model_id);
  if (!model) throw new AppError(422, 'MODEL_UNAVAILABLE', 'Choose an available model.');
  if (chat.enabled_tools.length && !model.supports_tools)
    throw new AppError(
      422,
      'MODEL_TOOLS_UNSUPPORTED',
      'This model does not support the selected tools.',
    );
  const photos = await withOwner(ownerId, async (tx) =>
    tx.query(
      `select f.id from files f where f.conversation_id=$1 and f.status='ready' and f.detected_mime like 'image/%' and (f.id=any($2::uuid[]) or exists(select 1 from message_files mf where mf.file_id=f.id)) limit 1`,
      [conversationId, fileIds],
    ),
  );
  if (photos.rowCount && !model.supports_images)
    throw new AppError(
      422,
      'MODEL_IMAGES_UNSUPPORTED',
      'Choose a model with photo support, such as Gemini 3.8 Flash, to ask about these images.',
    );
  const groups = chat.enabled_tools as string[];
  let google: Record<string, unknown> | undefined;
  if (groups.includes('gmail') || groups.includes('calendar')) {
    google = await withOwner(
      ownerId,
      async (tx) =>
        (
          await tx.query(
            "select id,google_subject,capabilities,status from integrations where provider='google'",
          )
        ).rows[0],
    );
    const caps = (google?.capabilities ?? {}) as Record<string, boolean>;
    if (
      !google ||
      google.status !== 'connected' ||
      groups.some((group) => (group === 'gmail' || group === 'calendar') && !caps[group])
    )
      throw new AppError(
        422,
        'INTEGRATION_REAUTH_REQUIRED',
        'Connect the selected Google services in Settings.',
      );
  }
  return {
    inputPrice:model.input_price_per_million_usd,outputPrice:model.output_price_per_million_usd,
    contextLength: model.context_length,
    maxOutputTokens: model.max_output_tokens ?? null,
    googleSubject: google?.google_subject as string | undefined,
    googleIntegrationId: google?.id as string | undefined,
  };
}
