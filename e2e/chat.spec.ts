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
        sources: [],
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
  return { submissions };
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
  await expect
    .poll(() =>
      page.getByTestId('composer-frame').evaluate((el) => getComputedStyle(el, '::before').opacity),
    )
    .toBe('1');
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
  await expect(page.getByText('Synthetic Test User', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Manage Gmail & Calendar' }).click();
  await expect(page.getByText('Google Calendar', { exact: true })).toBeVisible();
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
    await expect(sidebar).toHaveCSS('transition-duration', '0.24s');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(sidebar).toHaveCSS('transition-duration', '0s');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(sidebar).toHaveCSS('transition-duration', '0.24s');
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(72);
    const content = page.getByText('What’s on your mind?', { exact: true });
    const contentX = (await content.boundingBox())!.x;
    await sidebar.hover();
    await expect(sidebar.getByLabel('Search conversations', { exact: true })).toBeVisible();
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(280);
    expect((await content.boundingBox())!.x).toBe(contentX);
    await page.mouse.move(700, 300);
    await expect(sidebar.getByLabel('Search conversations', { exact: true })).toHaveCount(0);
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(72);
    await page.getByRole('button', { name: 'Expand conversation sidebar' }).click();
    await page.mouse.move(700, 300);
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(280);
    await page.getByRole('button', { name: 'Collapse conversation sidebar' }).click();
    await page.mouse.move(700, 300);
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(72);
    await sidebar.hover();
    await page.getByRole('button', { name: 'Search conversation history' }).click();
    await expect(sidebar.getByLabel('Search conversations', { exact: true })).toBeFocused();
    await page.mouse.move(700, 300);
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(280);
    await content.click();
    await expect(sidebar.getByLabel('Search conversations', { exact: true })).toHaveCount(0);
    await sidebar.hover();
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
    const box = (await drawer.boundingBox())!;
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    expect(box.width).toBe(320);
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
  await expect(page.getByText('Hello, Synthetic')).toBeVisible();
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

test('tarot loading indicator and composer honor reduced motion', async ({ context, page }) => {
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
  await expect(spinner.getByTestId('tarot-current').locator('svg text').first()).toHaveText('0');
  await expect(spinner.getByTestId('tarot-current').locator('svg text').first()).toHaveText('I', {
    timeout: 7000,
  });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.screenshot({
    path: test.info().outputPath('fool-loader.png'),
    animations: 'disabled',
  });
  release();
  await expect(spinner).toHaveCount(0);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).last().click();
  await page.getByLabel('Message', { exact: true }).focus();
  const frame = page.getByTestId('composer-frame');
  await expect
    .poll(() => frame.evaluate((el) => getComputedStyle(el, '::before').opacity))
    .toBe('1');
  expect(
    await frame.evaluate((el) => parseFloat(getComputedStyle(el, '::before').animationDuration)),
  ).toBeLessThan(0.001);
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
  const format = await table.getByRole('cell', { name: 'Data format', exact: true }).boundingBox();
  const binary = await table
    .getByRole('cell', { name: 'Binary (Protobuf)', exact: true })
    .boundingBox();
  expect(binary!.x).toBeGreaterThan(format!.x);
  expect(binary!.y).toBe(format!.y);
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

test('Russian auto locale and profile override persist while the homepage stays animated', async ({
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
  await expect(page.getByText('О чём хотите поговорить?', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Сообщение', { exact: true })).toHaveAttribute(
    'placeholder',
    'Спросите AI Chat',
  );
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.getByTestId('tarot-background')).toBeVisible();
  // The frame is illuminated even before the textarea receives focus.
  await expect
    .poll(() =>
      page
        .getByTestId('composer-frame')
        .evaluate((el) => Number(getComputedStyle(el, '::before').opacity)),
    )
    .toBeGreaterThan(0.5);
  await page.getByRole('button', { name: 'Настройки', exact: true }).last().click();
  await expect(page.getByText('Регион', { exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'English', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'English', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByText('Settings', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'English', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('radio', { name: 'Automatic', exact: true }).click();
  await expect(page.getByText('Настройки', { exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'Back to conversations', exact: true }).click();
  await expect(page.getByText('What’s on your mind?', { exact: true })).toBeVisible();
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.screenshot({ path: test.info().outputPath('tarot-home.png'), animations: 'disabled' });
});
