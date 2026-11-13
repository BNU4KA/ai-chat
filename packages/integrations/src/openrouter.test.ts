import { expect, it } from 'vitest';
import { createOpenRouterModel } from './openrouter.ts';

async function complete(sse: string, onDelta: (text: string) => Promise<void> = async () => {}) {
  const bytes = new TextEncoder().encode(sse);
  // Deliberately split UTF-8 and SSE frames at arbitrary byte boundaries.
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
      controller.close();
    },
  });
  const model = createOpenRouterModel(async () => new Response(body, { status: 200 }));
  return model.complete({
    apiKey: 'synthetic',
    model: 'synthetic',
    messages: [],
    tools: [],
    maxTokens: 10,
    modelCalls: 1,
    signal: AbortSignal.timeout(2000),
    onDelta,
  });
}

it('rejects a provider error before any tokens despite HTTP 200', async () => {
  await expect(
    complete('data: {"error":{"code":402},"choices":[{"finish_reason":"error"}]}\n\n'),
  ).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDITS' });
});
it('preserves partial tokens but rejects a mid-stream error', async () => {
  let text = '';
  await expect(
    complete(
      'data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n' +
        'data: {"error":{"code":"server_error"},"choices":[{"finish_reason":"error"}]}\n\n',
      async (delta) => {
        text += delta;
      },
    ),
  ).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  expect(text).toBe('Partial');
});
it('does not accept a truncated connection as a final answer', async () => {
  await expect(
    complete('data: {"choices":[{"delta":{"content":"Incomplete"}}]}\n\n'),
  ).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
});
it('decodes CRLF, comments, Unicode, and terminal accounting frames', async () => {
  const result = await complete(
    ': keepalive\r\n\r\ndata: {"choices":[{"delta":{"content":"Hello 🌍"}}]}\r\n\r\n' +
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":2}}\r\n\r\ndata: [DONE]\r\n\r\n',
  );
  expect(result.text).toBe('Hello 🌍');
  expect(result.usage.input_tokens).toBe(2);
});

it('uses provider input modalities to distinguish photo-capable models', async () => {
  const { fetchModelCatalog } = await import('./openrouter.ts');
  const models = await fetchModelCatalog('synthetic', async () =>
    Response.json({
      data: [
        {
          id: 'synthetic/vision',
          name: 'Vision',
          architecture: { input_modalities: ['text', 'image'] },
          supported_parameters: ['tools'],
          pricing: {},
        },
        {
          id: 'synthetic/text',
          name: 'Text',
          architecture: { input_modalities: ['text'] },
          pricing: {},
        },
      ],
    }),
  );
  expect(models[0]).toMatchObject({ supports_images: true, supports_tools: true });
  expect(models[1]).toMatchObject({ supports_images: false });
});

it('extracts image output modality and decodes generated images', async () => {
  const { fetchModelCatalog, generateOpenRouterImage } = await import('./openrouter.ts');
  const models = await fetchModelCatalog('synthetic', async () =>
    Response.json({
      data: [
        {
          id: 'google/gemini-2.5-flash-image',
          name: 'Gemini 2.5 Flash Image',
          architecture: { input_modalities: ['text', 'image'], output_modalities: ['image', 'text'] },
          pricing: {},
        },
      ],
    }),
  );
  expect(models[0]).toMatchObject({ supports_image_output: true });

  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0O0AAAAASUVORK5CYII=';
  const generated = await generateOpenRouterImage(
    { apiKey: 'synthetic', model: 'google/gemini-2.5-flash-image', prompt: 'A red square' },
    async () =>
      Response.json({
        usage: { cost: 0.02 },
        choices: [
          {
            message: {
              images: [{ image_url: { url: `data:image/png;base64,${pngBase64}` } }],
            },
          },
        ],
      }),
  );
  expect(generated.mime).toBe('image/png');
  expect(generated.costUsd).toBe('0.02');
  expect(generated.bytes.byteLength).toBeGreaterThan(20);
});
