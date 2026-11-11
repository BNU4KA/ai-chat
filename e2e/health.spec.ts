import { expect, test } from '@playwright/test';

test('API live health responds', async ({ request }) => {
  test.skip(!process.env.E2E_BASE_URL, 'Set E2E_BASE_URL to the running API');
  const response = await request.get(`${process.env.E2E_BASE_URL}/health/live`);
  expect(response.ok()).toBeTruthy();
  expect(await response.json()).toEqual({ status: 'ok' });
});
