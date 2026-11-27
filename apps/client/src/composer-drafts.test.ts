import { afterEach, expect, it } from 'vitest';
import { clearComposerDrafts, readComposerDraft, writeComposerDraft } from './composer-drafts';

const store = new Map<string, string>();

afterEach(() => {
  store.clear();
  clearComposerDrafts();
  delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
});

function installSession() {
  (globalThis as { sessionStorage?: Storage }).sessionStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  } as Storage;
}

it('keeps each chat draft for the browser session and drops it when empty', () => {
  installSession();
  writeComposerDraft('owner', 'home', 'Hello');
  writeComposerDraft('owner', 'chat-1', 'From the other chat');
  expect(readComposerDraft('owner', 'home')).toBe('Hello');
  expect(readComposerDraft('owner', 'chat-1')).toBe('From the other chat');
  expect(readComposerDraft('other', 'home')).toBe('');
  writeComposerDraft('owner', 'home', '');
  expect(readComposerDraft('owner', 'home')).toBe('');
  expect(readComposerDraft('owner', 'chat-1')).toBe('From the other chat');
  clearComposerDrafts('owner');
  expect(readComposerDraft('owner', 'chat-1')).toBe('');
});

it('keeps drafts in memory when session storage is unavailable', () => {
  writeComposerDraft('owner', 'home', 'Native');
  expect(readComposerDraft('owner', 'home')).toBe('Native');
  clearComposerDrafts('owner');
  expect(readComposerDraft('owner', 'home')).toBe('');
});
