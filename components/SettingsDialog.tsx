import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import type { AppendMode, Profile } from '~/lib/types';

/**
 * Profile settings dialog (T030): append-mode selector and comment column
 * visibility. Legacy appendMode '' = override, 'true' = concatenation,
 * 'comma' = comma separated; the data model normalizes concatenation to
 * 'append', and legacy 'true' is displayed as 'append'.
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
  const showComments = profile.hideComment === false;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2,
            backgroundImage: 'none',
          },
        },
      }}
    >
      <DialogTitle sx={{ px: 3, pt: 2.5, pb: 1 }}>
        <Typography
          component="div"
          variant="overline"
          color="text.secondary"
          sx={{ letterSpacing: '0.08em', lineHeight: 1.2 }}
        >
          Profile settings
        </Typography>
        <Typography
          component="h2"
          variant="h6"
          noWrap
          title={profile.title}
          sx={{ mt: 0.5, fontWeight: 600 }}
        >
          {profile.title}
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ px: 3, py: 1 }}>
        <Stack spacing={2.25}>
          <FormControl component="fieldset" fullWidth>
            <FormLabel
              component="legend"
              sx={{
                color: 'text.primary',
                fontSize: '0.875rem',
                fontWeight: 600,
                '&.Mui-focused': { color: 'text.primary' },
              }}
            >
              Header value handling
            </FormLabel>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25 }}>
              Choose what happens when more than one rule uses the same header
              name.
            </Typography>
            <RadioGroup
              aria-label="On same header name"
              value={appendMode}
              onChange={(event) =>
                onChange({
                  ...profile,
                  appendMode: event.target.value as AppendMode,
                })
              }
              sx={{ mt: 1, gap: 0.5 }}
            >
              <FormControlLabel
                value=""
                control={<Radio size="small" />}
                label={
                  <Box>
                    <Typography variant="body2">Override existing value</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Use one value for the header.
                    </Typography>
                  </Box>
                }
                sx={{
                  alignItems: 'flex-start',
                  m: 0,
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                  '&:hover': { bgcolor: 'action.hover' },
                  '& .MuiFormControlLabel-label': { flex: 1 },
                  '& .MuiRadio-root': { pt: 0.25 },
                }}
              />
              <FormControlLabel
                value="append"
                control={<Radio size="small" />}
                label={
                  <Box>
                    <Typography variant="body2">Value concatenation</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Join repeated values without a separator.
                    </Typography>
                  </Box>
                }
                sx={{
                  alignItems: 'flex-start',
                  m: 0,
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                  '&:hover': { bgcolor: 'action.hover' },
                  '& .MuiFormControlLabel-label': { flex: 1 },
                  '& .MuiRadio-root': { pt: 0.25 },
                }}
              />
              <FormControlLabel
                value="comma"
                control={<Radio size="small" />}
                label={
                  <Box>
                    <Typography variant="body2">
                      Comma separated concatenation
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Join repeated values with a comma.
                    </Typography>
                  </Box>
                }
                sx={{
                  alignItems: 'flex-start',
                  m: 0,
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                  '&:hover': { bgcolor: 'action.hover' },
                  '& .MuiFormControlLabel-label': { flex: 1 },
                  '& .MuiRadio-root': { pt: 0.25 },
                }}
              />
            </RadioGroup>
          </FormControl>

          <Divider />

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 2,
            }}
          >
            <Box>
              <Typography variant="subtitle2">Comment column</Typography>
              <Typography variant="caption" color="text.secondary">
                Show comments alongside header rules.
              </Typography>
            </Box>
            <Switch
              size="small"
              checked={showComments}
              onChange={(_, checked) =>
                onChange({
                  ...profile,
                  hideComment: !checked,
                })
              }
              slotProps={{ input: { 'aria-label': 'Show comment column' } }}
            />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pt: 1.5, pb: 2.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
          Changes save automatically
        </Typography>
        <Button onClick={onClose} variant="contained" size="small">
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
