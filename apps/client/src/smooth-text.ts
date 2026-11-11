export function revealStep(current: number, goal: number) {
  if (current >= goal) return goal;
  const gap = goal - current;
  return current + (gap > 36 ? Math.ceil(gap / 6) : Math.min(2, gap));
}
