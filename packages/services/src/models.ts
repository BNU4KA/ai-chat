import { AppError, LIMITS, modelSchema } from '@ai-chat/contracts';
import {
  credentialAad,
  loadKeyring,
  open,
  readOpenRouterSecret,
  withOwner,
  withWorker,
} from '@ai-chat/database';
import { fetchModelCatalog } from '@ai-chat/integrations';
import type { ToolOutcome } from '@ai-chat/agent-runtime';

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
    supportsTools: model.supports_tools,
    googleSubject: google?.google_subject as string | undefined,
    googleIntegrationId: google?.id as string | undefined,
  };
}

const IMAGE_MODEL_PREFERENCES = [
  'google/gemini-2.5-flash-image',
  'google/gemini-2.5-flash-image-preview',
  'openai/gpt-5-image-mini',
  'openai/gpt-5-image',
  'black-forest-labs/flux.2-pro',
  'black-forest-labs/flux.1-schnell',
];

function matchModels(models: Model[], query: string): Model[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const exact = models.filter(
    (m) => m.id.toLowerCase() === q || m.name.toLowerCase() === q,
  );
  if (exact.length) return exact;
  const tokens = q.split(/\s+/).filter(Boolean);
  return models
    .filter((m) => {
      const hay = `${m.id} ${m.name}`.toLowerCase();
      return tokens.every((tok) => hay.includes(tok));
    })
    .sort((a, b) => {
      const aFree = a.id.endsWith(':free') ? 1 : 0;
      const bFree = b.id.endsWith(':free') ? 1 : 0;
      if (aFree !== bFree) return aFree - bFree;
      return a.name.length - b.name.length;
    });
}

export async function pickImageModel(ownerId: string, requestedQuery?: string): Promise<Model> {
  const catalog = await modelCatalog(ownerId);
  const imageModels = catalog.filter(
    (m) => m.supports_image_output || /(^|\/)(gpt-.*image|gemini-.*image|flux|dall-e)/i.test(m.id),
  );
  if (!imageModels.length) {
    throw new AppError(
      422,
      'MODEL_UNAVAILABLE',
      'No image generation model is currently available in your OpenRouter catalog.',
    );
  }
  if (requestedQuery?.trim()) {
    const matched = matchModels(imageModels, requestedQuery);
    if (matched.length) return matched[0]!;
  }
  for (const preferred of IMAGE_MODEL_PREFERENCES) {
    const found = imageModels.find((m) => m.id.toLowerCase() === preferred);
    if (found) return found;
  }
  return imageModels[0]!;
}

export async function switchConversationModel(
  ownerId: string,
  conversationId: string,
  query: string,
): Promise<ToolOutcome> {
  const catalog = await modelCatalog(ownerId);
  const matches = matchModels(catalog, query);
  if (!matches.length) {
    return {
      ok: false,
      error: {
        code: 'MODEL_UNAVAILABLE',
        message: `No model matching "${query}" was found in the OpenRouter catalog.`,
        retryable: false,
      },
    };
  }
  const chat = await withWorker(
    async (tx) =>
      (
        await tx.query(
          'select enabled_tools from conversations where id=$1 and owner_id=$2 and deleted_at is null',
          [conversationId, ownerId],
        )
      ).rows[0],
  );
  if (!chat) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Conversation not found.', retryable: false },
    };
  }
  const enabledTools = Array.isArray(chat.enabled_tools) ? (chat.enabled_tools as string[]) : [];
  const chosen =
    (enabledTools.length ? matches.find((m) => m.supports_tools) : undefined) ?? matches[0]!;
  if (enabledTools.length && !chosen.supports_tools) {
    return {
      ok: false,
      error: {
        code: 'MODEL_TOOLS_UNSUPPORTED',
        message: `${chosen.name} (${chosen.id}) does not support tools. Disable conversation tools or pick a tool-capable model.`,
        retryable: false,
      },
    };
  }
  await withWorker(async (tx) => {
    await tx.query(
      'update conversations set model_id=$3, version=version+1, updated_at=now() where id=$1 and owner_id=$2 and deleted_at is null',
      [conversationId, ownerId, chosen.id],
    );
  });
  return {
    ok: true,
    data: {
      model_id: chosen.id,
      model_name: chosen.name,
      supports_tools: chosen.supports_tools,
      supports_images: chosen.supports_images,
      applies_from: 'next_turn',
    },
  };
}
