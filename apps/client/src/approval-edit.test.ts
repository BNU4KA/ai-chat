import { expect, it } from 'vitest';
import { approvalFields, revisedArguments } from '@ai-chat/contracts';
it('keeps partial calendar changes partial and preserves untouched invitation fields', () => {
  const args = {
    event_id: 'event',
    expected_etag: 'etag',
    title: 'Proposed title',
    timezone: 'UTC',
  };
  const initial = approvalFields('update_calendar_event', args, {
    start: '2026-11-12T09:00:00Z',
    end: '2026-11-12T10:00:00Z',
    attendees: [{ address: 'synthetic@example.com' }],
    description: 'Keep me',
  });
  expect(revisedArguments(args, initial, { ...initial, title: 'Edited title' })).toEqual({
    ...args,
    title: 'Edited title',
  });
  expect(revisedArguments(args, initial, initial)).toEqual(args);
});
it('changes optional recipients only when explicitly edited and retains unedited display names', () => {
  const args = {
    to: [{ address: 'synthetic@example.com', name: 'Synthetic Person' }],
    subject: 'Subject',
    body_text: 'Body',
  };
  const initial = approvalFields('send_mail', args);
  expect(revisedArguments(args, initial, { ...initial, subject: 'Changed' })).toEqual({
    ...args,
    subject: 'Changed',
  });
  expect(revisedArguments(args, initial, { ...initial, cc: 'second@example.com' })).toEqual({
    ...args,
    cc: [{ address: 'second@example.com' }],
  });
  const original = { ...args, cc: [{ address: 'second@example.com' }] };
  const existing = approvalFields('send_mail', original);
  expect(revisedArguments(original, existing, { ...existing, cc: '' })).toEqual({
    ...original,
    cc: [],
  });
});
