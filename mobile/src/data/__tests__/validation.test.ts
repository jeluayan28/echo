import {
  LIMITS,
  hasErrors,
  isHttpUrl,
  normalizeTags,
  validateCollection,
  validateMemory,
  type MemoryDraft,
} from '../validation';

const draft = (over: Partial<MemoryDraft> = {}): MemoryDraft => ({
  type: 'note',
  title: 'A title',
  body: '',
  tags: [],
  hasAudio: false,
  ...over,
});

describe('isHttpUrl', () => {
  it.each(['https://example.com', 'http://example.com/path?q=1#x', '  https://example.com  '])(
    'accepts %p',
    (v) => expect(isHttpUrl(v)).toBe(true),
  );

  it.each(['', 'example.com', 'www.example.com', 'ftp://example.com', 'javascript:alert(1)', 'https://', 'https://localhost', 'not a url'])(
    'rejects %p',
    (v) => expect(isHttpUrl(v)).toBe(false),
  );
});

describe('normalizeTags', () => {
  it('lowercases, trims, strips #, and removes empties and duplicates', () => {
    expect(normalizeTags(' Product, #UX ,, product ,Map ')).toEqual(['product', 'ux', 'map']);
  });
  it('accepts arrays and newlines', () => {
    expect(normalizeTags(['A', ' a ', '#b'])).toEqual(['a', 'b']);
    expect(normalizeTags('x\ny')).toEqual(['x', 'y']);
  });
  it('returns an empty list for blank input (untagged is valid)', () => {
    expect(normalizeTags('')).toEqual([]);
    expect(normalizeTags('  , ,')).toEqual([]);
  });
});

describe('validateMemory', () => {
  it('accepts a minimal note with no tags, content or link', () => {
    expect(validateMemory(draft())).toEqual({});
  });

  it('requires a title and trims whitespace-only titles', () => {
    expect(validateMemory(draft({ title: '   ' })).title).toBeDefined();
    expect(validateMemory(draft({ title: '' })).title).toBeDefined();
  });

  it('enforces title and body length limits', () => {
    expect(validateMemory(draft({ title: 'x'.repeat(LIMITS.title) })).title).toBeUndefined();
    expect(validateMemory(draft({ title: 'x'.repeat(LIMITS.title + 1) })).title).toBeDefined();
    expect(validateMemory(draft({ body: 'x'.repeat(LIMITS.body + 1) })).body).toBeDefined();
  });

  it('requires a valid URL for link memories', () => {
    expect(validateMemory(draft({ type: 'link' })).sourceUrl).toMatch(/link/i);
    expect(validateMemory(draft({ type: 'link', sourceUrl: 'nope' })).sourceUrl).toBeDefined();
    expect(validateMemory(draft({ type: 'link', sourceUrl: 'https://example.com' }))).toEqual({});
  });

  it('treats the source URL as optional on notes and ideas, but validates it when present', () => {
    expect(validateMemory(draft({ type: 'idea', sourceUrl: '' }))).toEqual({});
    expect(validateMemory(draft({ type: 'idea', sourceUrl: 'bad' })).sourceUrl).toBeDefined();
  });

  it('requires a recording for voice memos', () => {
    expect(validateMemory(draft({ type: 'voice' })).audio).toBeDefined();
    expect(validateMemory(draft({ type: 'voice', hasAudio: true }))).toEqual({});
  });

  it('limits tag count and length', () => {
    const many = Array.from({ length: LIMITS.tags + 1 }, (_, i) => `t${i}`);
    expect(validateMemory(draft({ tags: many })).tags).toBeDefined();
    expect(validateMemory(draft({ tags: ['x'.repeat(LIMITS.tag + 1)] })).tags).toBeDefined();
    expect(validateMemory(draft({ tags: ['ok'] })).tags).toBeUndefined();
  });

  it('reports several problems at once', () => {
    const errors = validateMemory(draft({ type: 'link', title: '' }));
    expect(Object.keys(errors).sort()).toEqual(['sourceUrl', 'title']);
    expect(hasErrors(errors)).toBe(true);
  });
});

describe('hasErrors', () => {
  it('ignores fields whose error was cleared to undefined', () => {
    expect(hasErrors({})).toBe(false);
    expect(hasErrors({ title: undefined, sourceUrl: undefined })).toBe(false);
    expect(hasErrors({ title: undefined, sourceUrl: 'bad' })).toBe(true);
  });
});

describe('validateCollection', () => {
  it('requires a name', () => {
    expect(validateCollection({ name: '  ' }).name).toBeDefined();
    expect(validateCollection({ name: 'Reading' })).toEqual({});
  });
  it('limits name and description length', () => {
    expect(validateCollection({ name: 'x'.repeat(LIMITS.collectionName + 1) }).name).toBeDefined();
    expect(
      validateCollection({ name: 'ok', description: 'x'.repeat(LIMITS.collectionDescription + 1) }).description,
    ).toBeDefined();
  });
});
