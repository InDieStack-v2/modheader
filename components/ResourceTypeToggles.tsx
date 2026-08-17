import { Box, Chip } from '@mui/material';
import {
  STANDARD_RESOURCE_TYPES,
  toggleResourceType,
} from '~/lib/resource-types';

export interface ResourceTypeTogglesProps {
  value: string[];
  mode: 'logs' | 'capture';
  onChange: (next: string[]) => void;
  'aria-label'?: string;
}

export default function ResourceTypeToggles({
  value,
  mode,
  onChange,
  'aria-label': ariaLabel,
}: ResourceTypeTogglesProps) {
  const allOn = mode === 'logs' && value.length === 0;

  return (
    <Box
      role="group"
      aria-label={ariaLabel ?? 'Resource types'}
      sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}
    >
      {mode === 'logs' ? (
        <Chip
          size="small"
          label="All"
          color={allOn ? 'primary' : 'default'}
          variant={allOn ? 'filled' : 'outlined'}
          onClick={() => onChange(toggleResourceType(value, 'all', mode))}
          aria-pressed={allOn}
        />
      ) : null}
      {STANDARD_RESOURCE_TYPES.map((type) => {
        const selected = allOn ? false : value.includes(type.value);
        return (
          <Chip
            key={type.value}
            size="small"
            label={type.shortLabel}
            color={selected ? 'primary' : 'default'}
            variant={selected ? 'filled' : 'outlined'}
            onClick={() => onChange(toggleResourceType(value, type.value, mode))}
            aria-pressed={selected}
            aria-label={type.label}
          />
        );
      })}
    </Box>
  );
}
