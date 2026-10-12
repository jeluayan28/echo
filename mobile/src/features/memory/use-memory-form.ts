import { useState } from 'react';

import type { Attachment, LocalFile, Memory, MemoryInput, MemoryType } from '@/data/types';
import { normalizeTags, validateMemory, hasErrors, type MemoryErrors } from '@/data/validation';

import type { AudioDraft } from './save-memory';
import type { VoiceRecording } from './VoiceRecorder';

export const defaultVoiceTitle = () =>
  `Voice memo · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

export type MemoryFormOptions = {
  /** Present when editing. */
  initial?: Memory;
  /** Preselected type when creating (from Quick Capture). */
  initialType?: MemoryType;
  /** Preselected collection when creating from inside a collection. */
  initialCollectionId?: string;
};

type Baseline = {
  type: MemoryType;
  title: string;
  body: string;
  sourceUrl: string;
  tags: string[];
  collectionId: string | undefined;
  favorite: boolean;
  pinned: boolean;
};

/**
 * All state for the create/edit form: field values, validation errors, the recording draft,
 * and whether anything has changed since the form opened ("dirty").
 */
export function useMemoryForm({ initial, initialType, initialCollectionId }: MemoryFormOptions) {
  const [baseline] = useState<Baseline>(() => {
    const type = initial?.type ?? initialType ?? 'note';
    return {
      type,
      title: initial?.title ?? (type === 'voice' ? defaultVoiceTitle() : ''),
      body: initial?.body ?? '',
      sourceUrl: initial?.sourceUrl ?? '',
      tags: initial?.tags ?? [],
      collectionId: initial ? initial.collectionId : initialCollectionId,
      favorite: initial?.favorite ?? false,
      pinned: initial?.pinned ?? false,
    };
  });

  const [type, setTypeState] = useState(baseline.type);
  const [title, setTitle] = useState(baseline.title);
  const [body, setBody] = useState(baseline.body);
  const [sourceUrl, setSourceUrl] = useState(baseline.sourceUrl);
  const [tags, setTags] = useState(baseline.tags);
  const [tagDraft, setTagDraft] = useState('');
  const [collectionId, setCollectionId] = useState(baseline.collectionId);
  const [favorite, setFavorite] = useState(baseline.favorite);
  const [pinned, setPinned] = useState(baseline.pinned);
  const [audio, setAudio] = useState<AudioDraft>({});
  const [errors, setErrors] = useState<MemoryErrors>({});

  const clear = (key: keyof MemoryErrors) => setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));

  /** Committed tags plus whatever is still typed in the tag field. */
  const allTags = [...new Set([...tags, ...normalizeTags(tagDraft)])];
  const existingAttachment = initial?.attachment;
  const hasAudio = !!(audio.local || audio.uploaded || existingAttachment);

  const dirty =
    type !== baseline.type ||
    title.trim() !== baseline.title.trim() ||
    body.trim() !== baseline.body.trim() ||
    sourceUrl.trim() !== baseline.sourceUrl.trim() ||
    allTags.join('|') !== baseline.tags.join('|') ||
    collectionId !== baseline.collectionId ||
    favorite !== baseline.favorite ||
    pinned !== baseline.pinned ||
    !!audio.local;

  /** The recording to show in the player: new one first, then the memory's existing one. */
  const recording: VoiceRecording | undefined = audio.local
    ? { uri: audio.local.uri, durationMs: audio.local.durationMs ?? 0, sizeBytes: audio.local.sizeBytes }
    : existingAttachment
      ? { uri: existingAttachment.uri, durationMs: existingAttachment.durationMs ?? 0, sizeBytes: existingAttachment.sizeBytes }
      : undefined;

  const validate = (): MemoryErrors => {
    const next = validateMemory({ type, title, body, sourceUrl, tags: allTags, hasAudio });
    setErrors(next);
    return next;
  };

  const buildInput = (): MemoryInput => ({
    type,
    title: title.trim(),
    body: body.trim(),
    sourceUrl: sourceUrl.trim() || undefined,
    tags: allTags,
    collectionId,
    favorite,
    pinned,
    attachment: type === 'voice' ? existingAttachment : undefined,
  });

  return {
    type,
    setType: (next: MemoryType) => {
      setTypeState(next);
      // Give a fresh voice memo a sensible title if the user hasn't typed one.
      if (next === 'voice' && !title.trim()) setTitle(defaultVoiceTitle());
      clear('sourceUrl');
      clear('audio');
    },
    title,
    setTitle: (v: string) => {
      setTitle(v);
      clear('title');
    },
    body,
    setBody: (v: string) => {
      setBody(v);
      clear('body');
    },
    sourceUrl,
    setSourceUrl: (v: string) => {
      setSourceUrl(v);
      clear('sourceUrl');
    },
    tags,
    setTags: (v: string[]) => {
      setTags(v);
      clear('tags');
    },
    tagDraft,
    setTagDraft,
    collectionId,
    setCollectionId,
    favorite,
    setFavorite,
    pinned,
    setPinned,

    audio,
    /** A new recording replaces any earlier one (and invalidates a previous upload of it). */
    setLocalRecording: (file: LocalFile) => {
      setAudio({ local: file });
      clear('audio');
    },
    markUploaded: (uploaded: Attachment) => setAudio((a) => ({ ...a, uploaded })),
    recording,
    hasAudio,

    errors,
    validate,
    hasErrors: hasErrors(errors),
    dirty,
    buildInput,
  };
}

export type MemoryForm = ReturnType<typeof useMemoryForm>;
