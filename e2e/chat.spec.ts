import { randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
const owner = '10000000-0000-4000-8000-000000000001';
const chatId = '20000000-0000-4000-8000-000000000002';
const userId = '30000000-0000-4000-8000-000000000003';
const assistantId = '40000000-0000-4000-8000-000000000004';
const runId = '50000000-0000-4000-8000-000000000005';
const time = '2026-11-10T12:00:00Z';
function session() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access_token =
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') +
    '.' +
    Buffer.from(
      JSON.stringify({
        sub: owner,
        exp,
        aud: 'authenticated',
        iss: 'https://synthetic.supabase.co/auth/v1',
      }),
    ).toString('base64url') +
    '.synthetic';
  return {
    access_token,
    refresh_token: 'synthetic-refresh',
    expires_in: 3600,
    expires_at: exp,
    token_type: 'bearer',
    user: {
      id: owner,
      aud: 'authenticated',
      email: 'synthetic@example.com',
      app_metadata: { provider: 'google', providers: ['google'] },
      user_metadata: { full_name: 'Synthetic Test User' },
      created_at: time,
    },
  };
}
async function seed(context: BrowserContext) {
  await context.addInitScript((value) => {
    window.localStorage.setItem('sb-synthetic-auth-token', JSON.stringify(value));
  }, session());
}
async function fixture(
  page: Page,
  answer = 'Synthetic answer with **Markdown** and a safe result.',
  initialLocale: 'auto' | 'en' | 'ru' = 'en',
  evidenceSources: Record<string, unknown>[] = [],
) {
  let profileLocale = initialLocale;
  let profileVersion = 1;
  let chat: {
    id: string;
    title: string;
    model_id: string | null;
    enabled_tools: string[];
    version: number;
    created_at: string;
    updated_at: string;
  } | null = null;
  let messages: Record<string, unknown>[] = [];
  let run: Record<string, unknown> | null = null;
  const submissions: { key: string; body: unknown }[] = [];
  const attachments: Record<string, unknown>[] = [];
  const usage = { input_tokens: null, output_tokens: null, cost_usd: null, cost_status: 'unknown' };
  await page.route('https://synthetic.supabase.co/**', (route) => route.fulfill({ json: {} }));
  await page.route('http://localhost:3001/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const method = req.method();
    const data = (value: unknown, status = 200) =>
      route.fulfill({
        status,
        json: { data: value, next_cursor: null },
        headers: { 'access-control-allow-origin': 'http://localhost:8092' },
      });
    if (method === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': 'http://localhost:8092',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
        },
      });
    if (['/v1/projects', '/v1/documents', '/v1/schedules', '/v1/notices'].includes(path))
      return data([]);
    if (path.endsWith('/estimate'))
      return data({
        input_tokens_estimated: 1000,
        context_length: 32000,
        cost_usd_estimated: '0.001',
      });
    if (path === '/v1/profile') {
      if (method === 'PATCH') {
        profileLocale = req.postDataJSON().locale ?? profileLocale;
        profileVersion++;
      }
      return data({
        id: owner,
        display_name: 'Synthetic Test User',
        theme: 'system',
        timezone: 'Europe/Warsaw',
        locale: profileLocale,
        version: profileVersion,
        created_at: time,
        updated_at: time,
      });
    }
    if (path === '/v1/credentials/openrouter')
      return data({
        configured: true,
        last_four: 'test',
        status: 'valid',
        version: 1,
        validated_at: time,
      });
    if (path === '/v1/capabilities')
      return data({
        tools: { web: 'available', files: 'available', gmail: 'connect', calendar: 'connect' },
        limits: { file_bytes: 20971520 },
      });
    if (path === '/v1/models')
      return data([
        {
          id: 'synthetic/model',
          name: 'Synthetic Model',
          supports_tools: true,
          supports_images: true,
          context_length: 32000,
          input_price_per_million_usd: '1',
          output_price_per_million_usd: '2',
          supported_parameters: ['tools'],
          catalog_fetched_at: time,
          catalog_stale: false,
        },
      ]);
    if (path === '/v1/conversations' && method === 'GET') return data(chat ? [chat] : []);
    if (path === '/v1/conversations' && method === 'POST') {
      chat = {
        id: chatId,
        title: 'New chat',
        model_id: req.postDataJSON()?.model_id ?? 'synthetic/model',
        enabled_tools: ['web', 'files'],
        version: 1,
        created_at: time,
        updated_at: time,
      };
      return data(chat, 201);
    }
    if (path === `/v1/conversations/${chatId}` && method === 'GET') return data(chat);
    if (path === `/v1/conversations/${chatId}` && method === 'PATCH') {
      chat = { ...chat!, ...req.postDataJSON(), version: chat!.version + 1 };
      return data(chat);
    }
    if (path === `/v1/conversations/${chatId}/files`) return data(attachments);
    if (path === '/v1/files/uploads' && method === 'POST') {
      const body = req.postDataJSON();
      const id = randomUUID();
      const file = {
        id,
        conversation_id: chatId,
        filename: body.filename,
        byte_size: body.byte_size,
        detected_mime: body.declared_mime,
        status: 'pending_upload',
        error_code: null,
        version: 1,
        created_at: time,
      };
      attachments.push(file);
      return data(
        { file, upload_url: `https://synthetic.supabase.co/upload/${id}`, required_headers: {} },
        201,
      );
    }
    if (path.startsWith('/v1/files/')) {
      const id = path.split('/')[3];
      const file = attachments.find((value) => value.id === id);
      if (file && path.endsWith('/finalize')) {
        file.status = 'ready';
        file.version = 3;
        return data(file, 202);
      }
      if (file && path.endsWith('/download'))
        return data({ url: 'https://synthetic.supabase.co/preview.png' });
    }
    if (path === `/v1/conversations/${chatId}/messages` && method === 'GET') return data(messages);
    if (path === `/v1/conversations/${chatId}/messages` && method === 'POST') {
      const body = req.postDataJSON();
      submissions.push({ key: req.headers()['idempotency-key']!, body });
      messages = [
        {
          id: userId,
          conversation_id: chatId,
          run_id: runId,
          seq: '1',
          role: 'user',
          content: body.text,
          status: 'complete',
          file_ids: body.file_ids ?? [],
          created_at: time,
        },
        {
          id: assistantId,
          conversation_id: chatId,
          run_id: runId,
          seq: '2',
          role: 'assistant',
          content: '',
          status: 'pending',
          file_ids: [],
          created_at: time,
        },
      ];
      run = {
        id: runId,
        conversation_id: chatId,
        user_message_id: userId,
        assistant_message_id: assistantId,
        status: 'queued',
        model_id: 'synthetic/model',
        attempt: 1,
        version: 1,
        last_event_seq: '0',
        error_code: null,
        usage,
        cancel_requested_at: null,
        created_at: time,
        finished_at: null,
      };
      return data({ message: messages[0], run }, 202);
    }
    if (path === `/v1/conversations/${chatId}/runs`) return data(run ? [run] : []);
    if (path === `/v1/runs/${runId}`)
      return data({
        run,
        assistant_message: messages[1],
        tool_calls: [],
        approvals: [],
        sources: evidenceSources,
      });
    if (path === `/v1/runs/${runId}/events`) {
      messages[1] = {
        ...messages[1],
        content: answer,
        status: 'complete',
      };
      run = { ...run, status: 'completed', last_event_seq: '3' };
      const events = [
        {
          seq: '1',
          type: 'run.started',
          payload: { model_id: 'synthetic/model', assistant_message_id: assistantId },
        },
        {
          seq: '2',
          type: 'message.delta',
          payload: {
            message_id: assistantId,
            delta: answer,
          },
        },
        {
          seq: '3',
          type: 'run.completed',
          payload: { assistant_message_id: assistantId, final_content: messages[1].content, usage },
        },
      ];
      return route.fulfill({
        contentType: 'text/event-stream',
        body: events
          .map(
            (e) =>
              `id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify({ ...e, run_id: runId, timestamp: time })}\n\n`,
          )
          .join(''),
      });
    }
    return route.fulfill({
      status: 404,
      json: {
        error: { code: 'NOT_FOUND', message: `Unhandled synthetic route: ${method} ${path}` },
      },
    });
  });
  return {
    submissions,
    snapshot: () => ({
      run,
      assistant_message: messages[1],
      tool_calls: [],
      approvals: [],
      sources: evidenceSources,
    }),
  };
}
test('Google sign-in uses PKCE and does not request Gmail or Calendar scopes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let authorization: URL | null = null;
  await page.route('https://synthetic.supabase.co/auth/v1/authorize**', (route) => {
    authorization = new URL(route.request().url());
    return route.fulfill({
      contentType: 'text/html',
      body: '<p>Synthetic authorization screen</p>',
    });
  });
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByText('Synthetic authorization screen')).toBeVisible();
  expect(authorization).not.toBeNull();
  const url = authorization as unknown as URL;
  expect(url.searchParams.get('provider')).toBe('google');
  expect(url.searchParams.get('code_challenge')).toBeTruthy();
  expect(url.searchParams.get('scopes')).not.toMatch(/gmail|calendar/);
  expect(errors).toEqual([]);
});
test('an authenticated user creates a chat, chooses a model and receives one persisted answer', async ({
  context,
  page,
}) => {
  await seed(context);
  const f = await fixture(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Choose model' })).toBeVisible();
  await page.getByRole('button', { name: 'Choose model' }).click();
  await page.getByRole('button', { name: /Synthetic Model Tools supported/ }).click();
  await page.getByLabel('Message', { exact: true }).fill('Synthetic question');
  await page.getByRole('button', { name: 'Send ↑', exact: true }).click();
  await expect(page.getByText(/Synthetic answer with/)).toBeVisible();
  expect(f.submissions).toHaveLength(1);
  expect(f.submissions[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page.getByRole('button', { name: 'Retry last response' })).toBeVisible();
  const retryButton = page.getByRole('button', { name: 'Retry last response' });
  expect((await retryButton.boundingBox())!.width).toBeLessThanOrEqual(44);
  await expect(page.getByRole('button', { name: 'Good response', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Bad response', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'More response actions' })).toHaveCount(0);
  const userBubble = await page.getByTestId('user-message-bubble').boundingBox();
  const userActions = await page.getByTestId('user-message-actions').boundingBox();
  expect(userActions!.y).toBeGreaterThanOrEqual(userBubble!.y + userBubble!.height);
  await page
    .getByTestId('assistant-message-actions')
    .getByRole('button', { name: 'Copy message', exact: true })
    .click();
  await expect(page.getByText('Copied', { exact: true })).toBeVisible();
  await page.getByLabel('Message', { exact: true }).focus();
  await expect(page.getByLabel('Message', { exact: true })).toHaveCSS('outline-style', 'none');
  await expect(page.getByTestId('composer-frame')).toBeVisible();
  await retryButton.click();
  await expect(page.getByText('Retry response?', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).last().click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({
    path: test.info().outputPath('response-actions.png'),
    animations: 'disabled',
  });

  expect(errors).toEqual([]);
  if (test.info().project.name === 'mobile-web')
    await page.getByRole('button', { name: 'Open conversation history' }).click();
  await expect(page.getByRole('button', { name: 'Settings', exact: true }).first()).toBeVisible();
});
test('settings expose separate Google consent and require typed account-deletion confirmation', async ({
  context,
  page,
}) => {
  await seed(context);
  await fixture(page);
  await page.route('http://localhost:3001/v1/integrations/google', (route) =>
    route.fulfill({
      json: {
        data: {
          status: 'disconnected',
          account_email: null,
          capabilities: { gmail: false, calendar: false },
          version: 0,
          last_error_code: null,
        },
      },
    }),
  );
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Connections', exact: true }).click();
  await expect(page.getByText('Google Calendar', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Your account', exact: true }).click();
  await expect(page.getByText('Synthetic Test User', { exact: true })).toBeVisible();
  await page.goto('/settings/data');
  const remove = page.getByRole('button', { name: 'Permanently delete account' });
  await expect(remove).toBeDisabled();
  await page.getByLabel('Type DELETE to confirm account deletion').fill('DELETE');
  await expect(remove).toBeEnabled();
});

test('conversation sidebar collapses on desktop and opens as an edge drawer on mobile', async ({
  context,
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await seed(context);
  await fixture(page);
  await page.goto('/');
  if (test.info().project.name === 'desktop') {
    const sidebar = page.getByTestId('conversation-sidebar');
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toHaveCSS('transition-duration', '0.22s');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(sidebar).toHaveCSS('transition-duration', '0s');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(sidebar).toHaveCSS('transition-duration', '0.22s');
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(260);
    await page.getByRole('button', { name: 'Collapse conversation sidebar' }).click();
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(52);
    await page.getByRole('button', { name: 'Expand conversation sidebar' }).click();
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(260);
    await page.getByRole('button', { name: 'Search conversation history' }).click();
    const searchModal = page.getByTestId('search-modal');
    await expect(searchModal).toBeVisible();
    await expect(searchModal.getByLabel('Search chats and messages', { exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(searchModal).toHaveCount(0);
    await page.screenshot({
      path: test.info().outputPath('sidebar-desktop.png'),
      animations: 'disabled',
    });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.screenshot({
      path: test.info().outputPath('sidebar-light.png'),
      animations: 'disabled',
    });
  } else {
    await expect(page.getByTestId('conversation-drawer')).toBeHidden();
    await page.getByRole('button', { name: 'Open conversation history' }).click();
    const drawer = page.getByTestId('conversation-drawer');
    await expect(drawer).toBeVisible();
    await expect.poll(async () => Math.round((await drawer.boundingBox())!.x)).toBe(0);
    const box = (await drawer.boundingBox())!;
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    expect(box.width).toBe(300);
    expect(box.height).toBe(page.viewportSize()!.height);
    await expect(page.getByText('Conversations', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Close conversation history' })).toHaveCount(1);
    await page.screenshot({
      path: test.info().outputPath('sidebar-mobile.png'),
      animations: 'disabled',
    });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.screenshot({
      path: test.info().outputPath('sidebar-mobile-light.png'),
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await page.getByRole('button', { name: 'Open conversation history' }).click();
    await page.mouse.click(page.viewportSize()!.width - 10, 120);
    await expect(drawer).toBeHidden();
    await page.getByRole('button', { name: 'Open conversation history' }).click();
    await drawer.getByRole('button', { name: 'New conversation', exact: true }).click();
    await expect(drawer).toBeHidden();
    await expect(page.getByRole('button', { name: 'Choose model' })).toBeVisible();
  }
});

test('a user attaches a photo and a Word file from the start screen and asks about both', async ({
  context,
  page,
}) => {
  await seed(context);
  const f = await fixture(page);
  await page.route('https://synthetic.supabase.co/preview.png', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0O0AAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
  await page.goto('/');
  await expect(page.getByText('Ready when you are.')).toBeVisible();
  await page.getByRole('button', { name: 'Choose model' }).click();
  await page.getByRole('button', { name: /Synthetic Model Tools supported/ }).click();
  for (const input of [
    {
      name: 'synthetic.png',
      mimeType: 'image/png',
      buffer: Buffer.from('synthetic browser file; decoder covered by integration tests'),
    },
    {
      name: 'budget.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('synthetic browser Word file'),
    },
  ]) {
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Attach photos or files' }).click();
    await (await chooser).setFiles(input);
    await expect(page.getByText(input.name, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('img', { name: 'synthetic.png' })).toBeVisible();
  await page
    .getByLabel('Message', { exact: true })
    .fill('Compare this photo with the Word document.');
  await page.screenshot({
    path: test.info().outputPath('attachments-composer.png'),
    animations: 'disabled',
  });
  const send = page.getByRole('button', { name: 'Send ↑', exact: true });
  const box = (await send.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await send.click();
  await expect(page.getByText(/Synthetic answer with/)).toBeVisible();
  expect(f.submissions).toHaveLength(1);
  expect((f.submissions[0]!.body as { file_ids: string[] }).file_ids).toHaveLength(2);
});

test('loading indicator and composer honor reduced motion', async ({ context, page }) => {
  await seed(context);
  await fixture(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('http://localhost:3001/v1/models**', async (route) => {
    await pending;
    await route.fallback();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Choose model' }).click();
  const spinner = page.getByRole('progressbar', { name: 'Loading models' });
  await expect(spinner).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  expect(
    await spinner
      .getByTestId('chatgpt-spinner-ring')
      .evaluate((el) => parseFloat(getComputedStyle(el).animationDuration)),
  ).toBeLessThan(0.001);
  await page.screenshot({
    path: test.info().outputPath('chatgpt-loader.png'),
    animations: 'disabled',
  });
  release();
  await expect(spinner).toHaveCount(0);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).last().click();
  await page.getByLabel('Message', { exact: true }).focus();
  await page.screenshot({
    path: test.info().outputPath('composer-focused.png'),
    animations: 'disabled',
  });
});

test('Markdown preserves table columns, alignment and nested numbered lists', async ({
  context,
  page,
}) => {
  await seed(context);
  await fixture(
    page,
    `### gRPC vs REST (JSON)

| Characteristic | gRPC | REST |
| :--- | :---: | ---: |
| **Data format** | Binary (Protobuf) | Text (JSON, XML) |
| Protocol | HTTP/2 | HTTP/1.1 or HTTP/2 |
| Contract | Strict (\`.proto\`) | OpenAPI optional |

3. Third item
   - Nested detail
4. Fourth item

> A quoted paragraph.

[Unsafe link](javascript:alert(1))

\`inline code\`

\`\`\`ts
const safe = true;
\`\`\`
`,
  );
  await page.goto('/');
  await page.getByLabel('Message', { exact: true }).fill('Show a formatted comparison');
  await page.getByRole('button', { name: 'Send ↑', exact: true }).click();
  const table = page.getByRole('table', { name: 'Response table' });
  await expect(table).toBeVisible();
  await expect(table.getByRole('row')).toHaveCount(4);
  await expect(table.getByRole('columnheader')).toHaveCount(3);
  await expect(table.getByRole('cell')).toHaveCount(9);
  await expect
    .poll(async () => {
      const f = (await table.getByRole('cell', { name: 'Data format', exact: true }).boundingBox())!;
      const b = (await table
        .getByRole('cell', { name: 'Binary (Protobuf)', exact: true })
        .boundingBox())!;
      return Math.abs(b.y - f.y);
    })
    .toBeLessThan(2);
  const format = await table.getByRole('cell', { name: 'Data format', exact: true }).boundingBox();
  const binary = await table
    .getByRole('cell', { name: 'Binary (Protobuf)', exact: true })
    .boundingBox();
  expect(binary!.x).toBeGreaterThan(format!.x);
  await expect(
    table.getByRole('columnheader', { name: 'REST', exact: true }).locator('div').last(),
  ).toHaveCSS('text-align', 'right');
  await expect(page.getByText('3.', { exact: true })).toBeVisible();
  await expect(page.getByText('4.', { exact: true })).toBeVisible();
  await expect(page.getByText('Nested detail', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Unsafe link' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Copy code', exact: true })).toBeVisible();
  await page.emulateMedia({ colorScheme: 'dark' });
  await table.scrollIntoViewIfNeeded();
  if (test.info().project.name === 'mobile-web') {
    const scrollable = page.getByLabel('Scrollable table', { exact: true });
    expect(await scrollable.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  }
  await page.screenshot({
    path: test.info().outputPath('markdown-table.png'),
    animations: 'disabled',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('Russian auto locale and profile override persist on the ChatGPT home layout', async ({
  context,
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'language', { get: () => 'ru-RU', configurable: true });
    Object.defineProperty(navigator, 'languages', {
      get: () => ['ru-RU', 'en-US'],
      configurable: true,
    });
  });
  await seed(context);
  await fixture(page, undefined, 'auto');
  await page.goto('/');
  await expect(page.getByText('Готов к работе.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Сообщение', { exact: true })).toHaveAttribute(
    'placeholder',
    "Спросите it's kawasaki, bitches",
  );
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  if (test.info().project.name === 'mobile-web') {
    await page.getByRole('button', { name: 'Открыть историю', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Настройки', exact: true }).last().click();
  await expect(page.getByTestId('settings-modal')).toBeVisible();
  await expect(page.getByText('Язык', { exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'English', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'English', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByText('Settings', { exact: true }).last()).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByRole('radio', { name: 'English', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('radio', { name: 'Automatic', exact: true }).click();
  await expect(page.getByText('Настройки', { exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'Back to conversations', exact: true }).click();
  await expect(page.getByText('Ready when you are.', { exact: true })).toBeVisible();
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.screenshot({ path: test.info().outputPath('chatgpt-home.png'), animations: 'disabled' });
});

async function workspaceFixture(page: Page) {
  const projects: Record<string, unknown>[] = [];
  const documents: Record<string, unknown>[] = [];
  const schedules: Record<string, unknown>[] = [];
  const revisions: Record<string, unknown>[] = [];
  await page.route('http://localhost:3001/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname,
      method = req.method();
    const data = (value: unknown, status = 200) =>
      route.fulfill({
        status,
        json: { data: value },
        headers: { 'access-control-allow-origin': 'http://localhost:8092' },
      });
    if (method === 'OPTIONS') return route.fallback();
    if (path === '/v1/projects') {
      if (method === 'POST') {
        const p = {
          ...req.postDataJSON(),
          id: randomUUID(),
          version: 1,
          created_at: time,
          updated_at: time,
        };
        projects.push(p);
        return data(p, 201);
      }
      return data(projects);
    }
    if (path.startsWith('/v1/projects/') && path.endsWith('/files')) return data([]);
    if (path === '/v1/documents') {
      if (method === 'POST') {
        const d = {
          ...req.postDataJSON(),
          id: randomUUID(),
          version: 1,
          created_at: time,
          updated_at: time,
        };
        documents.push(d);
        revisions.push({ ...d });
        return data(d, 201);
      }
      return data(documents);
    }
    if (path.startsWith('/v1/documents/')) {
      const id = path.split('/')[3],
        doc = documents.find((d) => d.id === id);
      if (path.endsWith('/revisions')) return data(revisions.filter((v) => v.id === id).reverse());
      if (method === 'GET' && doc) return data(doc);
      if (method === 'PATCH' && doc) {
        Object.assign(doc, req.postDataJSON(), { version: Number(doc.version) + 1 });
        revisions.push({ ...doc });
        return data(doc);
      }
    }
    if (path === '/v1/schedules') {
      if (method === 'POST') {
        const s = {
          ...req.postDataJSON(),
          id: randomUUID(),
          paused: false,
          next_at: '2026-11-13T08:00:00Z',
          last_error: null,
          version: 1,
          created_at: time,
          updated_at: time,
        };
        schedules.push(s);
        return data(s, 201);
      }
      return data(schedules);
    }
    if (path.startsWith('/v1/schedules/') && method === 'PATCH') {
      const s = schedules.find((v) => v.id === path.split('/')[3]);
      Object.assign(s!, req.postDataJSON(), { version: Number(s!.version) + 1 });
      return data(s);
    }
    if (path === '/v1/notices')
      return data([
        {
          id: randomUUID(),
          title: 'Daily review: completed',
          conversation_id: chatId,
          read_at: null,
        },
      ]);
    if (path === '/v1/search/messages')
      return data([
        {
          id: userId,
          conversation_id: chatId,
          title: 'Synthetic question',
          snippet: 'A matching private phrase',
        },
      ]);
    if (path === '/v1/meetings/slots')
      return data({
        slots: [{ start: '2026-11-12T12:00:00Z', end: '2026-11-12T12:30:00Z' }],
        timezone: 'UTC',
      });
    if (path.endsWith('/estimate'))
      return data({
        input_tokens_estimated: 512,
        context_length: 32000,
        cost_usd_estimated: '0.001000000',
      });
    return route.fallback();
  });
  return { projects, documents, schedules };
}

test('workspace persists project memory, document versions and scheduled task pause', async ({
  context,
  page,
}, testInfo) => {
  await seed(context);
  await fixture(page);
  const f = await workspaceFixture(page);
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  if (testInfo.project.name === 'mobile-web') {
    await page.getByRole('button', { name: 'Open conversation history' }).click();
  }
  await page.getByRole('button', { name: 'Projects', exact: true }).last().click();
  await page.getByLabel('Project name', { exact: true }).fill('Synthetic career project');
  await page
    .getByLabel('Project memory', { exact: true })
    .fill('Goal: find a role. Decision: prioritize remote teams.');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Synthetic career project', exact: true }),
  ).toBeVisible();
  expect(f.projects[0]?.memory).toContain('remote teams');
  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  await page.getByLabel('New document title', { exact: true }).fill('Synthetic plan');
  await page.getByRole('button', { name: 'Create document', exact: true }).click();
  await page
    .getByLabel('Document content', { exact: true })
    .fill('A preserved first paragraph.\n\nAn editable second paragraph.');
  await page.getByRole('button', { name: 'Save version', exact: true }).click();
  await expect(page.getByText('Document · version 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Versions', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Load version 1 into editor', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Scheduled tasks', exact: true }).click();
  await page.getByLabel('Scheduled task title', { exact: true }).fill('Synthetic daily review');
  await page
    .getByLabel('Scheduled task instruction', { exact: true })
    .fill('Prepare a summary of my day.');
  await page.getByRole('button', { name: 'Choose scheduled model', exact: true }).click();
  await page.getByRole('button', { name: /Synthetic Model Tools supported/ }).click();
  await page.getByRole('button', { name: 'Create scheduled task', exact: true }).click();
  await expect(page.getByText(/Synthetic daily review ·/)).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  expect(f.schedules[0]?.paused).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `/tmp/ai-chat-workspace-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test('response tools save a versioned document and prepare passage follow-ups without submission', async ({
  context,
  page,
}, testInfo) => {
  await seed(context);
  const base = await fixture(page, 'A detailed synthetic answer.');
  const f = await workspaceFixture(page);
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Choose model', exact: true }).click();
  await page.getByRole('button', { name: /Synthetic Model Tools supported/ }).click();
  await page.getByLabel('Message', { exact: true }).fill('Synthetic question');
  await page.getByRole('button', { name: 'Send ↑', exact: true }).click();
  await expect(page.getByText('A detailed synthetic answer.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'More message actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Work with response', exact: true }).click();
  await page.getByLabel('Selected response passage', { exact: true }).fill('synthetic answer');
  await page.getByRole('button', { name: 'Explain', exact: true }).click();
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue(
    'Explain the following passage:\n\nsynthetic answer',
  );
  expect(base.submissions).toHaveLength(1);
  await page.getByRole('button', { name: 'More message actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Save as document', exact: true }).click();
  await expect(page.getByTestId('document-editor')).toBeVisible();
  expect(f.documents).toHaveLength(1);
  expect(f.documents[0]?.content).toBe('A detailed synthetic answer.');
  await page.getByLabel('Document content', { exact: true }).fill('An edited saved result.');
  await page.getByRole('button', { name: 'Save version', exact: true }).click();
  await expect(page.getByText('Document · version 2', { exact: true })).toBeVisible();
  expect(base.submissions).toHaveLength(1);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `/tmp/ai-chat-document-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test('research citations reveal saved evidence and meeting suggestions prepare an unsubmitted draft', async ({
  context,
  page,
}) => {
  await seed(context);
  const base = await fixture(page, 'A supported synthetic claim [S1].', 'en', [
    {
      citation_id: 'S1',
      kind: 'web',
      title: 'Synthetic reference',
      url: 'https://example.com/evidence',
      excerpt: 'This is the stored evidence passage.',
      retrieved_at: time,
    },
  ]);
  await workspaceFixture(page);
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Choose model', exact: true }).click();
  await page.getByRole('button', { name: /Synthetic Model Tools supported/ }).click();
  await page.getByLabel('Message', { exact: true }).fill('Synthetic research');
  await page.getByRole('button', { name: 'Send ↑', exact: true }).click();
  await page.getByRole('button', { name: 'Show evidence [S1]', exact: true }).click();
  await expect(
    page.getByText('This is the stored evidence passage.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Conversation menu', exact: true }).click();
  await page.getByRole('button', { name: 'Work tools', exact: true }).click();
  await page.getByRole('button', { name: 'Cost & limits', exact: true }).click();
  await page.getByRole('button', { name: 'Estimate current draft', exact: true }).click();
  await expect(page.getByText(/Estimated input: 512 tokens/)).toBeVisible();
  await page.getByRole('button', { name: 'Meeting times', exact: true }).click();
  await page.getByLabel('Meeting search start', { exact: true }).fill('2026-11-12T09:00:00Z');
  await page.getByLabel('Meeting search end', { exact: true }).fill('2026-11-12T18:00:00Z');
  await page.getByRole('button', { name: 'Find meeting times', exact: true }).click();
  await page.getByRole('button', { name: /11\/12\/2026|12\.11\.2026/ }).click();
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue(
    /Prepare a calendar event from 2026-11-12T12:00:00Z/,
  );
  expect(base.submissions).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('editing a user message creates a preserved branch and keeps the new prompt as a draft', async ({
  context,
  page,
}) => {
  await seed(context);
  const base = await fixture(page);
  await workspaceFixture(page);
  const branch = randomUUID();
  await page.route('http://localhost:3001/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (req.method() === 'OPTIONS') return route.fallback();
    if (path === `/v1/messages/${userId}/branch`)
      return route.fulfill({
        json: {
          data: {
            conversation_id: branch,
            draft: req.postDataJSON().text,
            attachments_copied: false,
          },
        },
      });
    if (path === `/v1/conversations/${branch}`)
      return route.fulfill({
        json: {
          data: {
            id: branch,
            title: 'Branch: Synthetic question',
            model_id: 'synthetic/model',
            enabled_tools: [],
            version: 1,
            created_at: time,
            updated_at: time,
          },
        },
      });
    if (path.startsWith(`/v1/conversations/${branch}/`))
      return route.fulfill({ json: { data: [], next_cursor: null } });
    return route.fallback();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Choose model', exact: true }).click();
  await page.getByRole('button', { name: /Synthetic Model Tools supported/ }).click();
  await page.getByLabel('Message', { exact: true }).fill('Original synthetic question');
  await page.getByRole('button', { name: 'Send ↑', exact: true }).click();
  await expect(page.getByText(/Synthetic answer with/)).toBeVisible();
  await page.getByRole('button', { name: 'Edit into a new branch', exact: true }).click();
  await page.getByLabel('Edited message', { exact: true }).fill('Edited synthetic question');
  await page.getByRole('button', { name: 'Create branch', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(branch));
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(
    'Edited synthetic question',
  );
  expect(base.submissions).toHaveLength(1);
});

test('long-context advice offers a reviewed note without submitting another generation', async ({
  context,
  page,
}) => {
  await seed(context);
  const base = await fixture(page);
  await page.route('http://localhost:3001/**/estimate', (route) =>
    route.fulfill({
      json: {
        data: { input_tokens_estimated: 28000, context_length: 32000, cost_usd_estimated: '0.1' },
      },
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Choose model', exact: true }).click();
  await page.getByRole('button', { name: /Synthetic Model Tools supported/ }).click();
  await page.getByLabel('Message', { exact: true }).fill('Synthetic long conversation');
  await page.getByRole('button', { name: 'Send ↑', exact: true }).click();
  await expect(page.getByText(/Synthetic answer with/)).toBeVisible();
  await page.getByRole('button', { name: 'Review context', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Reviewed context note', exact: true }),
  ).toBeVisible();
  expect(base.submissions).toHaveLength(1);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`workspace matches shared styling in ${scheme} mode`, async ({ context, page }, info) => {
    await seed(context);
    await fixture(page);
    await workspaceFixture(page);
    await page.emulateMedia({ colorScheme: scheme });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('/');
    if (info.project.name === 'mobile-web') {
      await page.getByRole('button', { name: 'Open conversation history' }).click();
    }
    await page.getByRole('button', { name: 'Settings', exact: true }).last().click();
    await expect(page.getByTestId('settings-modal')).toBeVisible();
    await expect(page.getByText('Settings', { exact: true }).last()).toHaveCSS(
      'color',
      scheme === 'dark' ? 'rgb(236, 236, 236)' : 'rgb(13, 13, 13)',
    );
    await page.screenshot({
      animations: 'disabled',
      path: `/tmp/ai-chat-style-settings-${scheme}-${info.project.name}.png`,
    });
    await page.getByRole('button', { name: 'Close dialog', exact: true }).last().click();
    if (info.project.name === 'mobile-web') {
      await page.getByRole('button', { name: 'Open conversation history' }).click();
    }
    await page.getByRole('button', { name: 'Projects', exact: true }).last().click();
    await page.getByLabel('Project name', { exact: true }).fill('Synthetic shared project');
    await page
      .getByLabel('Project memory', { exact: true })
      .fill('Goals and decisions stay together.');
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    const project = page.getByRole('button', { name: 'Synthetic shared project', exact: true });
    await expect(project).toHaveAttribute('aria-pressed', 'true');
    await expect(project).toHaveCSS(
      'background-color',
      scheme === 'dark' ? 'rgb(47, 47, 47)' : 'rgb(229, 229, 229)',
    );
    await page.screenshot({
      animations: 'disabled',
      path: `/tmp/ai-chat-style-projects-${scheme}-${info.project.name}.png`,
    });
    await page.getByRole('button', { name: 'Documents', exact: true }).click();
    await page.getByLabel('New document title', { exact: true }).fill('Synthetic working document');
    await page.getByRole('button', { name: 'Create document', exact: true }).click();
    await page
      .getByLabel('Document content', { exact: true })
      .fill('A document uses the same neutral surfaces and typography as chat.');
    await page.getByRole('button', { name: 'Save version', exact: true }).click();
    const editor = page.getByTestId('document-editor');
    await expect(editor).toHaveCSS(
      'background-color',
      scheme === 'dark' ? 'rgb(47, 47, 47)' : 'rgb(249, 249, 249)',
    );
    await expect(page.getByRole('button', { name: 'Save version', exact: true })).toHaveCSS(
      'border-radius',
      '9999px',
    );
    await page.screenshot({
      animations: 'disabled',
      path: `/tmp/ai-chat-style-documents-${scheme}-${info.project.name}.png`,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.getByRole('button', { name: 'Scheduled tasks', exact: true }).click();
    await page.getByRole('button', { name: 'Choose scheduled model', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Search models', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Synthetic Model Tools supported/ }).click();
    await expect(
      page.getByRole('textbox', { name: 'Search models', exact: true }),
    ).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Choose scheduled model', exact: true }),
    ).toContainText('Synthetic Model');
    await page.getByRole('button', { name: 'Daily', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Daily', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.screenshot({
      animations: 'disabled',
      path: `/tmp/ai-chat-style-schedules-${scheme}-${info.project.name}.png`,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('calendar revision UI retains omitted fields and requires a separate fresh confirmation', async ({
  context,
  page,
}) => {
  await seed(context);
  const f = await fixture(page);
  await workspaceFixture(page);
  let revision: Record<string, unknown> | null = null;
  let approval = {
    id: '60000000-0000-4000-8000-000000000006',
    run_id: runId,
    tool_call_id: '70000000-0000-4000-8000-000000000007',
    tool_name: 'update_calendar_event',
    args_hash: 'original-hash',
    status: 'pending',
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    arguments: {
      event_id: 'synthetic-event',
      expected_etag: 'synthetic-etag',
      title: 'Proposed title',
      timezone: 'UTC',
    },
    structured_preview: {
      title: 'Proposed title',
      start: '2026-11-12T09:00:00Z',
      end: '2026-11-12T10:00:00Z',
      timezone: 'UTC',
      attendees: [{ address: 'guest@example.com' }],
      description: 'Keep this description',
    },
  };
  await page.route(`http://localhost:3001/v1/runs/${runId}`, (route) => {
    const snapshot = f.snapshot();
    return route.fulfill({
      json: {
        data: {
          ...snapshot,
          run: { ...snapshot.run, status: 'waiting_approval' },
          approvals: [approval],
        },
      },
    });
  });
  await page.route('http://localhost:3001/v1/approvals/*/revise', async (route) => {
    revision = route.request().postDataJSON().arguments;
    approval = {
      ...approval,
      args_hash: 'revised-hash',
      arguments: revision as typeof approval.arguments,
      structured_preview: { ...approval.structured_preview, title: String(revision!.title) },
    };
    await route.fulfill({ json: { data: { id: approval.id, args_hash: approval.args_hash } } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Choose model', exact: true }).click();
  await page.getByRole('button', { name: /Synthetic Model Tools supported/ }).click();
  await page.getByLabel('Message', { exact: true }).fill('Change the event title');
  await page.getByRole('button', { name: 'Send ↑', exact: true }).click();
  await page.getByRole('button', { name: 'Edit proposal', exact: true }).click();
  await expect(page.getByLabel('Edit start', { exact: true })).toHaveValue('2026-11-12T09:00:00Z');
  await page.getByLabel('Edit title', { exact: true }).fill('Edited title');
  await page.getByRole('button', { name: 'Save revised proposal', exact: true }).click();
  await expect
    .poll(() => revision)
    .toEqual({
      event_id: 'synthetic-event',
      expected_etag: 'synthetic-etag',
      title: 'Edited title',
      timezone: 'UTC',
    });
  await expect(page.getByRole('button', { name: 'Confirm action', exact: true })).toBeVisible();
  await expect(page.getByText('Keep this description', { exact: true })).toBeVisible();
  expect(f.submissions).toHaveLength(1);
});

test('Russian workspace keeps localized navigation and shared selection styling', async ({
  context,
  page,
}, info) => {
  await seed(context);
  await fixture(page, 'Synthetic answer', 'ru');
  await workspaceFixture(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  if (info.project.name === 'mobile-web') {
    await page.getByRole('button', { name: 'Открыть историю', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Проекты', exact: true }).last().click();
  await expect(page.getByText('Рабочее пространство', { exact: true })).toBeVisible();
  const scheduleTab = page.getByRole('button', { name: 'Задачи по расписанию', exact: true });
  await scheduleTab.click();
  await expect(scheduleTab).toHaveAttribute('aria-pressed', 'true');
  await expect(scheduleTab).toHaveCSS('background-color', 'rgb(47, 47, 47)');
  await expect(page.getByRole('button', { name: 'Ежедневно', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    page.getByRole('button', { name: 'Выбрать модель для расписания', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: `/tmp/ai-chat-style-russian-${info.project.name}.png` });
});

test('a document citation opens its owned document editor', async ({ context, page }) => {
  await seed(context);
  const docId = randomUUID();
  await fixture(page, 'A project-document claim [S1].', 'en', [
    {
      citation_id: 'S1',
      kind: 'file',
      title: 'Synthetic source document',
      document_id: docId,
      section: 'Version 1, characters 8001–9021',
      excerpt: 'IMPORTANT_FINAL_CLAUSE',
      retrieved_at: time,
    },
  ]);
  await workspaceFixture(page);
  await page.route(`http://localhost:3001/v1/documents/${docId}`, (route) =>
    route.fulfill({
      json: {
        data: {
          id: docId,
          title: 'Synthetic source document',
          content: 'Original source text',
          project_id: null,
          version: 1,
          created_at: time,
          updated_at: time,
        },
      },
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Choose model', exact: true }).click();
  await page.getByRole('button', { name: /Synthetic Model Tools supported/ }).click();
  await page.getByLabel('Message', { exact: true }).fill('Read the source document');
  await page.getByRole('button', { name: 'Send ↑', exact: true }).click();
  await page.getByRole('button', { name: 'Show evidence [S1]', exact: true }).click();
  await expect(page.getByText('IMPORTANT_FINAL_CLAUSE', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open original source', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Document title', exact: true })).toHaveValue(
    'Synthetic source document',
  );
});

test('sidebar row menu opens beside the list, tools dialog uses clean rows, and thinking skeleton + transient tool pills behave properly', async ({
  context,
  page,
}, info) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await seed(context);
  await fixture(page);
  const chatTwoId = '20000000-0000-4000-8000-000000000099';
  let streamDelayResolve!: () => void;
  const streamPending = new Promise<void>((resolve) => {
    streamDelayResolve = resolve;
  });
  let toolCompleted = false;
  const conversations = [
    {
      id: chatId,
      title: 'First synthetic chat',
      model_id: 'synthetic/model',
      enabled_tools: ['web', 'files'],
      version: 1,
      created_at: time,
      updated_at: new Date().toISOString(),
    },
    {
      id: chatTwoId,
      title: 'Second synthetic chat',
      model_id: 'synthetic/model',
      enabled_tools: ['files'],
      version: 1,
      created_at: time,
      updated_at: new Date().toISOString(),
    },
  ];
  await page.route('http://localhost:3001/v1/conversations**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (req.method() === 'GET' && u.pathname === '/v1/conversations') {
      return route.fulfill({
        json: { data: conversations, next_cursor: null },
        headers: { 'access-control-allow-origin': 'http://localhost:8092' },
      });
    }
    if (req.method() === 'GET' && u.pathname === `/v1/conversations/${chatId}`) {
      return route.fulfill({
        json: { data: conversations[0] },
        headers: { 'access-control-allow-origin': 'http://localhost:8092' },
      });
    }
    return route.fallback();
  });
  await page.route(`http://localhost:3001/v1/runs/${runId}/events**`, async (route) => {
    await streamPending;
    toolCompleted = true;
    await route.fallback();
  });
  await page.route(`http://localhost:3001/v1/runs/${runId}`, async (route) => {
    if (!toolCompleted) {
      return route.fulfill({
        json: {
          data: {
            run: {
              id: runId,
              conversation_id: chatId,
              user_message_id: userId,
              assistant_message_id: assistantId,
              status: 'running',
              model_id: 'synthetic/model',
              attempt: 1,
              version: 1,
              last_event_seq: '1',
              error_code: null,
              usage: { input_tokens: null, output_tokens: null, cost_usd: null, cost_status: 'unknown' },
              cancel_requested_at: null,
              created_at: time,
              finished_at: null,
            },
            assistant_message: {
              id: assistantId,
              conversation_id: chatId,
              run_id: runId,
              seq: '2',
              role: 'assistant',
              content: '',
              status: 'pending',
              file_ids: [],
              created_at: time,
            },
            tool_calls: [{ id: 'tc-1', name: 'read_file', status: 'executing', arguments: {} }],
            approvals: [],
            sources: [],
          },
        },
      });
    }
    return route.fulfill({
      json: {
        data: {
          run: {
            id: runId,
            conversation_id: chatId,
            user_message_id: userId,
            assistant_message_id: assistantId,
            status: 'completed',
            model_id: 'synthetic/model',
            attempt: 1,
            version: 2,
            last_event_seq: '3',
            error_code: null,
            usage: { input_tokens: 10, output_tokens: 12, cost_usd: '0.001', cost_status: 'estimated' },
            cancel_requested_at: null,
            created_at: time,
            finished_at: time,
          },
          assistant_message: {
            id: assistantId,
            conversation_id: chatId,
            run_id: runId,
            seq: '2',
            role: 'assistant',
            content: 'Synthetic answer with **Markdown** and a safe result.',
            status: 'complete',
            file_ids: [],
            created_at: time,
          },
          tool_calls: [{ id: 'tc-1', name: 'read_file', status: 'succeeded', arguments: {} }],
          approvals: [],
          sources: [],
        },
      },
    });
  });

  await page.goto('/');
  await expect(
    page.getByTestId('chat-header').getByRole('button', { name: 'Settings', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByTestId('chat-header').getByRole('button', { name: 'Work tools', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByTestId('chat-header').getByRole('button', { name: 'Projects & tasks', exact: true }),
  ).toHaveCount(0);

  if (info.project.name === 'desktop') {
    await page.getByRole('button', { name: "it's kawasaki, bitches", exact: true }).click();
    await expect(page.getByTestId('kawasaki-party')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Library', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Scheduled', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Library', exact: true }).hover({ force: true });
    await expect(page.getByTestId('coming-soon-tooltip')).toHaveText('Coming soon');

    const secondRow = page.getByRole('button', { name: 'Second synthetic chat', exact: true });
    const yBefore = (await secondRow.boundingBox())!.y;
    await page.getByRole('button', { name: 'Actions for First synthetic chat', exact: true }).click();
    const pop = page.getByTestId('popover-menu');
    await expect(pop).toBeVisible();
    const yAfter = (await secondRow.boundingBox())!.y;
    expect(yAfter).toBe(yBefore);
    await page.screenshot({
      path: `/tmp/ai-chat-sidebar-sidemenu-${info.project.name}.png`,
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');

    await page
      .getByRole('button', { name: 'Actions for Second synthetic chat', exact: true })
      .click();
    await page.getByRole('menuitem', { name: 'Pin', exact: true }).click();
    await expect(page.getByText('Pinned', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Pinned', { exact: true })).toBeVisible();
  }

  const msgInput = page.getByLabel('Message', { exact: true });
  await msgInput.fill('Line one\nLine two\nLine three');
  await expect
    .poll(async () => (await msgInput.boundingBox())!.height)
    .toBeGreaterThan(48);
  await msgInput.fill('Read my file');
  await page.getByRole('button', { name: 'Send ↑', exact: true }).click();
  await expect(page.getByTestId('thinking-skeleton-line')).toHaveCount(3);
  await expect(page.getByTestId('tool-activity-pill')).toBeVisible();
  await page.screenshot({
    path: `/tmp/ai-chat-thinking-skeleton-${info.project.name}.png`,
    animations: 'disabled',
  });
  streamDelayResolve();
  await expect(page.getByText(/Synthetic answer with/)).toBeVisible();
  await expect(page.getByTestId('tool-activity-pill')).toHaveCount(0);

  await page.getByRole('button', { name: 'Choose tools', exact: true }).click();
  await expect(page.getByText('Tools & conversation', { exact: true })).toBeVisible();
  await page.screenshot({
    path: `/tmp/ai-chat-tools-dialog-${info.project.name}.png`,
    animations: 'disabled',
  });
});

test('model picker shows Popular section first with Google, OpenAI, and Anthropic Haiku', async ({
  context,
  page,
}) => {
  await seed(context);
  await fixture(page);
  await page.route('http://localhost:3001/v1/models**', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: 'meta/llama-3',
            name: 'Llama 3',
            supports_tools: true,
            supports_images: false,
            supports_image_output: false,
            context_length: 128000,
            input_price_per_million_usd: '0.1',
            output_price_per_million_usd: '0.2',
            supported_parameters: ['tools'],
            catalog_fetched_at: time,
            catalog_stale: false,
          },
          {
            id: 'google/gemini-3.8-flash',
            name: 'Google: Gemini 3.8 Flash',
            supports_tools: true,
            supports_images: true,
            supports_image_output: false,
            context_length: 1048576,
            input_price_per_million_usd: '0.825',
            output_price_per_million_usd: '4.125',
            supported_parameters: ['tools'],
            catalog_fetched_at: time,
            catalog_stale: false,
          },
          {
            id: 'openai/gpt-5.4-mini',
            name: 'OpenAI: GPT-5.4 Mini',
            supports_tools: true,
            supports_images: true,
            supports_image_output: false,
            context_length: 400000,
            input_price_per_million_usd: '0.75',
            output_price_per_million_usd: '4.5',
            supported_parameters: ['tools'],
            catalog_fetched_at: time,
            catalog_stale: false,
          },
          {
            id: 'anthropic/claude-haiku-5.5',
            name: 'Anthropic: Claude Haiku 5.5',
            supports_tools: true,
            supports_images: true,
            supports_image_output: false,
            context_length: 1000000,
            input_price_per_million_usd: '0.1',
            output_price_per_million_usd: '0.5',
            supported_parameters: ['tools'],
            catalog_fetched_at: time,
            catalog_stale: false,
          },
        ],
      },
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Choose model', exact: true }).click();
  await expect(page.getByText('Popular', { exact: true })).toBeVisible();
  await expect(page.getByText('All models', { exact: true })).toBeVisible();
  const popularY = (await page.getByText('Popular', { exact: true }).boundingBox())!.y;
  const haikuY = (await page.getByText('Anthropic: Claude Haiku 5.5', { exact: true }).boundingBox())!
    .y;
  const geminiY = (await page.getByText('Google: Gemini 3.8 Flash', { exact: true }).boundingBox())!
    .y;
  const allY = (await page.getByText('All models', { exact: true }).boundingBox())!.y;
  const llamaY = (await page.getByText('Llama 3', { exact: true }).boundingBox())!.y;
  expect(haikuY).toBeGreaterThan(popularY);
  expect(geminiY).toBeGreaterThan(haikuY);
  expect(allY).toBeGreaterThan(geminiY);
  expect(llamaY).toBeGreaterThan(allY);
});

test('switching chats keeps sidebar mounted and shows chat skeleton while loading', async ({
  context,
  page,
}, info) => {
  await seed(context);
  await fixture(page);
  const slowChatId = '20000000-0000-4000-8000-000000000077';
  let releaseChat!: () => void;
  const chatPending = new Promise<void>((resolve) => {
    releaseChat = resolve;
  });
  await page.route('http://localhost:3001/v1/conversations**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (req.method() === 'GET' && u.pathname === '/v1/conversations') {
      return route.fulfill({
        json: {
          data: [
            {
              id: slowChatId,
              title: 'Delayed chat',
              model_id: 'anthropic/claude-haiku-5.5',
              enabled_tools: ['web', 'files'],
              version: 1,
              created_at: time,
              updated_at: time,
            },
          ],
          next_cursor: null,
        },
        headers: { 'access-control-allow-origin': 'http://localhost:8092' },
      });
    }
    if (req.method() === 'GET' && u.pathname === `/v1/conversations/${slowChatId}`) {
      await chatPending;
      return route.fulfill({
        json: {
          data: {
            id: slowChatId,
            title: 'Delayed chat',
            model_id: 'anthropic/claude-haiku-5.5',
            enabled_tools: ['web', 'files'],
            version: 1,
            created_at: time,
            updated_at: time,
          },
        },
        headers: { 'access-control-allow-origin': 'http://localhost:8092' },
      });
    }
    return route.fallback();
  });
  await page.route(`http://localhost:3001/v1/conversations/${slowChatId}/**`, (route) =>
    route.fulfill({
      json: { data: [], next_cursor: null },
      headers: { 'access-control-allow-origin': 'http://localhost:8092' },
    }),
  );

  await page.goto('/');
  if (info.project.name === 'mobile-web') {
    await page.getByRole('button', { name: 'Open conversation history' }).click();
  }
  await page.getByRole('button', { name: 'Delayed chat', exact: true }).click();
  if (info.project.name === 'desktop') {
    await expect(page.getByTestId('conversation-sidebar')).toBeVisible();
  }
  await expect(page.getByTestId('chat-thread-skeleton')).toBeVisible();
  releaseChat();
  await expect(page.getByTestId('chat-thread-skeleton')).toHaveCount(0);
});
