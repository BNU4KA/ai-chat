import { strFromU8, unzipSync } from 'fflate';
import { LIMITS, type DocumentBlock } from '@ai-chat/contracts';

export type DocxStructure = {
  blocks: DocumentBlock[];
  unsupported: string[];
};

type Element = { name: string; attrs: Record<string, string>; children: (Element | string)[] };

const MAX_XML_BYTES = 8 * 1024 * 1024;
const MAX_BLOCKS = 300;
const MAX_COLUMNS = 10;
const MAX_ROWS = 200;
const LIMIT_PARAGRAPH = 4000;
const LIMIT_HEADING = 300;
const LIMIT_ITEM = 1000;
const LIMIT_CELL = 300;

export function readDocxStructureBytes(bytes: Uint8Array): DocxStructure {
  let total = 0;
  const files = unzipSync(bytes, {
    filter: (file) => {
      total += file.originalSize;
      if (total > LIMITS.decompressionBytes) throw new Error('EXTRACTED_CONTENT_TOO_LARGE');
      return file.name === 'word/document.xml' || file.name === 'word/numbering.xml';
    },
  });
  if (!files['word/document.xml']) throw new Error('FILE_TYPE_MISMATCH');
  if (files['word/document.xml'].length > MAX_XML_BYTES) {
    throw new Error('EXTRACTED_CONTENT_TOO_LARGE');
  }
  const document = strFromU8(files['word/document.xml']);
  const numbering = files['word/numbering.xml'] ? strFromU8(files['word/numbering.xml']) : '';
  return readDocxStructure(document, numbering);
}

export function readDocxStructure(documentXml: string, numberingXml = ''): DocxStructure {
  if (/<!DOCTYPE|<!ENTITY/i.test(documentXml)) throw new Error('UNSUPPORTED_FILE');
  const root = parseXml(documentXml);
  const body = find(root, 'w:body');
  if (!body) throw new Error('FILE_TYPE_MISMATCH');
  const ordered = orderedLists(numberingXml);
  const unsupported = new Set<string>();
  countUnsupported(root, unsupported);
  const blocks: DocumentBlock[] = [];
  const push = (block: DocumentBlock) => {
    if (blocks.length >= MAX_BLOCKS) unsupported.add('document length');
    else blocks.push(block);
  };
  let items: string[] = [];
  let itemsOrdered = false;
  const flush = () => {
    if (items.length) push({ type: 'list', ordered: itemsOrdered, items });
    items = [];
  };
  for (const node of bodyNodes(body)) {
    if (node.name === 'w:tbl') {
      flush();
      const table = tableBlock(node, unsupported);
      if (table) push(table);
      continue;
    }
    const pPr = find(node, 'w:pPr');
    const text = clip(paragraphText(node), LIMIT_PARAGRAPH, unsupported).trim();
    const numPr = pPr ? find(pPr, 'w:numPr') : undefined;
    if (numPr) {
      if (!text) continue;
      const numId = attr(find(numPr, 'w:numId'), 'w:val') ?? '';
      const isOrdered = ordered.get(numId) ?? false;
      if (items.length && isOrdered !== itemsOrdered) flush();
      itemsOrdered = isOrdered;
      items.push(clip(text, LIMIT_ITEM, unsupported));
      continue;
    }
    flush();
    if (!text) continue;
    const style = attr(pPr ? find(pPr, 'w:pStyle') : undefined, 'w:val') ?? '';
    const heading = /^heading\s*(\d)$/i.exec(style);
    if (heading || /^title$/i.test(style)) {
      const level = heading ? Math.min(3, Number(heading[1])) : 1;
      push({ type: 'heading', level, text: clip(text, LIMIT_HEADING, unsupported) });
    } else {
      push({ type: 'paragraph', text });
    }
  }
  flush();
  return { blocks, unsupported: [...unsupported].sort() };
}

function bodyNodes(parent: Element): Element[] {
  const out: Element[] = [];
  for (const child of parent.children) {
    if (typeof child === 'string') continue;
    if (child.name === 'w:sdt') {
      const content = children(child, 'w:sdtContent')[0];
      if (content) out.push(...bodyNodes(content));
    } else if (child.name === 'w:p' || child.name === 'w:tbl') {
      out.push(child);
    }
  }
  return out;
}

