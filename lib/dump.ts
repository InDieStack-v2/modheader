import { browser } from 'wxt/browser';
import { normalizeImportedProfile } from './profiles';
import type { Profile } from './types';

/**
 * Local export file of every profile (complementary to cloud backup).
 * Format is a JSON Profile[] — the same payload cloud snapshots store —
 * pretty-printed so the file is readable. Import opens a checkbox picker
 * and appends the chosen profiles; parse failure leaves the list unchanged.
 *
 * Export uses the downloads API (data URL) so the save dialog and the file
 * are owned by the browser. Closing after an `<a download>` blob click
 * cancels first-time / Save As downloads.
 */

export function serializeDump(profiles: Profile[]): string {
  return JSON.stringify(profiles, null, 2);
}

export function dumpFilename(now: Date = new Date()): string {
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `modheaderx-dump-${yyyy}-${mm}-${dd}.json`;
}

/** Parse a dump file. Returns null on any failure (including an empty list). */
export function parseDump(text: string): Profile[] | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }
    const profiles: Profile[] = [];
    for (const item of parsed) {
      const profile = normalizeImportedProfile(item);
      if (!profile) {
        return null;
      }
      profiles.push(profile);
    }
    return profiles;
  } catch {
    return null;
  }
}

/** Keep dump profiles whose checkbox is on. Length mismatch treats missing flags as off. */
export function pickSelectedProfiles(
  profiles: Profile[],
  selected: boolean[],
): Profile[] {
  return profiles.filter((_, index) => selected[index] === true);
}

export async function downloadDump(
  profiles: Profile[],
  now?: Date,
): Promise<void> {
  const url =
    'data:application/json;charset=utf-8,' +
    encodeURIComponent(serializeDump(profiles));
  await browser.downloads.download({
    url,
    filename: dumpFilename(now),
    conflictAction: 'uniquify',
  });
}

/** Open a file picker and return the chosen file's text, or null if cancelled. */
export function pickDumpFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        resolve(null);
        return;
      }
      void file.text().then(resolve, () => resolve(null));
    });
    document.body.appendChild(input);
    input.click();
  });
}
