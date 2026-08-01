import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import { listBackups, saveBackup, type BackupSnapshot } from '~/lib/backup';
import type { Profile } from '~/lib/types';

/**
 * Cloud backup dialog (T032): list/restore snapshots in both the legacy
 * single-item format and the new chunked format via lib/backup.ts — port of
 * src/cloudbackupdialog.tmpl.html. Backup failures are surfaced via Snackbar
 * (FR-014).
 */
export interface CloudBackupDialogProps {
  open: boolean;
  currentProfiles: Profile[];
  onClose: () => void;
  onRestore: (profiles: Profile[]) => void;
  onNotify: (message: string) => void;
}

export default function CloudBackupDialog({
  open,
  currentProfiles,
  onClose,
  onRestore,
  onNotify,
}: CloudBackupDialogProps) {
  const [snapshots, setSnapshots] = useState<BackupSnapshot[]>([]);

  useEffect(() => {
    if (open) {
      void listBackups().then(setSnapshots);
    }
  }, [open]);

  const backupNow = async () => {
    try {
      await saveBackup(currentProfiles);
      setSnapshots(await listBackups());
      onNotify('Backup saved');
    } catch (e) {
      onNotify(`Backup failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const restore = (snapshot: BackupSnapshot) => {
    onRestore(snapshot.profiles);
    onNotify('Profiles successfully import');
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Cloud backup</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1 }}>
          {snapshots.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No backups found
            </Typography>
          )}
          {snapshots.map((snapshot) => (
            <Button
              key={snapshot.timeInMs}
              onClick={() => restore(snapshot)}
              sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
            >
              Backup at {new Date(snapshot.timeInMs).toLocaleString()} -{' '}
              {snapshot.profiles.map((p) => p.title).join(',')}
            </Button>
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={backupNow}>Backup now</Button>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
