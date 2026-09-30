import { useState } from 'react';
import {
  Box,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import type { WsConnectionEntry, WsMessage } from '~/lib/types';
import { WS_VIEWS, autoView, decode, type WsView } from '~/lib/ws-decode';
import { HeaderList, Section } from './RequestLogDetail';

export interface WebSocketDetailProps {
  connection: WsConnectionEntry;
  onNotify?: (message: string) => void;
}

const PREVIEW_CHARS = 120;

function preview(msg: WsMessage): string {
  if (msg.kind === 'binary') {
    return `binary · ${msg.size} B`;
  }
  const oneLine = msg.data.replace(/\s+/g, ' ');
  return oneLine.length > PREVIEW_CHARS
    ? `${oneLine.slice(0, PREVIEW_CHARS)}…`
    : oneLine;
}

function MessageBody({
  msg,
  onNotify,
}: {
  msg: WsMessage;
  onNotify?: (message: string) => void;
}) {
  const [view, setView] = useState<WsView>(() => autoView(msg));
  const result = decode(msg, view);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(msg.data);
      onNotify?.(msg.kind === 'binary' ? 'Copied message (Base64)' : 'Copied message');
    } catch {
      onNotify?.('Could not copy message');
    }
  };
  return (
    <Box sx={{ mt: 0.25, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={view}
          onChange={(_e, next: WsView | null) => {
            if (next) {
              setView(next);
            }
          }}
          aria-label="Message view"
        >
          {WS_VIEWS.map((option) => (
            <ToggleButton
              key={option.value}
              value={option.value}
              sx={{ py: 0, px: 0.75, fontSize: 11, textTransform: 'none' }}
            >
              {option.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <IconButton size="small" aria-label="Copy message" onClick={() => void copy()}>
          <Typography variant="caption">Copy</Typography>
        </IconButton>
      </Box>
      <Box
        component="pre"
        aria-label="Message content"
        sx={{
          m: 0,
          mt: 0.25,
          p: 0.5,
          maxHeight: 200,
          overflow: 'auto',
          bgcolor: 'action.hover',
          fontSize: 11,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: result.ok ? 'text.primary' : 'text.secondary',
        }}
      >
        {result.ok ? result.text : result.reason}
        {msg.truncated ? '\n…truncated' : ''}
      </Box>
    </Box>
  );
}

export default function WebSocketDetail({ connection, onNotify }: WebSocketDetailProps) {
  const [openSeq, setOpenSeq] = useState<number | null>(null);
  const { messages } = connection;
  const copyText = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onNotify?.(`Copied ${what}`);
    } catch {
      onNotify?.(`Could not copy ${what}`);
    }
  };

  let empty: string | null = null;
  if (!connection.messagesObserved && connection.state !== 'connecting') {
    empty =
      'Messages not available for this connection (opened outside the page, e.g. a worker).';
  } else if (messages.length === 0) {
    empty = 'No messages yet.';
  }

  return (
    <Box aria-label="WebSocket detail" sx={{ pt: 0.5, minWidth: 0, overflowX: 'auto' }}>
      <Section title="Handshake">
        <Typography variant="caption" sx={{ display: 'block', wordBreak: 'break-all' }}>
          {connection.url}
          <IconButton
            size="small"
            aria-label="Copy URL"
            onClick={() => void copyText(connection.url, 'URL')}
          >
            <Typography variant="caption">Copy</Typography>
          </IconButton>
        </Typography>
        {connection.state === 'closed' ? (
          <Typography variant="caption" sx={{ display: 'block' }}>
            Closed {connection.closeCode ?? ''}
            {connection.closeReason ? ` · ${connection.closeReason}` : ''}
          </Typography>
        ) : null}
        <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
          Request headers
        </Typography>
        <HeaderList headers={connection.requestHeaders} />
        {connection.responseHeaders?.length ? (
          <>
            <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
              Response headers
            </Typography>
            <HeaderList headers={connection.responseHeaders} />
          </>
        ) : null}
      </Section>
      <Section title={`Messages (${messages.length})`}>
        {connection.droppedMessages ? (
          <Typography variant="caption" color="warning.main" sx={{ display: 'block' }}>
            Earlier messages were dropped.
          </Typography>
        ) : null}
        {messages.length ? (
          <IconButton
            size="small"
            aria-label="Copy all messages"
            // Raw payloads as JSON; binary stays Base64 (same as per-message copy).
            onClick={() => void copyText(JSON.stringify(messages, null, 2), 'all messages')}
          >
            <Typography variant="caption">Copy all</Typography>
          </IconButton>
        ) : null}
        {empty ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {empty}
          </Typography>
        ) : (
          <Box sx={{ maxHeight: 320, overflow: 'auto' }}>
            {messages.map((msg) => {
              const open = openSeq === msg.seq;
              const arrow = msg.dir === 'sent' ? '↑' : '↓';
              return (
                <Box key={msg.seq} sx={{ borderBottom: 1, borderColor: 'divider', py: 0.25 }}>
                  <Box
                    component="button"
                    type="button"
                    onClick={() => setOpenSeq(open ? null : msg.seq)}
                    aria-expanded={open}
                    aria-label={`${msg.dir} message ${preview(msg)}`}
                    style={{
                      width: '100%',
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
                      sx={{
                        fontWeight: 700,
                        flexShrink: 0,
                        color: msg.dir === 'sent' ? 'primary.main' : 'success.main',
                      }}
                    >
                      {arrow}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                      {new Date(msg.at).toLocaleTimeString()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                      {msg.size} B{msg.truncated ? ' · truncated' : ''}
                    </Typography>
                    <Typography
                      component="span"
                      variant="caption"
                      noWrap
                      sx={{ fontFamily: 'monospace', flex: 1, minWidth: 0 }}
                    >
                      {preview(msg)}
                    </Typography>
                  </Box>
                  {open ? <MessageBody msg={msg} onNotify={onNotify} /> : null}
                </Box>
              );
            })}
          </Box>
        )}
      </Section>
    </Box>
  );
}
