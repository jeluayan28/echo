/**
 * Server-state cache.
 *
 * Holds what the API last told us; nothing in here is the source of truth. Only `api-repository.ts` writes to
 * it (always with data the server just returned), and `hooks.ts` reads from it. It starts empty, is replaced
 * wholesale by a sync, and is wiped on sign-out so one account's data can never show up in another's session.
 *
 * Not persisted: a cold start fetches again. (Rediscovery snooze/dismiss choices are the one thing that exists
 * only here — the API has no endpoint for them yet.)
 */
import type {
  Collection,
  Link,
  Memory,
  Profile,
  RediscoveryState,
  Reminder,
  TagCount,
} from './types';

export type State = {
  profile: Profile;
  memories: Memory[];
  collections: Collection[];
  links: Link[];
  tags: TagCount[];
  /** memoryId → the user's dismiss / snooze decisions for Rediscovery (device-local). */
  rediscovery: Record<string, RediscoveryState>;
  /** memoryId → its reminder. */
  reminders: Record<string, Reminder>;
};

const initialState = (): State => ({
  profile: { name: '' },
  memories: [],
  collections: [],
  links: [],
  tags: [],
  rediscovery: {},
  reminders: {},
});

let state: State = initialState();
/** Bumped by every reset. A response that arrives after a sign-out carries an old epoch and is dropped. */
let epoch = 0;
const listeners = new Set<() => void>();

function setState(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

/** Recompute every memory's `linkedIds` from the link list, so the two can never disagree. */
export function withLinkedIds(memories: Memory[], links: Link[]): Memory[] {
  const byMemory = new Map<string, string[]>();
  const add = (a: string, b: string) => {
    const list = byMemory.get(a);
    if (list) list.push(b);
    else byMemory.set(a, [b]);
  };
  for (const l of links) {
    add(l.fromId, l.toId);
    add(l.toId, l.fromId);
  }
  return memories.map((m) => {
    const linkedIds = byMemory.get(m.id) ?? [];
    const same = m.linkedIds.length === linkedIds.length && m.linkedIds.every((id, i) => id === linkedIds[i]);
    return same ? m : { ...m, linkedIds };
  });
}

/**
 * Merge a freshly fetched memory into what we already hold. A list row only carries an excerpt, so it must
 * never overwrite a full body we loaded earlier — unless the server says the memory changed since.
 */
export function mergeMemory(existing: Memory | undefined, incoming: Memory): Memory {
  if (!incoming.partial || !existing || existing.partial) return incoming;
  if (existing.updatedAt !== incoming.updatedAt) return incoming;
  return { ...incoming, body: existing.body, partial: undefined };
}

export const store = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getState: () => state,
  epoch: () => epoch,

  /** Forget everything (sign-out, session expiry, tests). */
  reset(next?: Partial<State>) {
    epoch += 1;
    setState({ ...initialState(), ...next });
  },

  /** Replace the whole cache with a complete sync result. */
  replaceAll(data: {
    profile?: Profile;
    memories: Memory[];
    collections: Collection[];
    links: Link[];
    tags: TagCount[];
    reminders: Reminder[];
  }) {
    const byId = new Map(state.memories.map((m) => [m.id, m]));
    // Paging a list that changes underneath us can return the same row twice; keep one.
    const unique = [...new Map(data.memories.map((m) => [m.id, m])).values()];
    const memories = unique.map((m) => mergeMemory(byId.get(m.id), m));
    const alive = new Set(memories.map((m) => m.id));
    const remindersById: Record<string, Reminder> = {};
    for (const r of data.reminders) if (alive.has(r.memoryId)) remindersById[r.memoryId] = r;
    // Dismiss / snooze choices for memories that no longer exist are dropped with them.
    const rediscovery = Object.fromEntries(Object.entries(state.rediscovery).filter(([id]) => alive.has(id)));
    setState({
      profile: data.profile ?? state.profile,
      memories: withLinkedIds(memories, [...new Map(data.links.map((l) => [l.id, l])).values()]),
      collections: [...new Map(data.collections.map((c) => [c.id, c])).values()],
      links: [...new Map(data.links.map((l) => [l.id, l])).values()],
      tags: data.tags,
      reminders: remindersById,
      rediscovery,
    });
  },

  setProfile(profile: Profile) {
    setState({ ...state, profile });
  },

  setTags(tags: TagCount[]) {
    setState({ ...state, tags });
  },

  setLinks(links: Link[]) {
    setState({ ...state, links, memories: withLinkedIds(state.memories, links) });
  },

  // ── memories ──────────────────────────────────────────────────────────────
  upsertMemory(memory: Memory) {
    const index = state.memories.findIndex((m) => m.id === memory.id);
    const merged = mergeMemory(state.memories[index], memory);
    const memories =
      index === -1 ? [merged, ...state.memories] : state.memories.map((m, i) => (i === index ? merged : m));
    setState({ ...state, memories: withLinkedIds(memories, state.links) });
  },

  /** Remove a memory and everything that hangs off it. */
  removeMemory(id: string) {
    const links = state.links.filter((l) => l.fromId !== id && l.toId !== id);
    const { [id]: _state, ...rediscovery } = state.rediscovery;
    const { [id]: _reminder, ...reminders } = state.reminders;
    setState({
      ...state,
      links,
      rediscovery,
      reminders,
      memories: withLinkedIds(
        state.memories.filter((m) => m.id !== id),
        links,
      ),
    });
  },

  // ── links ─────────────────────────────────────────────────────────────────
  addLink(link: Link) {
    const exists = state.links.some(
      (l) =>
        (l.fromId === link.fromId && l.toId === link.toId) || (l.fromId === link.toId && l.toId === link.fromId),
    );
    if (exists || link.fromId === link.toId) return;
    store.setLinks([...state.links, link]);
  },

  removeLink(aId: string, bId: string) {
    store.setLinks(
      state.links.filter((l) => !((l.fromId === aId && l.toId === bId) || (l.fromId === bId && l.toId === aId))),
    );
  },

  // ── rediscovery (device-local) ────────────────────────────────────────────
  dismissRediscovery(id: string, at: string = new Date().toISOString()) {
    const current = state.rediscovery[id] ?? {};
    setState({ ...state, rediscovery: { ...state.rediscovery, [id]: { ...current, dismissedAt: at } } });
  },

  snoozeRediscovery(id: string, until: string) {
    const current = state.rediscovery[id] ?? {};
    setState({ ...state, rediscovery: { ...state.rediscovery, [id]: { ...current, snoozedUntil: until } } });
  },

  // ── reminders ─────────────────────────────────────────────────────────────
  setReminder(reminder: Reminder) {
    setState({ ...state, reminders: { ...state.reminders, [reminder.memoryId]: reminder } });
  },

  clearReminder(memoryId: string) {
    if (!(memoryId in state.reminders)) return;
    const { [memoryId]: _removed, ...reminders } = state.reminders;
    setState({ ...state, reminders });
  },

  // ── collections ───────────────────────────────────────────────────────────
  upsertCollection(collection: Collection) {
    const exists = state.collections.some((c) => c.id === collection.id);
    const collections = exists
      ? state.collections.map((c) => (c.id === collection.id ? collection : c))
      : [...state.collections, collection];
    setState({ ...state, collections: collections.sort((a, b) => a.name.localeCompare(b.name)) });
  },

  /** Deleting a collection never deletes its memories — they become uncollected. */
  removeCollection(id: string) {
    setState({
      ...state,
      collections: state.collections.filter((c) => c.id !== id),
      memories: state.memories.map((m) => (m.collectionId === id ? { ...m, collectionId: undefined } : m)),
    });
  },
};
