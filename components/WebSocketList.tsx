import { useState } from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import { matchesSocket } from '~/lib/log-search';
import type { WsConnectionEntry } from '~/lib/types';
import WebSocketDetail from './WebSocketDetail';

export interface WebSocketListProps {
  recording: boolean;
  /** False when paused or the profile has no enabled header rules. */
  canRecord?: boolean;
  connections: WsConnectionEntry[];
  onToggleRecording: () => void;
  onClear: () => void;
  onNotify?: (message: string) => void;
  expandedId?: string | null;
  onExpand?: (id: string | null) => void;
}

function stateLabel(row: WsConnectionEntry): string {
  return row.state === 'closed' && row.closeCode != null
    ? `closed ${row.closeCode}`
    : row.state;
}

function stateColor(
  state: WsConnectionEntry['state'],
): 'warning.main' | 'success.main' | 'error.main' | 'text.secondary' {
  if (state === 'connecting') {
    return 'warning.main';
  }
  if (state === 'open') {
    return 'success.main';
  }
  if (state === 'failed') {
    return 'error.main';
  }
  return 'text.secondary';
}

export default function WebSocketList({
  recording,
  canRecord = true,
  connections,
  onToggleRecording,
  onClear,
  onNotify,
  expandedId,
  onExpand,
}: WebSocketListProps) {
  const [query, setQuery] = useState('');
  const visible = connections.filter((c) => matchesSocket(c, query));
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
          disabled={connections.length === 0}
          aria-label="Clear WebSockets"
        >
          Clear
        </Button>
        <Typography variant="caption" color="text.secondary">
          {recording
            ? 'Recording patched connections'
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
          slotProps={{ htmlInput: { 'aria-label': 'Search WebSockets' } }}
          sx={{ ml: 'auto', mr: '10px', flex: '0 1 140px', minWidth: 90 }}
        />
      </Box>

      {connections.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
          {recording
            ? 'Waiting for patched WebSocket connections…'
            : canRecord
              ? 'Start recording to capture WebSocket connections this profile patches.'
              : 'Recording stays off while nothing is being modified.'}
        </Typography>
      ) : visible.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
          No WebSockets match the search.
        </Typography>
      ) : (
        <Box sx={{ maxHeight: 460, overflow: 'auto' }}>
          {visible.map((row) => {
            const open = expandedId === row.id;
            return (
              <Box
                key={row.id}
                sx={{ borderBottom: 1, borderColor: 'divider', py: 0.5 }}
              >
                <Box
                  component="button"
                  type="button"
                  onClick={() => onExpand?.(open ? null : row.id)}
                  aria-expanded={open}
                  aria-label={`WebSocket ${row.url}`}
                  style={{
                    width: '100%',
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
                    {new Date(row.startedAt).toLocaleTimeString()}
                  </Typography>
                  <Typography
                    component="span"
                    variant="caption"
                    aria-label={`State ${stateLabel(row)}`}
                    sx={{
                      color: stateColor(row.state),
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {stateLabel(row)}
                  </Typography>
                  <Typography
                    component="span"
                    variant="caption"
                    noWrap
                    title={row.url}
                    sx={{ fontFamily: 'monospace', flex: 1, minWidth: 0 }}
                  >
                    {row.url}
                  </Typography>
                  <Typography
                    component="span"
                    variant="caption"
                    color="text.secondary"
                    aria-label={`${row.messages.length} messages`}
                    sx={{ flexShrink: 0 }}
                  >
                    {row.messages.length} msg
                  </Typography>
                </Box>
                {open ? (
                  <WebSocketDetail connection={row} onNotify={onNotify} />
                ) : null}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
