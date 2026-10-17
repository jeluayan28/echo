import type { Memory } from '@/data/types';

/** User-defined rediscovery preferences for Dream Mode. Device-local. */
export type DreamPreferences = {
  /** When non-empty, drift favors memories carrying one of these tags. */
  focusTags: string[];
  /** Only drift memories not opened/edited for at least this many days (0 = any age). */
  minIdleDays: number;
  /** Show the "Daily discovery" card on Memory Core. */
  dailyEnabled: boolean;
};

export const DEFAULT_PREFERENCES: DreamPreferences = { focusTags: [], minIdleDays: 0, dailyEnabled: true };

/** Device-local memory of what Dream Mode already showed or the user waved away. */
export type DreamHistory = {
  /** memoryId → ISO time it was last shown in a session. Used to rotate through memories. */
  shown: Record<string, string>;
  /** memoryId → ISO time a daily discovery / drift card was dismissed. */
  dismissed: Record<string, string>;
  /** "a|b" (sorted ids) → ISO time a connection suggestion was skipped. */
  skippedPairs: Record<string, string>;
};

export const EMPTY_HISTORY: DreamHistory = { shown: {}, dismissed: {}, skippedPairs: {} };

/** Why a memory was chosen for drift — shown to the user verbatim. */
export type DriftReason = 'focus-tag' | 'forgotten' | 'unseen' | 'rotated';

export type DriftItem = { memory: Memory; reason: DriftReason; explanation: string };

/** Signals that make two memories look related. All explainable; none are inferred by a model. */
export type ConnectionSignal =
  | { kind: 'tags'; tags: string[] }
  | { kind: 'collection'; collectionId: string }
  | { kind: 'neighbor'; viaId: string };

export type ConnectionSuggestion = {
  /** Always a suggestion until the user confirms it. */
  status: 'suggested';
  a: Memory;
  b: Memory;
  score: number;
  signals: ConnectionSignal[];
  explanation: string;
};

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
