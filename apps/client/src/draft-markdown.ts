import type { DocumentBlock } from '@ai-chat/contracts';

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const BULLET_RE = /^\s*[-*+](?:\s+(.*))?$/;
const ORDERED_RE = /^\s*\d+[.)](?:\s+(.*))?$/;
const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function splitRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/(^|[^\\])\|$/, '$1');
  return inner.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function escapeCell(cell: string): string {
  return cell.replace(/\n+/g, ' ').replace(/\|/g, '\\|');
}

function oneLine(text: string): string {
  return text.replace(/\n+/g, ' ').trim();
}

export function blocksToMarkdown(blocks: DocumentBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === 'heading') return `${'#'.repeat(block.level)} ${oneLine(block.text)}`;
      if (block.type === 'paragraph') return block.text;
      if (block.type === 'list') {
        return block.items
          .map((item, index) => `${block.ordered ? `${index + 1}.` : '-'} ${oneLine(item)}`)
          .join('\n');
      }
      const width = block.header.length;
      const row = (cells: string[]) => `| ${cells.map(escapeCell).join(' | ')} |`;
      return [
        row(block.header),
        `| ${Array.from({ length: width }, () => '---').join(' | ')} |`,
        ...block.rows.map((cells) => row(Array.from({ length: width }, (_, i) => cells[i] ?? ''))),
      ].join('\n');
    })
    .join('\n\n');
}

// Lines separated by a single newline form one paragraph; a blank line ends it.
// A list continues across blank lines while the next item has the same kind.
export function markdownToBlocks(markdown: string): DocumentBlock[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: DocumentBlock[] = [];
  let paragraph: string[] = [];
  let items: string[] = [];
  let ordered = false;

  const endParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
    paragraph = [];
  };
  const endList = () => {
    if (items.length) blocks.push({ type: 'list', ordered, items });
    items = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      endParagraph();
      continue;
    }
    const bullet = BULLET_RE.exec(line);
    const number = bullet ? null : ORDERED_RE.exec(line);
    if (bullet || number) {
      endParagraph();
      const kindOrdered = !bullet;
      if (items.length && ordered !== kindOrdered) endList();
      ordered = kindOrdered;
      items.push((bullet ?? number)?.[1]?.trim() ?? '');
      continue;
    }
    endList();
    const heading = HEADING_RE.exec(line);
    if (heading) {
      endParagraph();
      blocks.push({
        type: 'heading',
        level: Math.min(heading[1].length, 3) as 1 | 2 | 3,
        text: heading[2].trim(),
      });
      continue;
    }
    if (line.trim().startsWith('|') && i + 1 < lines.length && TABLE_SEPARATOR_RE.test(lines[i + 1])) {
      endParagraph();
      const header = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = splitRow(lines[i]);
        rows.push(Array.from({ length: header.length }, (_, column) => cells[column] ?? ''));
        i++;
      }
      i--;
      blocks.push({ type: 'table', header, rows });
      continue;
    }
    paragraph.push(line.trim());
  }
  endParagraph();
  endList();
  return blocks;
}

export type MarkupKind = 'heading' | 'bold' | 'bullet' | 'numbered';

export function applyMarkup(
  text: string,
  start: number,
  end: number,
  kind: MarkupKind,
): { text: string; start: number; end: number } {
  const from = Math.max(0, Math.min(start, end, text.length));
  const to = Math.max(0, Math.min(Math.max(start, end), text.length));
  if (kind === 'bold') {
    const selected = text.slice(from, to) || 'text';
    const next = `${text.slice(0, from)}**${selected}**${text.slice(to)}`;
    return { text: next, start: from + 2, end: from + 2 + selected.length };
  }
  const lineStart = text.lastIndexOf('\n', Math.max(0, from - 1)) + 1;
  const lineBreak = text.indexOf('\n', to);
  const lineEnd = lineBreak === -1 ? text.length : lineBreak;
  const lines = text.slice(lineStart, lineEnd).split('\n');
  const prefixed = lines
    .map((line, index) => {
      if (!line.trim()) {
        if (lines.length > 1) return line;
        if (kind === 'heading') return '# ';
        if (kind === 'bullet') return '- ';
        return '1. ';
      }
      if (kind === 'heading') return line.startsWith('# ') ? line.slice(2) : `# ${line}`;
      if (kind === 'bullet') return line.startsWith('- ') ? line.slice(2) : `- ${line}`;
      return /^\d+\. /.test(line) ? line.replace(/^\d+\. /, '') : `${index + 1}. ${line}`;
    })
    .join('\n');
  return {
    text: text.slice(0, lineStart) + prefixed + text.slice(lineEnd),
    start: lineStart,
    end: lineStart + prefixed.length,
  };
}
