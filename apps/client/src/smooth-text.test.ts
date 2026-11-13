import { expect, it } from 'vitest';
import { revealStep, splitStreamTail } from './smooth-text';

it('eases a burst and then advances a couple of characters at a time', () => {
  expect(revealStep(0, 100)).toBe(17);
  expect(revealStep(90, 100)).toBe(92);
  expect(revealStep(40, 40)).toBe(40);
  expect(revealStep(80, 12)).toBe(12);
});

it('isolates the newest word without changing the streamed text', () => {
  expect(splitStreamTail('A smooth response ')).toEqual(['A smooth ', 'response ']);
  expect(splitStreamTail('Привет')).toEqual(['', 'Привет']);
  expect(splitStreamTail('これはとても長い日本語の文章です')).toEqual([
    'これはと',
    'ても長い日本語の文章です',
  ]);
  expect(splitStreamTail('')).toEqual(['', '']);
});
