import { expect, it } from 'vitest';
import { storageObjectName } from './files.ts';

it('keeps storage keys ASCII so Supabase accepts them', () => {
  expect(storageObjectName('Synthetic_report.docx', 'document.docx')).toBe('Synthetic_report.docx');
  expect(storageObjectName('Луффи___будущий_король.docx', 'document.docx')).toBe('document.docx');
  expect(storageObjectName('Report_Отчёт.pdf', 'document.pdf')).toBe('Report.pdf');
  expect(storageObjectName('___.docx', 'document.docx')).toBe('document.docx');
});
