/**
 * Local file helpers (recordings). Isolated here so the rest of the app — and the tests —
 * never touch expo-file-system directly. All functions swallow platform errors: a missing file
 * must never crash a save or a delete.
 */
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

/** Size in bytes, or undefined when it can't be determined. */
export async function fileSize(uri: string): Promise<number | undefined> {
  try {
    if (Platform.OS === 'web') {
      const blob = await (await fetch(uri)).blob();
      return blob.size;
    }
    return new File(uri).size ?? undefined;
  } catch {
    return undefined;
  }
}

/** Best-effort delete of a local file (no-op on web, where recordings are blob URLs). */
export async function deleteLocalFile(uri: string | undefined): Promise<void> {
  if (!uri || Platform.OS === 'web') return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Orphaned files are cleaned up by the OS cache/document policies; never fail the caller.
  }
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
