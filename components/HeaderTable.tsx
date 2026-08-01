import { useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Link,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type { HeaderRule } from '~/lib/types';

/**
 * Editable header rows (T020) with column sorting and a comment column (T029):
 * enabled checkbox, autocomplete name, value, optional comment, delete with
 * ensure-non-empty, and an add row button — port of the legacy header section
 * (src/popup.html:210-315) and SortingController (src/scripts/main.js:529-540).
 */

function emptyHeader(): HeaderRule {
  // Legacy addHeader creates an enabled empty row.
  return { enabled: true, name: '', value: '', comment: '' };
}

type SortPredicate = 'name' | 'value' | 'comment';

export interface HeaderTableProps {
  title: string;
  headers: HeaderRule[];
  headerNames: readonly string[];
  /** Legacy `hideComment` toggle (default true). */
  hideComment?: boolean;
  onChange: (headers: HeaderRule[]) => void;
}

export default function HeaderTable({
  title,
  headers,
  headerNames,
  hideComment = true,
  onChange,
}: HeaderTableProps) {
  const [predicate, setPredicate] = useState<SortPredicate | null>(null);
  const [reverse, setReverse] = useState(false);

  const updateRow = (index: number, patch: Partial<HeaderRule>) => {
    onChange(headers.map((h, i) => (i === index ? { ...h, ...patch } : h)));
  };

  const removeRow = (index: number) => {
    const next = headers.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : [emptyHeader()]);
  };

  const addRow = () => {
    onChange([...headers, emptyHeader()]);
  };

  // Legacy SortingController: same predicate toggles direction, persisted order.
  const sortBy = (next: SortPredicate) => {
    const nextReverse = predicate === next ? !reverse : false;
    setPredicate(next);
    setReverse(nextReverse);
    const sorted = [...headers].sort((a, b) => {
      const cmp = (a[next] ?? '').localeCompare(b[next] ?? '');
      return nextReverse ? -cmp : cmp;
    });
    onChange(sorted);
  };

  const sortLabel = (column: SortPredicate, label: string) => (
    <Link
      component="button"
      variant="body2"
      underline="hover"
      color="inherit"
      onClick={() => sortBy(column)}
      sx={{ fontWeight: predicate === column ? 'bold' : 'normal' }}
    >
      {label}
      {predicate === column ? (reverse ? ' ▲' : ' ▼') : ''}
    </Link>
  );

  return (
    <Box sx={{ mb: 1 }}>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        {title}
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox" />
            <TableCell>{sortLabel('name', 'Name')}</TableCell>
            <TableCell>{sortLabel('value', 'Value')}</TableCell>
            {!hideComment && (
              <TableCell>{sortLabel('comment', 'Comment')}</TableCell>
            )}
            <TableCell padding="checkbox" />
          </TableRow>
        </TableHead>
        <TableBody>
          {headers.map((row, index) => (
            <TableRow key={index}>
              <TableCell padding="checkbox">
                <Checkbox
                  size="small"
                  checked={row.enabled}
                  onChange={(e) => updateRow(index, { enabled: e.target.checked })}
                />
              </TableCell>
              <TableCell>
                <Autocomplete
                  freeSolo
                  size="small"
                  options={headerNames as string[]}
                  inputValue={row.name}
                  onInputChange={(_event, value) =>
                    updateRow(index, { name: value })
                  }
                  renderInput={(params) => (
                    <TextField {...params} placeholder="Header name" size="small" />
                  )}
                  sx={{ minWidth: 180 }}
                />
              </TableCell>
              <TableCell>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Value (empty = remove header)"
                  value={row.value}
                  onChange={(e) => updateRow(index, { value: e.target.value })}
                />
              </TableCell>
              {!hideComment && (
                <TableCell>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="Comment"
                    value={row.comment ?? ''}
                    onChange={(e) => updateRow(index, { comment: e.target.value })}
                  />
                </TableCell>
              )}
              <TableCell padding="checkbox">
                <Button size="small" onClick={() => removeRow(index)}>
                  ✕
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button size="small" onClick={addRow} sx={{ mt: 0.5 }}>
        + Add
      </Button>
    </Box>
  );
}
