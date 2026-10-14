/** A tiny in-process stand-in for the Laravel API, installed as `global.fetch`, for repository tests. */
type Json = Record<string, any>;

export type FakeServer = ReturnType<typeof installFakeServer>;

export function installFakeServer() {
  const db = {
    memories: [] as Json[],
    trash: [] as Json[],
    links: [] as Json[],
    collections: [] as Json[],
    reminders: {} as Record<string, Json>,
    seq: 0,
  };
  const calls: { method: string; path: string; body?: Json; auth?: string }[] = [];
  let failNext: { status: number; body?: Json } | 'network' | null = null;
  let delayMs = 0;

  const id = (p: string) => `${p}${(++db.seq).toString().padStart(4, '0')}`;
  const now = () => new Date(Date.UTC(2026, 0, 1) + db.seq * 1000).toISOString();
  const detail = (m: Json) => ({
    ...m,
    linked_ids: db.links.flatMap((l) =>
      l.from_memory_id === m.id ? [l.to_memory_id] : l.to_memory_id === m.id ? [l.from_memory_id] : [],
    ),
    reminder: db.reminders[m.id] ?? null,
    attachment: null,
  });
  const summary = (m: Json) => ({ ...m, excerpt: String(m.body).slice(0, 200), link_count: 0, attachment: null });
  const page = (items: Json[]) => ({
    data: items,
    meta: { current_page: 1, last_page: 1, total: items.length, per_page: 100 },
  });
  const res = (status: number, body?: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => {
      if (body === undefined) throw new Error('no body');
      return body;
    },
  });

  async function handle(method: string, url: string, body?: Json) {
    const path = new URL(url).pathname.replace(/^.*\/api\/v1/, '');
    if (failNext) {
      const f = failNext;
      failNext = null;
      if (f === 'network') throw new TypeError('Network request failed');
      return res(f.status, f.body ?? { message: 'Failed' });
    }
    let m: RegExpMatchArray | null;
    if (method === 'GET' && path === '/me') return res(200, { data: { id: 1, name: 'Ada', email: 'ada@example.com' } });
    if (method === 'GET' && path === '/memories') return res(200, page(db.memories.map(summary)));
    if (method === 'GET' && path === '/links') return res(200, page(db.links));
    if (method === 'GET' && path === '/collections') return res(200, page(db.collections));
    if (method === 'GET' && path === '/reminders') return res(200, page(Object.values(db.reminders)));
    if (method === 'GET' && path === '/tags') {
      const counts = new Map<string, number>();
      db.memories.forEach((x) => x.tags.forEach((t: string) => counts.set(t, (counts.get(t) ?? 0) + 1)));
      return res(200, page([...counts].map(([name, memories_count], i) => ({ id: i + 1, name, memories_count }))));
    }
    if (method === 'POST' && path === '/memories') {
      if (!String(body?.title ?? '').trim())
        return res(422, { message: 'invalid', errors: { title: ['The title field is required.'] } });
      const t = now();
      const mem = {
        id: id('m'),
        type: body!.type,
        title: body!.title,
        body: body!.body ?? '',
        source_url: body!.source_url ?? null,
        favorite: !!body!.favorite,
        pinned: !!body!.pinned,
        collection_id: body!.collection_id ?? null,
        tags: body!.tags ?? [],
        created_at: t,
        updated_at: t,
        last_opened_at: t,
        deleted_at: null,
      };
      db.memories.unshift(mem);
      return res(201, { data: detail(mem) });
    }
    if ((m = path.match(/^\/memories\/([^/]+)$/))) {
      const mem = db.memories.find((x) => x.id === m![1]);
      if (!mem) return res(404, { message: 'Not found' });
      if (method === 'GET') return res(200, { data: detail(mem) });
      if (method === 'PATCH') {
        if ('type' in body!)
          return res(422, { message: 'x', errors: { type: ['The type of a memory cannot be changed.'] } });
        const content = Object.keys(body!).some((k) => k !== 'favorite' && k !== 'pinned');
        Object.assign(mem, body, content ? { updated_at: new Date(Date.parse(mem.updated_at) + 60_000).toISOString() } : {});
        return res(200, { data: detail(mem) });
      }
      if (method === 'DELETE') {
        db.memories = db.memories.filter((x) => x !== mem);
        db.trash.push(mem);
        return res(204);
      }
    }
    if ((m = path.match(/^\/memories\/([^/]+)\/open$/))) {
      const mem = db.memories.find((x) => x.id === m![1]);
      return mem ? res(200, { data: detail(mem) }) : res(404, { message: 'Not found' });
    }
    if ((m = path.match(/^\/memories\/([^/]+)\/restore$/))) {
      const mem = db.trash.find((x) => x.id === m![1]);
      if (!mem) return res(404, { message: 'Not found' });
      db.trash = db.trash.filter((x) => x !== mem);
      db.memories.push(mem);
      return res(200, { data: detail(mem) });
    }
    if ((m = path.match(/^\/memories\/([^/]+)\/force$/))) {
      db.trash = db.trash.filter((x) => x.id !== m![1]);
      return res(204);
    }
    if ((m = path.match(/^\/memories\/([^/]+)\/links$/)) && method === 'POST') {
      const [a, b] = [m[1], body!.memory_id].sort();
      if (db.links.some((l) => l.from_memory_id === a && l.to_memory_id === b))
        return res(409, { message: 'These memories are already linked.' });
      const link = { id: id('l'), from_memory_id: a, to_memory_id: b, created_at: now() };
      db.links.push(link);
      return res(201, { data: link });
    }
    if ((m = path.match(/^\/memories\/([^/]+)\/links\/([^/]+)$/)) && method === 'DELETE') {
      const before = db.links.length;
      db.links = db.links.filter(
        (l) => !([l.from_memory_id, l.to_memory_id].includes(m![1]) && [l.from_memory_id, l.to_memory_id].includes(m![2])),
      );
      return db.links.length < before ? res(204) : res(404, { message: 'Not found' });
    }
    if ((m = path.match(/^\/memories\/([^/]+)\/reminder$/))) {
      if (method === 'PUT') {
        const r = {
          id: id('r'),
          memory_id: m[1],
          remind_at: body!.remind_at,
          delivery: body!.delivery,
          notification_id: body!.notification_id ?? null,
          completed_at: null,
          created_at: now(),
        };
        db.reminders[m[1]] = r;
        return res(200, { data: r });
      }
      if (method === 'DELETE') {
        delete db.reminders[m[1]];
        return res(204);
      }
    }
    if (method === 'POST' && path === '/collections') {
      const c = { id: id('c'), name: body!.name, description: body!.description ?? null };
      db.collections.push(c);
      return res(201, { data: c });
    }
    if ((m = path.match(/^\/collections\/([^/]+)$/))) {
      const c = db.collections.find((x) => x.id === m![1]);
      if (!c) return res(404, { message: 'Not found' });
      if (method === 'PATCH') return res(200, { data: Object.assign(c, body) });
      if (method === 'DELETE') {
        db.collections = db.collections.filter((x) => x !== c);
        db.memories.forEach((x) => x.collection_id === c.id && (x.collection_id = null));
        return res(204);
      }
    }
    return res(404, { message: `No fake route for ${method} ${path}` });
  }

  const fetchMock = jest.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body ? (JSON.parse(String(init.body)) as Json) : undefined;
    calls.push({
      method,
      path: new URL(url).pathname.replace(/^.*\/api\/v1/, ''),
      body,
      auth: (init.headers as Record<string, string>)?.Authorization,
    });
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    return handle(method, url, body) as unknown as Response;
  });
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;

  return {
    db,
    calls,
    fetchMock,
    /** The next request fails with this HTTP status, or with a network error. */
    failNext: (f: { status: number; body?: Json } | 'network') => {
      failNext = f;
    },
    setDelay: (ms: number) => {
      delayMs = ms;
    },
    seedMemory(over: Json = {}) {
      const t = now();
      const mem = {
        id: id('m'),
        type: 'note',
        title: 'Seed',
        body: 'Seed body',
        source_url: null,
        favorite: false,
        pinned: false,
        collection_id: null,
        tags: [],
        created_at: t,
        updated_at: t,
        last_opened_at: null,
        deleted_at: null,
        ...over,
      };
      db.memories.push(mem);
      return mem;
    },
  };
}
