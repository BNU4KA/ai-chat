import { expect, it } from 'vitest';
import { transferDraft, consumeDraft, clearDraftTransfer } from './draft-transfer';
it('hands private drafts to the intended account/route once and clears them on sign-out', () => {
  transferDraft('a', 'chat', 'Private text');
  expect(consumeDraft('b', 'chat')).toBeNull();
  expect(consumeDraft('a', 'other')).toBeNull();
  expect(consumeDraft('a', 'chat')).toBe('Private text');
  expect(consumeDraft('a', 'chat')).toBeNull();
  transferDraft('a', 'home', 'Private document');
  clearDraftTransfer();
  expect(consumeDraft('a', 'home')).toBeNull();
});
