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
import ResourceTypeToggles from './ResourceTypeToggles';

/**
 * URL and resource-type filter editor — resource types use shared
 * ResourceTypeToggles (spec 004).
 */
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
    <Box sx={{ mb: 0.5 }}>
      <Typography variant="subtitle2" sx={{ mb: 0.25, lineHeight: 1.4 }}>
        Filters
      </Typography>
      {filters.map((filter, index) => (
        <Box
          key={index}
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}
        >
          <Checkbox
            size="small"
            checked={filter.enabled}
            onChange={(e) =>
              updateFilter(index, { ...filter, enabled: e.target.checked })
            }
          />
          <FormControl size="small" sx={{ minWidth: 110 }}>
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
              sx={{ '& .MuiInputBase-input': { py: 0.25, px: 0.75 } }}
            />
          )}
          {filter.type === 'types' && (
            <ResourceTypeToggles
              mode="capture"
              value={(filter as TypeFilter).resourceType}
              aria-label="Capture resource types"
              onChange={(resourceType) =>
                updateFilter(index, { ...filter, resourceType })
              }
            />
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
