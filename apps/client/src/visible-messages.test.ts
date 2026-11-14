import { expect, it } from 'vitest';
import { collapseAttempts } from './visible-messages';

const m = (id: string, role: string) => ({ id, role });

it('keeps only the latest consecutive assistant attempt', () => {
  expect(
    collapseAttempts([
      m('u1', 'user'),
      m('a1', 'assistant'),
      m('a2', 'assistant'),
      m('u2', 'user'),
      m('a3', 'assistant'),
    ]).map((x) => x.id),
  ).toEqual(['u1', 'a2', 'u2', 'a3']);
  expect(collapseAttempts([m('u1', 'user'), m('u2', 'user')]).map((x) => x.id)).toEqual(['u1', 'u2']);
  expect(collapseAttempts([])).toEqual([]);
});
