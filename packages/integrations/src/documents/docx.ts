import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from 'docx';
import type { DocumentBlock } from '@ai-chat/contracts';

export type DocumentModel = { title?: string; blocks: DocumentBlock[] };

const HEADINGS = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
} as const;

function runs(text: string, bold = false): ParagraphChild[] {
  return text.split('\n').map(
    (line, index) => new TextRun({ text: line, bold, break: index ? 1 : undefined }),
  );
}

export async function buildDocx(model: DocumentModel): Promise<Uint8Array> {
  const children: (Paragraph | Table)[] = [];
  if (model.title) {
    children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: runs(model.title) }));
  }
  let listInstance = 0;
  for (const block of model.blocks) {
    if (block.type === 'heading') {
      children.push(
        new Paragraph({ heading: HEADINGS[block.level as 1 | 2 | 3], children: runs(block.text) }),
      );
    } else if (block.type === 'paragraph') {
      children.push(new Paragraph({ spacing: { after: 160 }, children: runs(block.text) }));
    } else if (block.type === 'list') {
      listInstance += 1;
      for (const item of block.items) {
        children.push(
          new Paragraph({
            numbering: {
              reference: block.ordered ? 'numbers' : 'bullets',
              level: 0,
              instance: block.ordered ? listInstance : undefined,
            },
            children: runs(item),
          }),
        );
      }
    } else {
      children.push(buildTable(block.header, block.rows));
      children.push(new Paragraph({ children: [] }));
    }
  }
  const document = new Document({
    creator: 'AI Chat',
    title: model.title,
    numbering: {
      config: [
        {
          reference: 'bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
        {
          reference: 'numbers',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [{ children }],
  });
  return new Uint8Array(await Packer.toBuffer(document));
}

function buildTable(header: string[], rows: string[][]): Table {
  const width = header.length;
  const cell = (text: string, bold: boolean) =>
    new TableCell({
      shading: bold ? { type: ShadingType.CLEAR, color: 'auto', fill: 'E8EEF7' } : undefined,
      children: [new Paragraph({ children: runs(text, bold) })],
    });
  const padded = (row: string[]) => Array.from({ length: width }, (_, i) => row[i] ?? '');
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: padded(header).map((text) => cell(text, true)) }),
      ...rows.map((row) => new TableRow({ children: padded(row).map((text) => cell(text, false)) })),
    ],
  });
}
