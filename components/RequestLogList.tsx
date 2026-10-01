import { Box, Button, Chip, IconButton, TextField, Typography } from '@mui/material';
import { matchesRequest } from '~/lib/log-search';
import type { RequestLogEntry } from '~/lib/types';
import { toCurl } from '~/lib/curl';
import { typeShortLabel, visibleEntries } from '~/lib/resource-types';
import { setTypeFilter } from '~/lib/session-log';
import RequestLogDetail from './RequestLogDetail';
import ResourceTypeToggles from './ResourceTypeToggles';

export interface RequestLogListProps {
  profileIndex: number;
  recording: boolean;
  /** False when paused or the profile has no enabled header rules. */
  canRecord?: boolean;
  entries: RequestLogEntry[];
  typeFilter: string[];
  onToggleRecording: () => void;
  onClear: () => void;
  onCopyCurl?: (message: string) => void;
  expandedId?: string | null;
  onExpand?: (id: string | null) => void;
}

function statusLabel(status: RequestLogEntry['status']): string {
  if (status === 'pending') {
    return 'pending';
  }
  if (status === 'failed') {
    return 'failed';
  }
  return String(status);
}

function statusColor(
  status: RequestLogEntry['status'],
): 'warning.main' | 'success.main' | 'error.main' | 'text.primary' {
  if (status === 'pending') {
    return 'warning.main';
  }
  if (status === 'failed') {
    return 'error.main';
  }
  if (typeof status === 'number' && status >= 200 && status < 400) {
    return 'success.main';
  }
  if (typeof status === 'number') {
    return 'error.main';
  }
  return 'text.primary';
}

function formatTime(startedAt: number): string {
  return new Date(startedAt).toLocaleTimeString();
}

export default function RequestLogList({
  profileIndex,
  recording,
  canRecord = true,
  entries,
  typeFilter,
  onToggleRecording,
  onClear,
  onCopyCurl,
  expandedId,
  onExpand,
}: RequestLogListProps) {
  const [query, setQuery] = useState('');
  const visible = visibleEntries(entries, typeFilter).filter((e) =>
    matchesRequest(e, query),
  );

  const copyCurl = async (entry: RequestLogEntry) => {
    const { command, bodyOmitted } = toCurl(entry);
    try {
      await navigator.clipboard.writeText(command);
      onCopyCurl?.(
        bodyOmitted ? 'Copied cURL (request body skipped)' : 'Copied cURL',
      );
    } catch {
      onCopyCurl?.('Could not copy cURL');
    }
  };

  return (
    <Box sx={{ px: 1, py: 0.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
        <Button
          size="small"
          variant={recording ? 'outlined' : 'contained'}
          onClick={onToggleRecording}
          disabled={!recording && !canRecord}
          aria-label={recording ? 'Pause recording' : 'Start recording'}
        >
          {recording ? 'Pause' : 'Start'}
        </Button>
        <Button
          size="small"
          onClick={onClear}
          disabled={entries.length === 0}
          aria-label="Clear log"
        >
          Clear
        </Button>
        <Typography variant="caption" color="text.secondary">
          {recording
            ? 'Recording patched requests'
            : canRecord
              ? 'Recording paused'
              : 'Off while nothing is being modified'}
        </Typography>
        <TextField
          size="small"
          type="search"
          placeholder="Search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          slotProps={{ htmlInput: { 'aria-label': 'Search requests' } }}
          sx={{ ml: 'auto', mr: '10px', flex: '0 1 140px', minWidth: 90 }}
        />
      </Box>

      <Box sx={{ mb: 0.75 }}>
        <ResourceTypeToggles
          mode="logs"
          value={typeFilter}
          aria-label="Request resource types"
          onChange={(next) => {
            void setTypeFilter(profileIndex, next);
          }}
        />
      </Box>

      {entries.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
          {recording
            ? 'Matching patched requests will appear here.'
            : canRecord
              ? 'Start recording to capture patched requests.'
              : 'Recording stays off while nothing is being modified.'}
        </Typography>
      ) : visible.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
          No requests match the filters.
        </Typography>
      ) : (
        <Box sx={{ maxHeight: 420, overflow: 'auto' }}>
          {visible.map((entry) => {
            const open = expandedId === entry.id;
            const typeLabel = typeShortLabel(entry.resourceType);
            return (
              <Box
                key={entry.id}
                sx={{
                  mb: 0.5,
                  px: 0.75,
                  py: 0.75,
                  border: 1,
                  borderColor: open ? 'primary.main' : 'divider',
                  borderRadius: 1,
                  bgcolor: open ? 'action.selected' : 'background.paper',
                  transition: 'border-color 120ms ease, background-color 120ms ease',
                  '&:hover': {
                    borderColor: open ? 'primary.main' : 'text.secondary',
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                  <Box
                    component="button"
                    type="button"
                    onClick={() => onExpand?.(open ? null : entry.id)}
                    aria-expanded={open}
                    aria-label={`Log ${entry.method} ${entry.resourceType} ${entry.url}`}
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                      textAlign: 'left',
                      background: 'transparent',
                      border: 0,
                      p: 0,
                      cursor: 'pointer',
                      font: 'inherit',
                      color: 'inherit',
                      '&:focus-visible': {
                        outline: '2px solid',
                        outlineColor: 'primary.main',
                        outlineOffset: 2,
                        borderRadius: 0.5,
                      },
                    }}
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      title={new Date(entry.startedAt).toLocaleString()}
                      sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
                    >
                      {formatTime(entry.startedAt)}
                    </Typography>
                    <Chip
                      component="span"
                      size="small"
                      label={entry.method}
                      sx={{
                        height: 20,
                        flexShrink: 0,
                        fontWeight: 700,
                        '& .MuiChip-label': { px: 0.75 },
                      }}
                    />
                    <Chip
                      component="span"
                      size="small"
                      variant="outlined"
                      label={statusLabel(entry.status)}
                      aria-label={`Status ${statusLabel(entry.status)}`}
                      sx={{
                        height: 20,
                        flexShrink: 0,
                        color: statusColor(entry.status),
                        borderColor: statusColor(entry.status),
                        '& .MuiChip-label': { px: 0.75 },
                      }}
                    />
                    <Chip
                      component="span"
                      size="small"
                      variant="outlined"
                      label={typeLabel}
                      aria-label={`Type ${typeLabel}`}
                      sx={{
                        height: 20,
                        flexShrink: 0,
                        color: 'text.secondary',
                        borderColor: 'divider',
                        '& .MuiChip-label': { px: 0.75 },
                      }}
                    />
                    <Typography
                      component="span"
                      variant="caption"
                      noWrap
                      title={entry.url}
                      sx={{
                        fontFamily: 'monospace',
                        fontWeight: 500,
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      {entry.url}
                    </Typography>
                    <Typography
                      component="span"
                      aria-hidden="true"
                      sx={{ color: 'text.secondary', flexShrink: 0, lineHeight: 1 }}
                    >
                      {open ? '▴' : '▾'}
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    aria-label="Copy cURL"
                    title="Copy cURL"
                    sx={{
                      borderRadius: 1,
                      border: 1,
                      borderColor: 'divider',
                      px: 0.75,
                      py: 0,
                      flexShrink: 0,
                    }}
                    onClick={() => void copyCurl(entry)}
                  >
                    <Typography variant="caption">cURL</Typography>
                  </IconButton>
                </Box>
                {open ? (
                  <RequestLogDetail entry={entry} onCopyBody={onCopyCurl} />
                ) : null}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
