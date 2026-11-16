import { describe, expect, it } from 'vitest';
import type { DocumentBlock } from '@ai-chat/contracts';
import { blocksToMarkdown, markdownToBlocks } from './draft-markdown';

describe('draft markdown', () => {
  it('parses headings, paragraphs, lists and tables', () => {
    const markdown = [
      '# Title',
      '',
      'First line',
      'second line',
      '',
      '## Steps',
      '- one',
      '- two',
      '',
      '- three',
      '',
      '1. first',
      '2. second',
      '',
      '| Item | Value |',
      '| --- | --- |',
      '| a | 1 |',
      '| b |',
    ].join('\n');
    expect(markdownToBlocks(markdown)).toEqual([
      { type: 'heading', level: 1, text: 'Title' },
      { type: 'paragraph', text: 'First line\nsecond line' },
      { type: 'heading', level: 2, text: 'Steps' },
      { type: 'list', ordered: false, items: ['one', 'two', 'three'] },
      { type: 'list', ordered: true, items: ['first', 'second'] },
      { type: 'table', header: ['Item', 'Value'], rows: [['a', '1'], ['b', '']] },
    ]);
  });

  it('keeps dashes and emphasis as paragraph text', () => {
    expect(markdownToBlocks('---\n*soft* text')).toEqual([
      { type: 'paragraph', text: '---\n*soft* text' },
    ]);
  });

  it('round-trips blocks through markdown', () => {
    const blocks: DocumentBlock[] = [
      { type: 'heading', level: 3, text: 'Notes' },
      { type: 'paragraph', text: 'Line one\nLine two' },
      { type: 'list', ordered: true, items: ['a', '', 'c'] },
      { type: 'table', header: ['Name', 'A|B'], rows: [['x', 'y']] },
    ];
    expect(markdownToBlocks(blocksToMarkdown(blocks))).toEqual(blocks);
  });

  it('returns no blocks for blank input', () => {
    expect(markdownToBlocks('  \n\n')).toEqual([]);
  });
});
