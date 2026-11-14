import { expect, it } from 'vitest';
import {
  ALL_TOOLS,
  isBuiltinTool,
  isWriteTool,
  normalizeDocumentContent,
  toolGroup,
  documentPlainText,
} from './index.ts';

it('drops blank content and refuses a document that is empty after trimming', () => {
  expect(
    normalizeDocumentContent({
      blocks: [
        { type: 'paragraph', text: '   ' },
        { type: 'heading', level: 1, text: '\n' },
        { type: 'list', ordered: false, items: ['  ', ''] },
      ],
    }),
  ).toBeNull();
});

it('trims kept text and keeps only meaningful blocks', () => {
  const content = normalizeDocumentContent({
    blocks: [
      { type: 'paragraph', text: '  Body  ' },
      { type: 'list', ordered: true, items: [' One ', ' '] },
      { type: 'table', header: [' A '], rows: [[' 1 ']] },
    ],
  });
  expect(content?.blocks).toEqual([
    { type: 'paragraph', text: 'Body' },
    { type: 'list', ordered: true, items: ['One'] },
    { type: 'table', header: ['A'], rows: [['1']] },
  ]);
  expect(documentPlainText(content!.blocks)).toContain('Body');
});

it('classifies the three file tools as builtin, non-write, and in the files group', () => {
  for (const name of ['create_document', 'edit_document', 'edit_image'] as const) {
    expect(ALL_TOOLS).toContain(name);
    expect(isBuiltinTool(name)).toBe(true);
    expect(isWriteTool(name)).toBe(false);
    expect(toolGroup(name)).toBe('files');
  }
});
