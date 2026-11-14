import { expect, it } from 'vitest';
import { EMPTY_SHAPE, composerShape, sameShape } from './composer-shape';

it('changes shape only when a composer flag flips, not per keystroke', () => {
  expect(composerShape('', 24)).toEqual(EMPTY_SHAPE);
  expect(composerShape('   ', 24).hasText).toBe(false);
  expect(sameShape(composerShape('h', 24), composerShape('hello there', 24))).toBe(true);
  expect(composerShape('a\nb', 24).multiline).toBe(true);
  expect(composerShape('long', 48)).toEqual({ hasText: true, multiline: true, tall: false });
  expect(composerShape('long', 140).tall).toBe(true);
});
