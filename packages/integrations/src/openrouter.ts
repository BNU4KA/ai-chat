import { LIMITS } from '@ai-chat/contracts';
import type { ModelAdapter, ModelResult } from '@ai-chat/agent-runtime';

const OPENROUTER = 'https://openrouter.ai/api/v1';

export async function validateOpenRouterKey(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<'valid' | 'invalid' | 'unavailable'> {
  try {
    const response = await fetchImpl(`${OPENROUTER}/key`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 401 || response.status === 403) return 'invalid';
    if (!response.ok) return 'unavailable';
    return 'valid';
  } catch {
    return 'unavailable';
  }
}

type CatalogModel = {
  id: string;
  name: string;
  context_length: number | null;
  supports_tools: boolean;
  supports_images: boolean;
  supports_image_output: boolean;
  max_output_tokens: number | null;
  input_price_per_million_usd: string | null;
  output_price_per_million_usd: string | null;
  supported_parameters: string[];
  catalog_fetched_at: string;
  catalog_stale: boolean;
};

export async function fetchModelCatalog(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CatalogModel[]> {
  const response = await fetchImpl(`${OPENROUTER}/models`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error('catalog unavailable');
  const body = (await response.json()) as { data?: Record<string, unknown>[] };
  const fetchedAt = new Date().toISOString();
  return (body.data ?? []).map((model) => {
    const pricing = (model.pricing ?? {}) as {
      prompt?: string | number;
      completion?: string | number;
    };
    const parameters = Array.isArray(model.supported_parameters)
      ? model.supported_parameters.map(String)
      : [];
    const arch = (model.architecture ?? {}) as {
      input_modalities?: unknown;
      output_modalities?: unknown;
    };
    return {
      id: String(model.id),
      name: String(model.name ?? model.id),
      context_length: typeof model.context_length === 'number' ? model.context_length : null,
      supports_tools: parameters.includes('tools'),
      supports_images:
        Array.isArray(arch.input_modalities) && arch.input_modalities.includes('image'),
      supports_image_output:
        Array.isArray(arch.output_modalities) && arch.output_modalities.includes('image'),
      max_output_tokens:
        typeof (model.top_provider as { max_completion_tokens?: number })?.max_completion_tokens ===
        'number'
          ? Number((model.top_provider as { max_completion_tokens: number }).max_completion_tokens)
          : null,
      input_price_per_million_usd: perMillion(pricing.prompt),
      output_price_per_million_usd: perMillion(pricing.completion),
      supported_parameters: parameters,
      catalog_fetched_at: fetchedAt,
      catalog_stale: false,
    };
  });
}

export function createOpenRouterModel(fetchImpl: typeof fetch = fetch): ModelAdapter {
  return {
    async complete(request): Promise<ModelResult> {
      let response: Response;
      try {
        response = await fetchImpl(`${OPENROUTER}/chat/completions`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${request.apiKey}`,
            'content-type': 'application/json',
          },
          signal: request.signal,
          body: JSON.stringify({
            model: request.model,
            messages: request.messages,
            stream: true,
            max_tokens: request.maxTokens,
            ...(request.tools.length
              ? {
                  tools: request.tools.map((tool) => ({
                    type: 'function',
                    function: {
                      name: tool.name,
                      description: tool.description,
                      parameters: tool.parameters,
                    },
                  })),
                  tool_choice: 'auto',
                }
              : {}),
          }),
        });
      } catch {
        const error = new Error('OpenRouter did not respond') as Error & {
          code: string;
          submitted: boolean;
        };
        error.code = 'PROVIDER_TIMEOUT';
        error.submitted = true;
        throw error;
      }
      if (!response.ok || !response.body) {
        const error = new Error('OpenRouter rejected the request') as Error & {
          code: string;
          submitted: boolean;
        };
        error.code =
          response.status === 401 || response.status === 403
            ? 'KEY_INVALID'
            : response.status === 402
              ? 'INSUFFICIENT_CREDITS'
              : response.status === 429
                ? 'PROVIDER_RATE_LIMIT'
                : response.status === 404
                  ? 'MODEL_UNAVAILABLE'
                  : 'PROVIDER_ERROR';
        error.submitted = true;
        throw error;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let carry = '';
      let terminal = false;
      let text = '';
      const calls = new Map<number, { id: string; name: string; arguments: string }>();
      let usage: ModelResult['usage'] = {
        input_tokens: null,
        output_tokens: null,
        cost_usd: null,
        cost_status: 'unknown',
      };
      let generationId: string | null = null;
      const consume = async (block: string) => {
        const data = block
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')
          .trim();
        if (!data) return;
        if (data === '[DONE]') {
          terminal = true;
          return;
        }
        {
          const parsed = JSON.parse(data) as {
            id?: string;
            error?: { code?: number | string };
            usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
            choices?: {
              finish_reason?: string | null;
              delta?: {
                content?: string;
                tool_calls?: {
                  index: number;
                  id?: string;
                  function?: { name?: string; arguments?: string };
                }[];
              };
            }[];
          };
          if (parsed.error || parsed.choices?.some((choice) => choice.finish_reason === 'error')) {
            const code = parsed.error?.code;
            throw Object.assign(new Error('OpenRouter stream failed'), {
              code:
                Number(code) === 402
                  ? 'INSUFFICIENT_CREDITS'
                  : Number(code) === 429
                    ? 'PROVIDER_RATE_LIMIT'
                    : Number(code) === 401
                      ? 'KEY_INVALID'
                      : 'PROVIDER_ERROR',
              submitted: true,
            });
          }
          if (parsed.choices?.some((choice) => choice.finish_reason)) terminal = true;
          if (parsed.id) generationId = parsed.id;
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) {
            text += delta.content;
            await request.onDelta(delta.content);
          }
          for (const call of delta?.tool_calls ?? []) {
            const current = calls.get(call.index) ?? { id: '', name: '', arguments: '' };
            if (call.id) current.id = call.id;
            if (call.function?.name) current.name += call.function.name;
            if (call.function?.arguments) current.arguments += call.function.arguments;
            calls.set(call.index, current);
          }
          if (parsed.usage) {
            usage = {
              input_tokens: parsed.usage.prompt_tokens ?? null,
              output_tokens: parsed.usage.completion_tokens ?? null,
              cost_usd: parsed.usage.cost == null ? null : String(parsed.usage.cost),
              cost_status: parsed.usage.cost == null ? 'unknown' : 'estimated',
            };
          }
        }
      };
      const abort = () => {
        void reader.cancel().catch(() => undefined);
      };
      request.signal.addEventListener('abort', abort, { once: true });
      try {
        while (true) {
          request.signal.throwIfAborted();
          const chunk = await reader.read();
          if (chunk.done) break;
          carry += decoder.decode(chunk.value, { stream: true });
          const parts = carry.split(/\r?\n\r?\n/);
          carry = parts.pop() ?? '';
          if (carry.length > 1_000_000) throw new Error('Oversized provider event');
          for (const part of parts) await consume(part);
        }
        request.signal.throwIfAborted();
        carry += decoder.decode();
        if (carry) await consume(carry);
        if (!terminal) throw new Error('Provider stream ended before completion');
      } catch (error) {
        if (error instanceof Error && 'code' in error) throw error;
        throw Object.assign(new Error('OpenRouter stream interrupted'), {
          code: 'PROVIDER_ERROR',
          submitted: true,
        });
      } finally {
        request.signal.removeEventListener('abort', abort);
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      return {
        text,
        toolCalls: [...calls.entries()]
          .sort(([left], [right]) => left - right)
          .map(([, call]) => call),
        usage,
        generationId,
        submitted: true,
      };
    },
  };
}

export async function generateOpenRouterImage(
  input: {
    apiKey: string;
    model: string;
    prompt: string;
    signal?: AbortSignal;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<{ bytes: Uint8Array; mime: string; costUsd: string | null }> {
  const signal = input.signal
    ? AbortSignal.any([input.signal, AbortSignal.timeout(LIMITS.modelTimeoutMs)])
    : AbortSignal.timeout(LIMITS.modelTimeoutMs);
  const response = await fetchImpl(`${OPENROUTER}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      'content-type': 'application/json',
    },
    signal,
    body: JSON.stringify({
      model: input.model,
      messages: [{ role: 'user', content: input.prompt }],
      modalities: ['image', 'text'],
      stream: false,
    }),
  });
  if (!response.ok) {
    const code =
      response.status === 401 || response.status === 403
        ? 'KEY_INVALID'
        : response.status === 402
          ? 'INSUFFICIENT_CREDITS'
          : response.status === 429
            ? 'PROVIDER_RATE_LIMIT'
            : response.status === 404
              ? 'MODEL_UNAVAILABLE'
              : 'PROVIDER_ERROR';
    throw Object.assign(new Error('Image generation failed'), { code });
  }
  const body = (await response.json()) as {
    usage?: { cost?: number };
    choices?: {
      message?: {
        content?: unknown;
        images?: { image_url?: { url?: string }; url?: string }[];
      };
    }[];
  };
  const msg = body.choices?.[0]?.message;
  let dataUrl: string | undefined =
    msg?.images?.[0]?.image_url?.url ?? msg?.images?.[0]?.url;
  if (!dataUrl && Array.isArray(msg?.content)) {
    const part = (msg.content as { type?: string; image_url?: { url?: string } }[]).find(
      (item) => item?.type === 'image_url' && typeof item.image_url?.url === 'string',
    );
    dataUrl = part?.image_url?.url;
  }
  const match = dataUrl?.match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw Object.assign(new Error('Provider did not return a valid image'), {
      code: 'PROVIDER_ERROR',
    });
  }
  const mime = match[1] === 'image/jpg' ? 'image/jpeg' : match[1]!;
  const bytes = Buffer.from(match[2]!, 'base64');
  if (!bytes.length || bytes.length > LIMITS.fileBytes) {
    throw Object.assign(new Error('Generated image size is invalid'), {
      code: 'PROVIDER_ERROR',
    });
  }
  return {
    bytes: new Uint8Array(bytes),
    mime,
    costUsd: body.usage?.cost == null ? null : String(body.usage.cost),
  };
}

function perMillion(value: string | number | undefined): string | null {
  if (value == null || value === '') return null;
  const raw = String(value);
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  const [whole, fraction = ''] = raw.split('.');
  const scale = 10n ** BigInt(fraction.length);
  const base = BigInt(whole) * scale + BigInt(fraction || '0');
  const product = base * 1_000_000n;
  const integer = product / scale;
  const remainder = product % scale;
  if (remainder === 0n) return integer.toString();
  const decimals = remainder.toString().padStart(fraction.length, '0').replace(/0+$/, '');
  return `${integer}.${decimals}`;
}
