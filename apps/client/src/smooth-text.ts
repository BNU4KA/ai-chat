export function revealStep(current: number, goal: number) {
  if (current >= goal) return goal;
  const gap = goal - current;
  return current + (gap > 36 ? Math.ceil(gap / 6) : Math.min(2, gap));
}

export function splitStreamTail(value: string): [string, string] {
  const tail = value.match(/(\S+\s*)$/u)?.[1] ?? '';
  const points = Array.from(tail);
  const suffix = points.length > 12 ? points.slice(-12).join('') : tail;
  return [value.slice(0, value.length - suffix.length), suffix];
}
