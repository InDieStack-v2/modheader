import {
  Box,
  Button,
  Checkbox,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import { isRe2Compatible } from '~/lib/dnr';
import type { Filter, TypeFilter, UrlFilter } from '~/lib/types';

/**
 * URL and resource-type filter editor (T028) — port of the legacy filter UI
 * (src/popup.html:316-359) and filter ops (src/scripts/main.js:44-56).
 * URL patterns are stored as `urlRegex`; legacy wildcard `urlPattern` values
 * are converted on import/migration (fixLegacyProfile). Non-RE2 patterns show
 * a warning and are skipped by the DNR compiler (non-re2-filter notice).
 */

/** Resource types offered by the legacy UI (src/popup.html:344-351). */
const RESOURCE_TYPES: { value: string; label: string }[] = [
  { value: 'main_frame', label: 'Main Frame' },
  { value: 'sub_frame', label: 'Sub Frame' },
  { value: 'stylesheet', label: 'Stylesheet' },
  { value: 'script', label: 'Script' },
  { value: 'image', label: 'Image' },
  { value: 'object', label: 'Object' },
  { value: 'xmlhttprequest', label: 'XmlHttpRequest' },
  { value: 'other', label: 'Other' },
];

export interface FilterEditorProps {
  filters: Filter[];
  /** Best-effort active tab URL, used to prefill new URL filters (legacy behavior). */
  activeTabUrl?: string;
  onChange: (filters: Filter[]) => void;
}

function defaultUrlRegex(activeTabUrl?: string): string {
  // Legacy addFilter: origin of the current tab + '/.*'.
  try {
    if (activeTabUrl) {
      return `${new URL(activeTabUrl).origin}/.*`;
    }
  } catch {
    // fall through
  }
  return '';
}

export default function FilterEditor({
  filters,
  activeTabUrl,
  onChange,
}: FilterEditorProps) {
  const updateFilter = (index: number, next: Filter) => {
    onChange(filters.map((f, i) => (i === index ? next : f)));
  };

  const removeFilter = (index: number) => {
    onChange(filters.filter((_, i) => i !== index));
  };

  const addFilter = () => {
    const filter: UrlFilter = {
      enabled: true,
      type: 'urls',
      urlRegex: defaultUrlRegex(activeTabUrl),
    };
    onChange([...filters, filter]);
  };

  const changeType = (index: number, filter: Filter, type: 'urls' | 'types') => {
    if (type === filter.type) {
      return;
    }
    if (type === 'urls') {
      updateFilter(index, {
        enabled: filter.enabled,
        type: 'urls',
        urlRegex: defaultUrlRegex(activeTabUrl),
      });
    } else {
      updateFilter(index, {
        enabled: filter.enabled,
        type: 'types',
        resourceType: ['main_frame'],
      });
    }
  };

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
        Filters
      </Typography>
      {filters.map((filter, index) => (
        <Box
          key={index}
          sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}
        >
          <Checkbox
            size="small"
            checked={filter.enabled}
            onChange={(e) =>
              updateFilter(index, { ...filter, enabled: e.target.checked })
            }
          />
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>Type</InputLabel>
            <Select
              label="Type"
              value={filter.type}
              onChange={(e) =>
                changeType(index, filter, e.target.value as 'urls' | 'types')
              }
            >
              <MenuItem value="urls">URL Pattern</MenuItem>
              <MenuItem value="types">Resource Type</MenuItem>
            </Select>
          </FormControl>
          {filter.type === 'urls' && (
            <TextField
              size="small"
              fullWidth
              placeholder=".*://.*.google.com/.*"
              value={filter.urlRegex}
              error={!isRe2Compatible(filter.urlRegex)}
              helperText={
                isRe2Compatible(filter.urlRegex)
                  ? undefined
                  : 'Not RE2-compatible — this filter will be skipped'
              }
              onChange={(e) =>
                updateFilter(index, { ...filter, urlRegex: e.target.value })
              }
            />
          )}
          {filter.type === 'types' && (
            <FormControl size="small" fullWidth>
              <InputLabel>Resource Type</InputLabel>
              <Select
                multiple
                label="Resource Type"
                value={(filter as TypeFilter).resourceType}
                onChange={(e) =>
                  updateFilter(index, {
                    ...filter,
                    resourceType: e.target.value as string[],
                  })
                }
              >
                {RESOURCE_TYPES.map((rt) => (
                  <MenuItem key={rt.value} value={rt.value}>
                    {rt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <Button size="small" onClick={() => removeFilter(index)}>
            ✕
          </Button>
        </Box>
      ))}
      <Button size="small" onClick={addFilter}>
        + Add filter
      </Button>
    </Box>
  );
}
