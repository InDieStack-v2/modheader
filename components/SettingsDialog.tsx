import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Box,
} from '@mui/material';
import type { AppendMode, Profile } from '~/lib/types';

/**
 * Profile settings dialog (T030): append-mode selector and comment column
 * visibility — port of src/settings.tmpl.html. Legacy appendMode '' = override,
 * 'true' = concatenation, 'comma' = comma separated; the data model normalizes
 * concatenation to 'append', and legacy 'true' is displayed as 'append'.
 */
export interface SettingsDialogProps {
  open: boolean;
  profile: Profile;
  onChange: (profile: Profile) => void;
  onClose: () => void;
}

export default function SettingsDialog({
  open,
  profile,
  onChange,
  onClose,
}: SettingsDialogProps) {
  // Legacy stored 'true' (string) means concatenation → 'append'.
  const appendMode: AppendMode =
    (profile.appendMode as string) === 'true'
      ? 'append'
      : (profile.appendMode ?? '');

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Profile settings</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <FormControl size="small" fullWidth>
            <InputLabel>On same header name</InputLabel>
            <Select
              label="On same header name"
              value={appendMode}
              onChange={(e) =>
                onChange({
                  ...profile,
                  appendMode: e.target.value as AppendMode,
                })
              }
            >
              <MenuItem value="">Override existing value</MenuItem>
              <MenuItem value="append">Value concatenation</MenuItem>
              <MenuItem value="comma">Comma separated concatenation</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth>
            <InputLabel>Comment column</InputLabel>
            <Select
              label="Comment column"
              value={profile.hideComment === false ? 'show' : 'hide'}
              onChange={(e) =>
                onChange({
                  ...profile,
                  hideComment: e.target.value === 'hide',
                })
              }
            >
              <MenuItem value="show">Show</MenuItem>
              <MenuItem value="hide">Hide</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}