function tableBlock(table: Element, unsupported: Set<string>): DocumentBlock | null {
  const rows = children(table, 'w:tr').map((row) =>
    children(row, 'w:tc').map((cell) =>
      clip(
        children(cell, 'w:p')
          .map((paragraph) => paragraphText(paragraph).trim())
          .filter(Boolean)
          .join('\n'),
        LIMIT_CELL,
        unsupported,
      ),
    ),
  );
  if (!rows.length) return null;
  let columns = Math.max(...rows.map((row) => row.length));
  if (columns > MAX_COLUMNS) {
    unsupported.add('wide tables');
    columns = MAX_COLUMNS;
  }
  let body = rows.map((row) => Array.from({ length: columns }, (_, index) => row[index] ?? ''));
  if (body.length > MAX_ROWS + 1) {
    unsupported.add('long tables');
    body = body.slice(0, MAX_ROWS + 1);
  }
  const [header, ...rest] = body;
  if (!header) return null;
  return { type: 'table', header, rows: rest };
}

function paragraphText(paragraph: Element): string {
  let out = '';
  const walk = (node: Element | string) => {
    if (typeof node === 'string') return;
    if (node.name === 'w:pPr' || node.name === 'w:rPr') return;
    if (node.name === 'w:txbxContent' || node.name === 'w:instrText' || node.name === 'w:delText') {
      return;
    }
    if (node.name === 'w:t') out += node.children.filter((c) => typeof c === 'string').join('');
    else if (node.name === 'w:tab') out += '\t';
    else if (node.name === 'w:br' || node.name === 'w:cr') out += '\n';
    else node.children.forEach(walk);
  };
  walk(paragraph);
  return out;
}

function orderedLists(numberingXml: string): Map<string, boolean> {
  const result = new Map<string, boolean>();
  if (!numberingXml) return result;
  const numbering = find(parseXml(numberingXml), 'w:numbering');
  if (!numbering) return result;
  const formats = new Map<string, boolean>();
  for (const abstract of children(numbering, 'w:abstractNum')) {
    const level = children(abstract, 'w:lvl').find((lvl) => attr(lvl, 'w:ilvl') === '0');
    const format = attr(level ? find(level, 'w:numFmt') : undefined, 'w:val') ?? 'bullet';
    formats.set(attr(abstract, 'w:abstractNumId') ?? '', format !== 'bullet' && format !== 'none');
  }
  for (const num of children(numbering, 'w:num')) {
    const abstractId = attr(find(num, 'w:abstractNumId'), 'w:val') ?? '';
    result.set(attr(num, 'w:numId') ?? '', formats.get(abstractId) ?? false);
  }
  return result;
}

function countUnsupported(node: Element, unsupported: Set<string>) {
  if (node.name === 'w:drawing' || node.name === 'w:pict' || node.name === 'w:object') {
    unsupported.add('embedded images or objects');
  }
  if (node.name === 'w:txbxContent') unsupported.add('text boxes');
  for (const child of node.children) {
    if (typeof child !== 'string') countUnsupported(child, unsupported);
  }
}

function clip(value: string, limit: number, unsupported: Set<string>): string {
  if (value.length <= limit) return value;
  unsupported.add('long text');
  return value.slice(0, limit);
}

function children(parent: Element, name: string): Element[] {
  return parent.children.filter(
    (child): child is Element => typeof child !== 'string' && child.name === name,
  );
}

function find(parent: Element | undefined, name: string): Element | undefined {
  if (!parent) return undefined;
  for (const child of parent.children) {
    if (typeof child === 'string') continue;
    if (child.name === name) return child;
    const nested = find(child, name);
    if (nested) return nested;
  }
  return undefined;
}

function attr(element: Element | undefined, name: string): string | undefined {
  return element?.attrs[name];
}

// Minimal WordprocessingML parser: elements, attributes, text and character references.
// DOCTYPE and ENTITY declarations are rejected by the caller before parsing.
function parseXml(xml: string): Element {
  const root: Element = { name: '#root', attrs: {}, children: [] };
  const stack: Element[] = [root];
  const pattern =
    /<[?!][^>]*>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^\s=/>]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml))) {
    const top = stack[stack.length - 1]!;
    if (match[5] !== undefined) {
      top.children.push(decode(match[5]));
    } else if (match[2]) {
      if (match[1] === '/') {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const attrs: Record<string, string> = {};
      for (const pair of match[3]!.matchAll(/([^\s=]+)\s*=\s*"([^"]*)"/g)) {
        attrs[pair[1]!] = decode(pair[2]!);
      }
      const element: Element = { name: match[2], attrs, children: [] };
      top.children.push(element);
      if (!match[4]) stack.push(element);
    }
  }
  return root;
}

function decode(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|quot|apos|amp);/g, (_, entity: string) => {
    if (entity === 'lt') return '<';
    if (entity === 'gt') return '>';
    if (entity === 'quot') return '"';
    if (entity === 'apos') return "'";
    if (entity === 'amp') return '&';
    const code = entity[1] === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}
