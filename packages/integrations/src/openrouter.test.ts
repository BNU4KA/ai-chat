import { expect, it } from 'vitest';
import { createOpenRouterModel, fetchModelCatalog } from './openrouter.ts';

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

it('falls back cleanly via OpenRouter web plugin and marks Tavily quota errors fallbackable', async () => {
  const { searchWebOpenRouter } = await import('./openrouter.ts');
  const { searchWeb, TavilyError } = await import('./tavily.ts');

  let tavilyErr: unknown;
  try {
    await searchWeb('bad-key', 'weather tomorrow', 3, async () =>
      new Response('quota exceeded', { status: 429 }),
    );
  } catch (e) {
    tavilyErr = e;
  }
  expect(tavilyErr).toBeInstanceOf(TavilyError);
  expect((tavilyErr as InstanceType<typeof TavilyError>).fallbackable).toBe(true);

  let sentBody: Record<string, unknown> | undefined;
  const hits = await searchWebOpenRouter(
    { apiKey: 'synthetic', query: 'Gomel Bryansk road', maxResults: 3 },
    async (_url, init) => {
      sentBody = JSON.parse(String(init?.body ?? '{}'));
      return Response.json({
        choices: [
          {
            message: {
              content: 'Route M10 is open.',
              annotations: [
                {
                  type: 'url_citation',
                  url_citation: {
                    url: 'https://example.com/road',
                    title: 'Road status',
                    content: 'Normal traffic on M10.',
                  },
                },
              ],
            },
          },
        ],
      });
    },
  );
  expect(sentBody?.plugins).toEqual([{ id: 'web', max_results: 3 }]);
  expect(hits).toEqual([
    {
      title: 'Road status',
      url: 'https://example.com/road',
      excerpt: 'Normal traffic on M10.',
    },
  ]);
});

it('edits a reference photo through the Image API with input_references', async () => {
  const { editOpenRouterImage } = await import('./openrouter.ts');
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0O0AAAAASUVORK5CYII=';
  let url = '';
  let sent: Record<string, unknown> = {};
  const edited = await editOpenRouterImage(
    {
      apiKey: 'synthetic',
      model: 'google/gemini-2.5-flash-image',
      prompt: 'Remove the background',
      reference: { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), mime: 'image/jpeg' },
    },
    async (requestUrl, init) => {
      url = String(requestUrl);
      sent = JSON.parse(String(init?.body ?? '{}'));
      return Response.json({ usage: { cost: 0.03 }, data: [{ b64_json: pngBase64 }] });
    },
  );
  expect(url).toBe('https://openrouter.ai/api/v1/images');
  expect(sent.input_references).toEqual([
    { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/4A==' } },
  ]);
  expect(edited.mime).toBe('image/png');
  expect(edited.costUsd).toBe('0.03');
});

it('maps Image API failures and non-image payloads without returning a file', async () => {
  const { editOpenRouterImage } = await import('./openrouter.ts');
  const reference = { bytes: new Uint8Array([1, 2, 3]), mime: 'image/png' };
  await expect(
    editOpenRouterImage(
      { apiKey: 'synthetic', model: 'm', prompt: 'p', reference },
      async () => new Response('no', { status: 402 }),
    ),
  ).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDITS' });
  await expect(
    editOpenRouterImage(
      { apiKey: 'synthetic', model: 'm', prompt: 'p', reference },
      async () => Response.json({ data: [{ b64_json: 'aGVsbG8=' }] }),
    ),
  ).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
});

it('requests a JSON document revision with a bounded non-streaming chat call', async () => {
  const { completeOpenRouterJson } = await import('./openrouter.ts');
  let sent: Record<string, unknown> = {};
  const result = await completeOpenRouterJson(
    { apiKey: 'synthetic', model: 'openai/gpt-test', system: 'sys', user: 'usr', maxTokens: 900 },
    async (_url, init) => {
      sent = JSON.parse(String(init?.body ?? '{}'));
      return Response.json({
        usage: { cost: 0.001 },
        choices: [{ message: { content: '{"blocks":[]}' } }],
      });
    },
  );
  expect(sent).toMatchObject({
    stream: false,
    max_tokens: 900,
    response_format: { type: 'json_object' },
  });
  expect(result).toEqual({ text: '{"blocks":[]}', costUsd: '0.001' });
});

async function capturedBody(reasoningEffort: 'low' | 'medium' | 'high' | null) {
  let body: Record<string, unknown> | null = null;
  const model = createOpenRouterModel(async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return new Response('', { status: 500 });
  });
  await model
    .complete({
      apiKey: 'synthetic',
      model: 'synthetic/effort',
      messages: [],
      tools: [],
      maxTokens: 10,
      reasoningEffort,
      modelCalls: 1,
      signal: AbortSignal.timeout(2000),
      onDelta: async () => {},
    })
    .catch(() => undefined);
  return body as unknown as Record<string, unknown>;
}

it('sends reasoning effort to OpenRouter only when the conversation selected one', async () => {
  expect((await capturedBody('medium')).reasoning).toEqual({ effort: 'medium' });
  expect(await capturedBody(null)).not.toHaveProperty('reasoning');
});

it('reads reasoning effort levels from the model catalog in our order', async () => {
  const models = await fetchModelCatalog('synthetic', async () =>
    Response.json({
      data: [
        { id: 'a/listed', reasoning: { supported_efforts: ['high', 'low', 'none'] } },
        { id: 'b/all', reasoning: { supported_efforts: null } },
        { id: 'c/none', reasoning: { default_enabled: true } },
        { id: 'd/plain' },
      ],
    }),
  );
  const efforts = Object.fromEntries(models.map((model) => [model.id, model.reasoning_efforts]));
  expect(efforts).toEqual({
    'a/listed': ['low', 'high'],
    'b/all': ['low', 'medium', 'high'],
    'c/none': [],
    'd/plain': [],
  });
});
