import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
} from '@mui/material';
import { pickSelectedProfiles } from '~/lib/dump';
import type { Profile } from '~/lib/types';

export interface ImportDumpDialogProps {
  open: boolean;
  profiles: Profile[];
  onClose: () => void;
  onImport: (profiles: Profile[]) => void;
}

function profileLabel(profile: Profile, index: number): string {
  return profile.title.trim() || `Untitled ${index + 1}`;
}

/**
 * Post-parse profiles import picker: choose one or more profiles to append.
 * Select-all matches HeaderTable (checked / indeterminate / none).
 */
export default function ImportDumpDialog({
  open,
  profiles,
  onClose,
  onImport,
}: ImportDumpDialogProps) {
  const [selected, setSelected] = useState<boolean[]>([]);

  useEffect(() => {
    if (open) {
      setSelected(profiles.map(() => true));
    }
  }, [open, profiles]);

  const allSelected = selected.length > 0 && selected.every(Boolean);
  const someSelected = selected.some(Boolean);

  const toggleAll = (checked: boolean) => {
    setSelected(profiles.map(() => checked));
  };

  const finish = () => {
    const picked = pickSelectedProfiles(profiles, selected);
    if (picked.length === 0) {
      return;
    }
    onImport(picked);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Import profiles</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', mt: 1 }}>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={allSelected}
                indeterminate={someSelected && !allSelected}
                onChange={(e) => toggleAll(e.target.checked)}
                slotProps={{ input: { 'aria-label': 'Select all' } }}
              />
            }
            label="Select all"
          />
          <Box sx={{ maxHeight: 280, overflow: 'auto', pl: 1 }}>
            {profiles.map((profile, index) => (
              <FormControlLabel
                key={`${profile.title}-${index}`}
                sx={{ display: 'flex' }}
                control={
                  <Checkbox
                    size="small"
                    checked={selected[index] === true}
                    onChange={(e) =>
                      setSelected((prev) =>
                        profiles.map((_, i) =>
                          i === index ? e.target.checked : (prev[i] ?? false),
                        ),
                      )
                    }
                  />
                }
                label={profileLabel(profile, index)}
              />
            ))}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={finish} disabled={!someSelected}>
          Import
        </Button>
      </DialogActions>
    </Dialog>
  );
}
