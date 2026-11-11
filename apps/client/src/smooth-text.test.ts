import { expect, it } from 'vitest';
import { revealStep } from './smooth-text';

it('eases a burst and then advances a couple of characters at a time', () => {
  expect(revealStep(0, 100)).toBe(17);
  expect(revealStep(90, 100)).toBe(92);
  expect(revealStep(40, 40)).toBe(40);
  expect(revealStep(80, 12)).toBe(12);
});
