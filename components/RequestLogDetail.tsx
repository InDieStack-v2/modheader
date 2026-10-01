import type { ReactNode } from 'react';
import { Box, Chip, IconButton, Typography } from '@mui/material';
import { formatBodyForDisplay } from '~/lib/body-format';
import type { BodyCapture, NameValue, RequestLogEntry } from '~/lib/types';

export interface RequestLogDetailProps {
  entry: RequestLogEntry;
  onCopyBody?: (message: string) => void;
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        mt: 0.75,
        p: 0.75,
        minWidth: 0,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: 'background.default',
      }}
    >
      <Typography variant="caption" component="h3" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

export function Field({ label, value }: { label: string; value: string }) {
  return (
    <Typography
      variant="caption"
      sx={{ display: 'block', wordBreak: 'break-all' }}
    >
      <Box component="span" sx={{ color: 'text.secondary', mr: 0.5 }}>
        {label}
      </Box>
      {value}
    </Typography>
  );
}

export function HeaderList({
  headers,
  waiting,
}: {
  headers?: NameValue[];
  waiting?: boolean;
}) {
  if (waiting && !headers?.length) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        Waiting for response…
      </Typography>
    );
  }

  if (!headers?.length) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        No headers captured.
      </Typography>
    );
  }
  return (
    <>
      {(headers ?? []).map((header, i) => (
        <Typography
          key={`${header.name}-${i}`}
          variant="caption"
          sx={{ display: 'block', fontFamily: 'monospace', wordBreak: 'break-all' }}
        >
          {header.name}: {header.value}
        </Typography>
      ))}
    </>
  );
}

function bodyPanelState(
  body: BodyCapture | undefined,
  waiting?: boolean,
): {
  text: string;
  stored?: string;
  truncated?: boolean;
  canCopy: boolean;
} {
  if (waiting && !body) {
    return { text: 'Waiting for response…', canCopy: false };
  }
  if (!body || body.kind === 'empty') {
    return { text: 'No body', canCopy: false };
  }
  if (body.kind === 'binary') {
    return { text: 'Binary body — cannot display as text', canCopy: false };
  }
  if (body.kind === 'unavailable') {
    return { text: 'Body not available for this resource type', canCopy: false };
  }
  return {
    text: formatBodyForDisplay(body.text ?? ''),
    stored: body.text ?? '',
    truncated: body.truncated,
    canCopy: true,
  };
}

function BodyPanel({
  label,
  body,
  waiting,
  onCopyBody,
}: {
  label: string;
  body?: BodyCapture;
  waiting?: boolean;
  onCopyBody?: (message: string) => void;
}) {
  const state = bodyPanelState(body, waiting);
  const copy = async () => {
    if (!state.canCopy || state.stored == null) {
      onCopyBody?.('No text to copy.');
      return;
    }
    try {
      await navigator.clipboard.writeText(state.stored);
      onCopyBody?.(state.truncated ? 'Copied body (truncated)' : 'Copied body');
    } catch {
      onCopyBody?.('Could not copy body');
    }
  };
  return (
    <Box sx={{ mt: 0.5, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <IconButton
          size="small"
          aria-label={`Copy ${label.toLowerCase()}`}
          sx={{ borderRadius: 1, border: 1, borderColor: 'divider', px: 0.75, py: 0 }}
          onClick={() => void copy()}
          disabled={!state.canCopy}
        >
          <Typography variant="caption">Copy</Typography>
        </IconButton>
      </Box>
      <Box
        component="pre"
        sx={{
          m: 0,
          mt: 0.25,
          p: 0.5,
          maxHeight: 160,
          overflow: 'auto',
          bgcolor: 'action.hover',
          fontSize: 11,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {state.text}
        {state.truncated ? '\n…truncated' : ''}
      </Box>
    </Box>
  );
}

export default function RequestLogDetail({
  entry,
  onCopyBody,
}: RequestLogDetailProps) {
  const pending = entry.status === 'pending';
  const status =
    entry.status === 'pending' || entry.status === 'failed'
      ? entry.status
      : String(entry.status);
  const statusTone =
    entry.status === 'pending'
      ? 'warning.main'
      : entry.status === 'failed' ||
          (typeof entry.status === 'number' && entry.status >= 400)
        ? 'error.main'
        : 'success.main';
  const copyValue = async (value: string, success: string, failure: string) => {
    try {
      await navigator.clipboard.writeText(value);
      onCopyBody?.(success);
    } catch {
      onCopyBody?.(failure);
    }
  };
  return (
    <Box
      aria-label="Request log detail"
      sx={{ pt: 0.5, minWidth: 0, overflowX: 'auto' }}
    >
      <Section title="Overview">
        <Box
          aria-label="Request metadata"
          sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}
        >
          <Chip size="small" color="primary" variant="outlined" label={entry.method} />
          <Chip
            size="small"
            variant="outlined"
            label={`Status ${status}`}
            sx={{ color: statusTone, borderColor: statusTone }}
          />
          <Chip size="small" variant="outlined" label={entry.resourceType} />
        </Box>
        <Field label="Time" value={new Date(entry.startedAt).toLocaleTimeString()} />
        <Box sx={{ mt: 0.25, minWidth: 0 }}>
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', display: 'block' }}
          >
            URL
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, minWidth: 0 }}>
            <Typography
              component="code"
              variant="caption"
              sx={{ flex: 1, minWidth: 0, wordBreak: 'break-all' }}
            >
              {entry.url}
            </Typography>
            <IconButton
              size="small"
              aria-label="Copy request URL"
              title="Copy request URL"
              sx={{ borderRadius: 1, border: 1, borderColor: 'divider', px: 0.75, py: 0 }}
              onClick={() =>
                void copyValue(entry.url, 'Copied request URL', 'Could not copy request URL')
              }
            >
              <Typography variant="caption">Copy</Typography>
            </IconButton>
          </Box>
        </Box>
      </Section>
      <Section title="Request">
        <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
          Request headers
        </Typography>
        <HeaderList headers={entry.requestHeaders} />
        <BodyPanel
          label="Request body"
          body={entry.requestBody}
          onCopyBody={onCopyBody}
        />
      </Section>
      <Section title="Response">
        <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
          Response headers
        </Typography>
        <HeaderList headers={entry.responseHeaders} waiting={pending} />
        <BodyPanel
          label="Response body"
          body={entry.responseBody}
          waiting={pending}
          onCopyBody={onCopyBody}
        />
      </Section>
    </Box>
  );
}
