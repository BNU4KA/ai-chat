/** Decimal dollars are calculated in billionths, with upward rounding for estimates. */
export function decimalNano(value: string): bigint {
  if (!/^\d+(\.\d{1,9})?$/.test(value)) throw new Error('Invalid decimal amount');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * 1000000000n + BigInt(fraction.padEnd(9, '0'));
}
export function formatNano(value: bigint): string {
  return `${value / 1000000000n}.${String(value % 1000000000n).padStart(9, '0')}`;
}
export function estimateTokens(messages: unknown[]): number {
  // UTF-8 byte count is a deliberately conservative bound, including request structure.
  const text = JSON.stringify(messages, (_key, value) =>
    value && typeof value === 'object' && value.type === 'image_url'
      ? { type: 'image', allowance: 'x'.repeat(16384) }
      : value,
  );
  return new TextEncoder().encode(text).length;
}
export function estimateCost(
  input: number,
  output: number,
  inputPrice: string | null | undefined,
  outputPrice: string | null | undefined,
): string | null {
  if (inputPrice == null || outputPrice == null) return null;
  try {
    return formatNano(
      (BigInt(input) * decimalNano(inputPrice) +
        BigInt(output) * decimalNano(outputPrice) +
        999999n) /
        1000000n,
    );
  } catch {
    return null;
  }
}
export function replaceRange(
  content: string,
  start: number,
  end: number,
  expected: string,
  replacement: string,
): string {
  if (start < 0 || end < start || end > content.length || content.slice(start, end) !== expected)
    throw new Error('Selected text changed');
  return content.slice(0, start) + replacement + content.slice(end);
}
export function localParts(date: Date, timezone: string) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(date);
  const get = (key: string) => p.find((v) => v.type === key)?.value ?? '';
  return {
    day: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
  };
}
/** Allow a skipped weekly DST occurrence; folds still produce one run per local day. */
export function nextScheduleAt(
  after: Date,
  timezone: string,
  time: string,
  weekday: number | null,
): Date {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const start = Math.floor(after.getTime() / 60000) * 60000 + 60000;
  const previous = localParts(after, timezone);
  const completedToday = previous.time >= time;
  for (let t = start; t <= start + 21 * 86400000; t += 60000) {
    const p = formatter.formatToParts(new Date(t));
    const get = (k: string) => p.find((v) => v.type === k)?.value;
    if (
      `${get('hour')}:${get('minute')}` === time &&
      !(completedToday && localParts(new Date(t), timezone).day === previous.day) &&
      (weekday === null ||
        ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')!) === weekday)
    )
      return new Date(t);
  }
  throw new Error('No next occurrence');
}
export function meetingSlots(
  input: {
    time_min: string;
    time_max: string;
    timezone: string;
    duration_minutes: number;
    buffer_minutes: number;
    work_start: number;
    work_end: number;
  },
  busy: { start: string; end: string }[],
): { start: string; end: string }[] {
  const from = Date.parse(input.time_min),
    to = Date.parse(input.time_max);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 31 * 86400000)
    throw new Error('Range must be within 31 days');
  const blocked = busy.map((b) => ({
    start: Date.parse(b.start) - input.buffer_minutes * 60000,
    end: Date.parse(b.end) + input.buffer_minutes * 60000,
  }));
  if (blocked.some((b) => !Number.isFinite(b.start) || !Number.isFinite(b.end) || b.end <= b.start))
    throw new Error('Invalid availability');
  const result: { start: string; end: string }[] = [];
  for (
    let start = Math.ceil(from / 900000) * 900000;
    start + input.duration_minutes * 60000 <= to;
    start += 900000
  ) {
    const end = start + input.duration_minutes * 60000;
    const a = localParts(new Date(start), input.timezone),
      b = localParts(new Date(end - 1), input.timezone);
    const minutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
    if (
      a.weekday === 0 ||
      a.weekday === 6 ||
      a.day !== b.day ||
      minutes(a.time) < input.work_start * 60 ||
      minutes(b.time) >= input.work_end * 60
    )
      continue;
    if (blocked.some((v) => start < v.end && end > v.start)) continue;
    result.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString() });
    if (result.length === 20) break;
  }
  return result;
}
export const workflowPrompts = {
  meeting:
    'Prepare me for my next meeting. Read my primary calendar, find relevant emails and explicitly shared project files. Summarize the purpose, prior decisions, open questions and a suggested agenda. Cite sources and explain missing access. Do not send or change anything unless I ask.',
  research:
    'Research and compare the following options. Establish criteria, provide a comparison table, cite individual factual claims with stored source IDs, distinguish publication and retrieval dates, highlight conflicting evidence and unknowns, and give a reasoned recommendation: ',
  day: 'Prepare my day from my primary calendar and relevant emails. List commitments, preparation needed and open time. Cite sources. Do not modify anything.',
  weekly:
    'Prepare a weekly review from my primary calendar, relevant emails and explicitly shared project files. Summarize completed work supported by evidence, unresolved items and next steps. Do not invent completion or modify anything.',
};

/** Add provider decimal amounts exactly, including scientific notation from JSON numbers. */
export function addDecimal(left: string, right: string): string {
  const parse = (value: string) => {
    const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value);
    if (!match) throw new Error('Invalid provider amount');
    const exponent = Number(match[3] ?? 0),
      fraction = match[2] ?? '';
    if (Math.abs(exponent) > 30 || value.length > 100)
      throw new Error('Provider amount out of range');
    const scale = fraction.length - exponent;
    return {
      value: BigInt(match[1]! + fraction) * (scale < 0 ? 10n ** BigInt(-scale) : 1n),
      scale: Math.max(0, scale),
    };
  };
  const a = parse(left),
    b = parse(right),
    scale = Math.max(a.scale, b.scale);
  const sum = a.value * 10n ** BigInt(scale - a.scale) + b.value * 10n ** BigInt(scale - b.scale);
  if (!scale) return sum.toString();
  const text = sum.toString().padStart(scale + 1, '0');
  return `${text.slice(0, -scale)}.${text.slice(-scale)}`;
}
