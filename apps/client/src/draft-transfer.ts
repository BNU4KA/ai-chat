// Account-bound, one-use handoff. Private document/message text never enters navigation URLs.
let pending: { owner: string; target: string; text: string } | null = null;
export function transferDraft(owner: string, target: string, text: string) {
  pending = { owner, target, text };
}
export function consumeDraft(owner: string, target: string): string | null {
  if (!pending || pending.owner !== owner || pending.target !== target) return null;
  const text = pending.text;
  pending = null;
  return text;
}
export function clearDraftTransfer() {
  pending = null;
}
