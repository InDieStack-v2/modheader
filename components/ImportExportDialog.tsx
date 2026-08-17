import { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';
import { fixLegacyProfile } from '~/lib/profiles';
import type { Profile } from '~/lib/types';

/**
 * Import/export dialog (T031) per contracts/profile-format.md. Export copies via
 * navigator.clipboard.writeText; import converts legacy urlPattern filters and
 * fills defaults, and leaves the target profile unchanged with a
 * "Failed to import profile" toast on parse failure.
 */

export interface ImportExportDialogProps {
  open: boolean;
  mode: 'import' | 'export';
  profile: Profile;
  onClose: () => void;
  onImport: (profile: Profile) => void;
  onNotify: (message: string) => void;
}

/** Parse one serialized Profile; returns null on any failure. */
function parseImportedProfile(text: string): Profile | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const raw = parsed as Partial<Profile>;
    const profile: Profile = {
      title: typeof raw.title === 'string' ? raw.title : '',
      headers: Array.isArray(raw.headers)
        ? raw.headers
        : [{ enabled: true, name: '', value: '', comment: '' }],
      respHeaders: Array.isArray(raw.respHeaders)
        ? raw.respHeaders
        : [{ enabled: true, name: '', value: '', comment: '' }],
      filters: Array.isArray(raw.filters) ? raw.filters : [],
      appendMode:
        raw.appendMode === 'comma' || raw.appendMode === 'append'
          ? raw.appendMode
          : '',
      hideComment: raw.hideComment ?? true,
    };
    fixLegacyProfile(profile);
    return profile;
  } catch {
    return null;
  }
}

export default function ImportExportDialog({
  open,
  mode,
  profile,
  onClose,
  onImport,
  onNotify,
}: ImportExportDialogProps) {
  const [importText, setImportText] = useState('');

  const copy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(profile));
    onNotify('Copied to clipboard!');
  };

  const finishImport = () => {
    const imported = parseImportedProfile(importText);
    if (!imported) {
      onNotify('Failed to import profile');
      onClose();
      return;
    }
    // Keep the target title when the imported data carries none.
    onImport({ ...imported, title: imported.title || profile.title });
    onNotify('Profile successfully import');
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {mode === 'export' ? profile.title : 'Import profile'}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1 }}>
          {mode === 'export' ? (
            <TextField
              fullWidth
              multiline
              rows={5}
              value={JSON.stringify(profile)}
              slotProps={{ input: { readOnly: true } }}
              onClick={(e) => (e.target as HTMLTextAreaElement).select?.()}
            />
          ) : (
            <TextField
              fullWidth
              multiline
              rows={5}
              placeholder="Paste exported profile here"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        {mode === 'export' && <Button onClick={copy}>Copy</Button>}
        <Button onClick={mode === 'import' ? finishImport : onClose}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
