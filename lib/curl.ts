import type { RequestLogEntry } from './types';

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function toCurl(entry: RequestLogEntry): {
  command: string;
  bodyOmitted: boolean;
} {
  const parts = ['curl', '-X', entry.method.toUpperCase(), shellQuote(entry.url)];
  for (const header of entry.requestHeaders) {
    parts.push('-H', shellQuote(`${header.name}: ${header.value}`));
  }
  let bodyOmitted = false;
  if (entry.requestBody?.kind === 'text' && entry.requestBody.text) {
    parts.push('--data-raw', shellQuote(entry.requestBody.text));
  } else if (entry.requestBody?.kind === 'binary') {
    bodyOmitted = true;
  }
  return { command: parts.join(' '), bodyOmitted };
}
