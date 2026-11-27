const memory = new Map<string, string>();

function bagKey(owner: string) {
  return `composer-drafts:${owner}`;
}

function slotKey(owner: string, slot: string) {
  return `${owner}:${slot}`;
}

function storage(): Storage | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage;
}

function readBag(owner: string): Record<string, string> {
  const store = storage();
  if (!store) return {};
  try {
    const parsed = JSON.parse(store.getItem(bagKey(owner)) ?? '{}') as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  } catch {
    return {};
  }
}

function writeBag(owner: string, bag: Record<string, string>) {
  const store = storage();
  if (!store) return;
  try {
    if (Object.keys(bag).length === 0) store.removeItem(bagKey(owner));
    else store.setItem(bagKey(owner), JSON.stringify(bag));
  } catch {
    return;
  }
}

export function readComposerDraft(owner: string, slot: string): string {
  if (!storage()) return memory.get(slotKey(owner, slot)) ?? '';
  return readBag(owner)[slot] ?? '';
}

export function writeComposerDraft(owner: string, slot: string, text: string) {
  const id = slotKey(owner, slot);
  if (text) memory.set(id, text);
  else memory.delete(id);
  const bag = readBag(owner);
  if (text) bag[slot] = text;
  else delete bag[slot];
  writeBag(owner, bag);
}

export function clearComposerDrafts(owner?: string) {
  if (!owner) {
    memory.clear();
    return;
  }
  for (const key of memory.keys()) {
    if (key.startsWith(`${owner}:`)) memory.delete(key);
  }
  writeBag(owner, {});
}
