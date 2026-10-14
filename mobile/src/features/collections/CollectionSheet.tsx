import { useState } from 'react';
import { View } from 'react-native';

import { ApiError } from '@/api/client';
import { Button, Sheet, TextField, useToast } from '@/components/ui';
import { collectionActions } from '@/data/hooks';
import { describeError } from '@/data/errors';
import type { Collection } from '@/data/types';
import { LIMITS, hasErrors, validateCollection, type CollectionErrors } from '@/data/validation';
import { spacing } from '@/theme';

export type CollectionSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Present when renaming; absent when creating. */
  collection?: Collection;
  /** Called with the saved collection's id. */
  onSaved?: (id: string) => void;
};

/**
 * Create / rename a collection. The inner form remounts each time the sheet opens
 * (via `key`), so it always starts from the current values.
 */
export function CollectionSheet({ visible, onClose, collection, onSaved }: CollectionSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title={collection ? 'Rename collection' : 'New collection'}>
      {visible && <CollectionForm key={collection?.id ?? 'new'} collection={collection} onClose={onClose} onSaved={onSaved} />}
    </Sheet>
  );
}

function CollectionForm({ collection, onClose, onSaved }: Omit<CollectionSheetProps, 'visible'>) {
  const toast = useToast();
  const [name, setName] = useState(collection?.name ?? '');
  const [description, setDescription] = useState(collection?.description ?? '');
  const [errors, setErrors] = useState<CollectionErrors>({});
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    const next = validateCollection({ name, description });
    setErrors(next);
    if (hasErrors(next)) return;

    setSaving(true);
    try {
      if (collection) {
        await collectionActions.update(collection.id, { name, description });
        toast.show('Collection updated', 'success');
        onSaved?.(collection.id);
      } else {
        const created = await collectionActions.create({ name, description });
        toast.show('Collection created', 'success');
        onSaved?.(created.id);
      }
      onClose();
    } catch (e) {
      const field = e instanceof ApiError ? e.fieldErrors : {};
      if (field.name || field.description) setErrors({ name: field.name, description: field.description });
      else toast.show(describeError(e, 'Couldn’t save the collection. Please try again.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: spacing.md, paddingVertical: spacing.sm }}>
      <TextField
        label="Name"
        placeholder="e.g. Reading list"
        value={name}
        onChangeText={(v) => {
          setName(v);
          if (errors.name) setErrors((e) => ({ ...e, name: undefined }));
        }}
        error={errors.name}
        maxLength={LIMITS.collectionName}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <TextField
        label="Description (optional)"
        value={description}
        onChangeText={setDescription}
        error={errors.description}
        maxLength={LIMITS.collectionDescription}
      />
      <Button label={collection ? 'Save' : 'Create collection'} fullWidth loading={saving} onPress={submit} />
    </View>
  );
}
