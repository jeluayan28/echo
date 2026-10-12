import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Checkbox,
  Chip,
  CollectionCard,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  MemoryCard,
  MemoryCardSkeleton,
  Screen,
  SearchBar,
  Sheet,
  Switch,
  Text,
  TextField,
  useToast,
  type IconName,
} from '@/components/ui';
import { colors, radius, spacing, typography, type TextVariant } from '@/theme';

/** Development-only component gallery. Reachable from the Core tab in __DEV__ builds. */
export default function DesignSystemScreen() {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'ideas' | 'links'>('all');
  const [notify, setNotify] = useState(true);
  const [privateMode, setPrivateMode] = useState(false);
  const [agree, setAgree] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [title, setTitle] = useState('');
  const [fav, setFav] = useState(false);

  const save = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast.show('Memory saved', 'success');
    }, 1200);
  };

  return (
    <Screen scroll>
      <View style={styles.header}>
        <IconButton icon="chevronLeft" label="Back" variant="filled" onPress={() => router.back()} />
        <Text variant="title">Design system</Text>
      </View>

      <Section title="Color">
        <View style={styles.swatches}>
          {Object.entries(colors)
            .filter(([k]) => !['overlay', 'onAccent'].includes(k) && !k.endsWith('Tint'))
            .map(([name, value]) => (
              <View key={name} style={styles.swatch}>
                <View style={[styles.chipColor, { backgroundColor: value }]} />
                <Text variant="caption">{name}</Text>
                <Text variant="caption" tone="muted">
                  {value}
                </Text>
              </View>
            ))}
        </View>
      </Section>

      <Section title="Typography">
        {(Object.keys(typography) as TextVariant[]).map((v) => (
          <Text key={v} variant={v}>
            {v === 'numeric' ? '1,284' : `${v} — memory`}
          </Text>
        ))}
      </Section>

      <Section title="Icons">
        <View style={styles.icons}>
          {(
            [
              'core', 'search', 'map', 'settings', 'add', 'close', 'check', 'favorite', 'pin', 'link',
              'voice', 'note', 'idea', 'collection', 'tag', 'edit', 'delete', 'bell', 'user', 'lock',
            ] as IconName[]
          ).map((n) => (
            <Icon key={n} name={n} size={24} color={colors.violet} />
          ))}
        </View>
      </Section>

      <Section title="Buttons">
        <View style={styles.row}>
          <Button label="Capture" icon="add" />
          <Button label="Secondary" variant="secondary" />
          <Button label="Ghost" variant="ghost" />
          <Button label="Delete" variant="danger" icon="delete" />
        </View>
        <View style={styles.row}>
          <Button label="Disabled" disabled />
          <Button label={saving ? 'Saving' : 'Tap to load'} loading={saving} onPress={save} />
        </View>
        <Button label="Full width" fullWidth variant="secondary" />
        <View style={styles.row}>
          <IconButton icon="edit" label="Edit" variant="filled" />
          <IconButton icon="favorite" label="Favorite" active={fav} onPress={() => setFav((f) => !f)} />
          <IconButton icon="more" label="More" />
          <IconButton icon="delete" label="Delete (disabled)" disabled />
        </View>
      </Section>

      <Section title="Inputs">
        <SearchBar value={query} onChangeText={setQuery} />
        <TextField label="Title" placeholder="Name this thought" value={title} onChangeText={setTitle} />
        <TextField label="Email" helper="We never share it." placeholder="you@example.com" />
        <TextField label="Password" error="Must be at least 8 characters" defaultValue="abc" secureTextEntry />
        <TextField label="Note" multiline placeholder="Write freely…" />
        <TextField label="Disabled" disabled defaultValue="Locked" />
      </Section>

      <Section title="Chips & filters">
        <View style={styles.row}>
          <Chip label="All" count={42} selected={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label="Ideas" icon="idea" count={12} selected={filter === 'ideas'} onPress={() => setFilter('ideas')} />
          <Chip label="Links" icon="link" count={8} selected={filter === 'links'} onPress={() => setFilter('links')} />
        </View>
        <View style={styles.row}>
          <Chip label="research" />
          <Chip label="design" />
          <Chip label="removable" onRemove={() => toast.show('Tag removed', 'info')} />
        </View>
      </Section>

      <Section title="Cards">
        <MemoryCard
          type="idea"
          title="A second brain should resurface what you forgot"
          preview="Surface a few old memories each morning, weighted by how connected they are to what I wrote recently."
          tags={['product', 'rediscovery', 'notifications', 'extra']}
          date="2 days ago"
          pinned
          favorite
          linkCount={5}
        />
        <MemoryCard type="link" title="How hippocampal replay consolidates memory" date="Last week" tags={['neuroscience']} />
        <CollectionCard name="Product ideas" description="Things worth building" memoryCount={18} />
        <CollectionCard name="Reading list" memoryCount={1} />
      </Section>

      <Section title="Loading, empty & error">
        <MemoryCardSkeleton />
        <EmptyState
          title="No memories yet"
          message="Capture your first thought and it will appear here."
          actionLabel="Capture"
          onAction={() => toast.show('Capture flow coming soon', 'info')}
        />
        <ErrorState onRetry={() => toast.show('Retrying…', 'info')} />
      </Section>

      <Section title="Controls">
        <Switch label="Daily summary" description="A morning digest of what you captured" value={notify} onValueChange={setNotify} />
        <Switch label="Private mode" value={privateMode} onValueChange={setPrivateMode} />
        <Switch label="Unavailable" value disabled onValueChange={() => {}} />
        <Checkbox label="I understand memories sync to my account" checked={agree} onChange={setAgree} />
        <Checkbox label="Disabled option" checked={false} disabled onChange={() => {}} />
      </Section>

      <Section title="Overlays & feedback">
        <View style={styles.row}>
          <Button label="Open sheet" variant="secondary" onPress={() => setSheet(true)} />
          <Button label="Confirm dialog" variant="secondary" onPress={() => setDialog(true)} />
        </View>
        <View style={styles.row}>
          <Button label="Success" variant="ghost" onPress={() => toast.show('Memory saved', 'success')} />
          <Button label="Error" variant="ghost" onPress={() => toast.show('Couldn’t save. Try again.', 'error')} />
          <Button label="Info" variant="ghost" onPress={() => toast.show('3 memories resurfaced', 'info')} />
        </View>
      </Section>

      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Add to collection">
        <View style={{ gap: spacing.xs, paddingVertical: spacing.sm }}>
          <CollectionCard name="Product ideas" memoryCount={18} onPress={() => setSheet(false)} />
          <CollectionCard name="Reading list" memoryCount={1} onPress={() => setSheet(false)} />
        </View>
      </Sheet>

      <ConfirmDialog
        visible={dialog}
        destructive
        title="Delete this memory?"
        message="It will be removed along with its links. This can’t be undone."
        confirmLabel="Delete"
        onCancel={() => setDialog(false)}
        onConfirm={() => {
          setDialog(false);
          toast.show('Memory deleted', 'success');
        }}
      />
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="overline" tone="cyan">
        {title}
      </Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  section: { gap: spacing.sm, marginTop: spacing.md },
  sectionBody: { gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  swatch: { width: 104, gap: 2 },
  chipColor: {
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 4,
  },
  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
