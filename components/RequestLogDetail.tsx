import { Box, Typography } from '@mui/material';
import type { BodyCapture, NameValue, RequestLogEntry } from '~/lib/types';

export interface RequestLogDetailProps {
  entry: RequestLogEntry;
}

function HeaderBlock({
  title,
  headers,
  waiting,
}: {
  title: string;
  headers?: NameValue[];
  waiting?: boolean;
}) {
  return (
    <Box sx={{ mt: 0.75 }}>
      <Typography variant="caption" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      {waiting && !headers?.length ? (
        <Typography variant="caption" sx={{ display: 'block' }} color="text.secondary">
          Waiting for response…
        </Typography>
      ) : (
        (headers ?? []).map((header, i) => (
          <Typography
            key={`${header.name}-${i}`}
            variant="caption"
            sx={{ display: 'block', fontFamily: 'monospace', wordBreak: 'break-all' }}
          >
            {header.name}: {header.value}
          </Typography>
        ))
      )}
    </Box>
  );
}

function BodyBlock({ title, body, waiting }: {
  title: string;
  body?: BodyCapture;
  waiting?: boolean;
}) {
  let text = '';
  if (waiting && !body) {
    text = 'Waiting for response…';
  } else if (!body || body.kind === 'empty') {
    text = 'No body';
  } else if (body.kind === 'binary') {
    text = 'Binary body — cannot display as text';
  } else if (body.kind === 'unavailable') {
    text = 'Body not available for this resource type';
  } else {
    text = body.text ?? '';
    if (body.truncated) {
      text += '\n…truncated';
    }
  }
  return (
    <Box sx={{ mt: 0.75 }}>
      <Typography variant="caption" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
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
        {text}
      </Box>
    </Box>
  );
}

export default function RequestLogDetail({ entry }: RequestLogDetailProps) {
  const pending = entry.status === 'pending';
  return (
    <Box sx={{ pt: 0.5 }}>
      <HeaderBlock title="Request headers" headers={entry.requestHeaders} />
      <HeaderBlock
        title="Response headers"
        headers={entry.responseHeaders}
        waiting={pending}
      />
      <BodyBlock title="Request body" body={entry.requestBody} />
      <BodyBlock
        title="Response body"
        body={entry.responseBody}
        waiting={pending}
      />
    </Box>
  );
}
