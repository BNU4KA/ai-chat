import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { DocumentModel } from './docx.ts';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const BORDER = rgb(0.6, 0.64, 0.7);
const HEADER_FILL = rgb(0.91, 0.93, 0.97);

const fontDirectory = dirname(
  createRequire(import.meta.url).resolve('dejavu-fonts-ttf/package.json'),
);
const fontFile = (name: string) => readFileSync(join(fontDirectory, 'ttf', name));

export async function buildPdf(model: DocumentModel): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fontFile('DejaVuSans.ttf'), { subset: true });
  const bold = await doc.embedFont(fontFile('DejaVuSans-Bold.ttf'), { subset: true });
  const layout = new Layout(doc, regular, bold);
  if (model.title) layout.heading(model.title, 22, 16);
  for (const block of model.blocks) {
    if (block.type === 'heading') {
      layout.heading(block.text, block.level === 1 ? 18 : block.level === 2 ? 15 : 13, 8);
    } else if (block.type === 'paragraph') {
      layout.paragraph(block.text, 11, 0, 8);
    } else if (block.type === 'list') {
      block.items.forEach((item, index) => {
        const marker = block.ordered ? `${index + 1}.` : '•';
        layout.paragraph(item, 11, 16, 3, marker);
      });
      layout.gap(6);
    } else {
      layout.table(block.header, block.rows);
    }
  }
  doc.setTitle(model.title ?? 'Document');
  doc.setAuthor('AI Chat');
  doc.setCreator('AI Chat');
  doc.setProducer('AI Chat');
  return new Uint8Array(await doc.save());
}

class Layout {
  private readonly doc: PDFDocument;
  private readonly regular: PDFFont;
  private readonly bold: PDFFont;
  private page: PDFPage;
  private y: number;

  constructor(doc: PDFDocument, regular: PDFFont, bold: PDFFont) {
    this.doc = doc;
    this.regular = regular;
    this.bold = bold;
    this.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  heading(text: string, size: number, after: number) {
    this.lines(text, this.bold, size, 0, size * 1.35, CONTENT_WIDTH);
    this.gap(after);
  }

  paragraph(text: string, size: number, indent: number, after: number, marker?: string) {
    this.lines(text, this.regular, size, indent, size * 1.4, CONTENT_WIDTH - indent, marker);
    this.gap(after);
  }

  gap(amount: number) {
    this.y -= amount;
  }

  table(header: string[], rows: string[][]) {
    const columns = header.length;
    const width = CONTENT_WIDTH / columns;
    const padding = 4;
    const size = 9.5;
    const lineHeight = 12;
    const drawRow = (cells: string[], isHeader: boolean) => {
      const wrapped = cells.map((text) =>
        wrap(text, isHeader ? this.bold : this.regular, size, width - 2 * padding),
      );
      const height = Math.max(1, ...wrapped.map((lines) => lines.length)) * lineHeight + 2 * padding;
      if (this.y - height < MARGIN) {
        this.newPage();
        if (!isHeader) drawRow(header, true);
      }
      cells.forEach((_, index) => {
        const x = MARGIN + index * width;
        this.page.drawRectangle({
          x,
          y: this.y - height,
          width,
          height,
          borderColor: BORDER,
          borderWidth: 0.6,
          color: isHeader ? HEADER_FILL : undefined,
        });
        wrapped[index]!.forEach((line, lineIndex) => {
          this.page.drawText(line, {
            x: x + padding,
            y: this.y - padding - size - lineIndex * lineHeight,
            size,
            font: isHeader ? this.bold : this.regular,
          });
        });
      });
      this.y -= height;
    };
    drawRow(header, true);
    for (const row of rows) {
      drawRow(
        Array.from({ length: columns }, (_, index) => row[index] ?? ''),
        false,
      );
    }
    this.gap(10);
  }

  private lines(
    text: string,
    font: PDFFont,
    size: number,
    indent: number,
    lineHeight: number,
    width: number,
    marker?: string,
  ) {
    const wrapped = wrap(text, font, size, width);
    wrapped.forEach((line, index) => {
      this.ensure(lineHeight);
      if (marker && index === 0) {
        this.page.drawText(marker, {
          x: MARGIN + indent - 14,
          y: this.y - size,
          size,
          font: this.regular,
        });
      }
      if (line) this.page.drawText(line, { x: MARGIN + indent, y: this.y - size, size, font });
      this.y -= lineHeight;
    });
  }

  private ensure(height: number) {
    if (this.y - height < MARGIN) this.newPage();
  }

  private newPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const measure = (value: string) => font.widthOfTextAtSize(value, size);
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    let line = '';
    for (const word of raw.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= width) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      line = '';
      for (const char of word) {
        if (line && measure(line + char) > width) {
          out.push(line);
          line = char;
        } else {
          line += char;
        }
      }
    }
    out.push(line);
  }
  return out;
}
