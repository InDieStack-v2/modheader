import { useState } from 'react';
import { Box, Button, IconButton, TextField, Typography } from '@mui/material';
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
          aria-label="Log resource types"
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
                  borderBottom: 1,
                  borderColor: 'divider',
                  py: 0.5,
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    minWidth: 0,
                  }}
                >
                  <Box
                    component="button"
                    type="button"
                    onClick={() => onExpand?.(open ? null : entry.id)}
                    aria-expanded={open}
                    aria-label={`Log ${entry.method} ${entry.resourceType} ${entry.url}`}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      textAlign: 'left',
                      background: 'none',
                      border: 0,
                      padding: 0,
                      cursor: 'pointer',
                      font: 'inherit',
                      color: 'inherit',
                    }}
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ flexShrink: 0 }}
                    >
                      {formatTime(entry.startedAt)}
                    </Typography>
                    <Typography
                      component="span"
                      variant="caption"
                      sx={{ fontWeight: 700, flexShrink: 0, minWidth: 36 }}
                    >
                      {entry.method}
                    </Typography>
                    <Typography
                      component="span"
                      variant="caption"
                      aria-label={`Status ${statusLabel(entry.status)}`}
                      sx={{
                        color: statusColor(entry.status),
                        fontWeight: 600,
                        flexShrink: 0,
                        minWidth: 40,
                      }}
                    >
                      {statusLabel(entry.status)}
                    </Typography>
                    <Typography
                      component="span"
                      variant="caption"
                      aria-label={`Type ${typeLabel}`}
                      sx={{ flexShrink: 0, color: 'text.secondary' }}
                    >
                      {typeLabel}
                    </Typography>
                    <Typography
                      component="span"
                      variant="caption"
                      noWrap
                      title={entry.url}
                      sx={{
                        fontFamily: 'monospace',
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      {entry.url}
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    aria-label="Copy cURL"
                    sx={{ borderRadius: 1, border: 1, borderColor: 'divider', px: 0.75, py: 0 }}
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
