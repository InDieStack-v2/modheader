import type { ReactNode } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import { formatBodyForDisplay } from '~/lib/body-format';
import type { BodyCapture, NameValue, RequestLogEntry } from '~/lib/types';

export interface RequestLogDetailProps {
  entry: RequestLogEntry;
  onCopyBody?: (message: string) => void;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Box sx={{ mt: 0.75, minWidth: 0 }}>
      <Typography variant="caption" component="h3" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function Field({ label, value }: { label: string; value: string }) {
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

function HeaderList({
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
  return (
    <Box
      aria-label="Request log detail"
      sx={{ pt: 0.5, minWidth: 0, overflowX: 'auto' }}
    >
      <Section title="Overview">
        <Field label="Method" value={entry.method} />
        <Field label="Status" value={status} />
        <Field label="Type" value={entry.resourceType} />
        <Field label="Time" value={new Date(entry.startedAt).toLocaleTimeString()} />
        <Field label="URL" value={entry.url} />
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
