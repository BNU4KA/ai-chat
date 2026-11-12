import { expect, it } from 'vitest';
import {
  addDecimal,
  decimalNano,
  estimateCost,
  estimateTokens,
  formatNano,
  nextScheduleAt,
  meetingSlots,
  replaceRange,
} from './workspace.ts';
import { scheduleInputSchema, rangeEditSchema, conversationPatchSchema } from './schemas.ts';
it('uses exact decimal arithmetic and rounds estimates upward', () => {
  expect(formatNano(decimalNano('0.000000001') + decimalNano('0.1'))).toBe('0.100000001');
  expect(estimateCost(1000, 2000, '0.10', '0.20')).toBe('0.000500000');
  expect(estimateCost(1, 0, '0.001', '0')).toBe('0.000000001');
  expect(estimateCost(1, 1, null, '0')).toBeNull();
  expect(estimateCost(1, 1, 'unknown', '0')).toBeNull();
});
it('estimates Unicode and images conservatively without counting base64 as text', () => {
  expect(estimateTokens([{ content: 'Привет' }])).toBeGreaterThan(6);
  expect(
    estimateTokens([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,' + 'x'.repeat(20000) } },
    ]),
  ).toBeLessThan(20000);
  expect(estimateTokens([{ type: 'image_url' }])).toBeGreaterThan(16000);
});
it('replaces only the verified UTF-16 range', () => {
  expect(replaceRange('A 😀 B', 2, 4, '😀', 'C')).toBe('A C B');
  expect(() => replaceRange('abc', 0, 2, 'xy', 'z')).toThrow('changed');
  expect(() => replaceRange('abc', 0, 4, 'abc', 'z')).toThrow();
  expect(
    rangeEditSchema.safeParse({ start: 3, end: 1, expected: '', replacement: '' }).success,
  ).toBe(false);
});
it('daily local schedules retain wall time across DST and skip nonexistent times', () => {
  expect(
    nextScheduleAt(new Date('2026-03-28T09:00:00Z'), 'Europe/Warsaw', '09:00', null).toISOString(),
  ).toBe('2026-03-29T07:00:00.000Z');
  expect(
    nextScheduleAt(new Date('2026-03-28T10:00:00Z'), 'Europe/Warsaw', '02:30', null).toISOString(),
  ).toBe('2026-03-30T00:30:00.000Z');
});
it('does not run twice during an autumn repeated wall-clock time', () => {
  expect(
    nextScheduleAt(new Date('2026-10-25T00:30:00Z'), 'Europe/Warsaw', '02:30', null).toISOString(),
  ).toBe('2026-10-26T01:30:00.000Z');
  expect(nextScheduleAt(new Date('2026-11-12T09:00:00Z'), 'UTC', '09:00', 1).toISOString()).toBe(
    '2026-11-16T09:00:00.000Z',
  );
});
it('excludes primary busy intervals with buffers and respects local working hours', () => {
  const slots = meetingSlots(
    {
      time_min: '2026-11-12T08:00:00Z',
      time_max: '2026-11-12T12:00:00Z',
      timezone: 'Europe/Warsaw',
      duration_minutes: 30,
      buffer_minutes: 15,
      work_start: 9,
      work_end: 18,
    },
    [{ start: '2026-11-12T09:00:00Z', end: '2026-11-12T10:00:00Z' }],
  );
  expect(slots[0]?.start).toBe('2026-11-12T08:00:00.000Z');
  expect(
    slots.every(
      (s) =>
        Date.parse(s.end) <= Date.parse('2026-11-12T08:45:00Z') ||
        Date.parse(s.start) >= Date.parse('2026-11-12T10:15:00Z'),
    ),
  ).toBe(true);
});
it('fails closed for malformed busy data and oversized date ranges', () => {
  const input = {
    time_min: '2026-11-12T08:00:00Z',
    time_max: '2026-11-12T12:00:00Z',
    timezone: 'UTC',
    duration_minutes: 30,
    buffer_minutes: 0,
    work_start: 9,
    work_end: 18,
  };
  expect(() => meetingSlots(input, [{ start: 'bad', end: 'bad' }])).toThrow();
  expect(() => meetingSlots({ ...input, time_max: '2027-01-01T00:00:00Z' }, [])).toThrow();
  expect(() => nextScheduleAt(new Date(), 'Not/AZone', '09:00', null)).toThrow();
});
it('validates caps and rejects invalid schedules', () => {
  expect(conversationPatchSchema.safeParse({ budget_usd: '0' }).success).toBe(false);
  expect(conversationPatchSchema.safeParse({ budget_usd: '100.000000001' }).success).toBe(false);
  const b = {
    title: 'Daily',
    prompt: 'Plan my day',
    model_id: 'test',
    enabled_tools: [],
    timezone: 'UTC',
    local_time: '09:00',
    budget_usd: '0.1',
  };
  expect(scheduleInputSchema.safeParse(b).success).toBe(true);
  expect(scheduleInputSchema.safeParse({ ...b, local_time: '25:00' }).success).toBe(false);
});

it('adds provider costs without binary floating-point or scientific-notation loss', () => {
  expect(addDecimal('0.1', '0.2')).toBe('0.3');
  expect(addDecimal('1e-7', '0.00000000012345')).toBe('0.00000010012345');
  expect(addDecimal('0', '0')).toBe('0');
  expect(() => addDecimal('NaN', '0')).toThrow();
});

it('skips a missing weekly DST time and searches beyond the following week', () => {
  expect(
    nextScheduleAt(new Date('2026-03-22T01:30:00Z'), 'Europe/Warsaw', '02:30', 0).toISOString(),
  ).toBe('2026-04-05T00:30:00.000Z');
  expect(
    nextScheduleAt(new Date('2027-03-21T01:30:00Z'), 'Europe/Warsaw', '02:30', 0).toISOString(),
  ).toBe('2027-04-04T00:30:00.000Z');
});
