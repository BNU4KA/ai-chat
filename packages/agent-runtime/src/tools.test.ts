import { ALL_TOOLS } from '@ai-chat/contracts';
import { expect, it } from 'vitest';
import { toolDescriptions, toolSchemas } from './tools.ts';

it('describes every tool and keeps file-tool arguments strict', () => {
  for (const name of ALL_TOOLS) expect(toolDescriptions[name]).toBeTruthy();
  const document = {
    format: 'pdf',
    title: 'Synthetic',
    content: { blocks: [{ type: 'paragraph', text: 'Body' }] },
  };
  expect(toolSchemas.create_document.safeParse(document).success).toBe(true);
  expect(toolSchemas.create_document.safeParse({ ...document, format: 'txt' }).success).toBe(false);
  expect(
    toolSchemas.create_document.safeParse({ ...document, extra: true }).success,
  ).toBe(false);
  expect(
    toolSchemas.create_document.safeParse({ ...document, content: { blocks: [] } }).success,
  ).toBe(false);
  expect(
    toolSchemas.edit_document.safeParse({
      source_file_id: '00000000-0000-4000-8000-000000000001',
      instructions: 'Change the price',
    }).success,
  ).toBe(true);
  expect(
    toolSchemas.edit_document.safeParse({ source_file_id: 'not-a-uuid', instructions: 'x' }).success,
  ).toBe(false);
  expect(
    toolSchemas.edit_image.safeParse({
      source_file_id: '00000000-0000-4000-8000-000000000002',
      prompt: 'Brighten the photo',
    }).success,
  ).toBe(true);
});
