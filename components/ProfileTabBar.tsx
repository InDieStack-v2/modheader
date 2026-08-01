import { useState } from 'react';
import {
  Box,
  Button,
  Menu,
  MenuItem,
  Tab,
  Tabs,
  TextField,
} from '@mui/material';
import type { Profile } from '~/lib/types';

/**
 * Vertical profile tab bar (spec 002 US2): one tab per profile, exactly one
 * active. Inline rename (double-click / context menu), duplicate, delete
 * (blocked for the last profile, FR-010), HTML5 drag-reorder (research R1),
 * and MUI roving-tabindex arrow-key navigation (FR-016). Contract:
 * specs/002-compact-ui-redesign/contracts/ui-components.md
 */
export interface ProfileTabBarProps {
  profiles: Profile[];
  /** Index of the active profile; always valid (FR-005, FR-010). */
  selectedIndex: number;
  onSelect: (index: number) => void;
  onCreate: () => void;
  onDuplicate: (index: number) => void;
  /** Duplicate titles allowed; no validation (Clarifications 2026-08-01). */
  onRename: (index: number, title: string) => void;
  /** Never called for the last remaining profile (Delete is disabled). */
  onDelete: (index: number) => void;
  onReorder: (from: number, to: number) => void;
}

export default function ProfileTabBar({
  profiles,
  selectedIndex,
  onSelect,
  onCreate,
  onDuplicate,
  onRename,
  onDelete,
  onReorder,
}: ProfileTabBarProps) {
  const [menu, setMenu] = useState<{ anchor: HTMLElement; index: number } | null>(
    null,
  );
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const commitRename = (index: number, title: string) => {
    setRenamingIndex(null);
    onRename(index, title);
  };

  return (
    <Box
      sx={{
        width: 160,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRight: 1,
        borderColor: 'divider',
      }}
    >
      <Tabs
        orientation="vertical"
        value={selectedIndex}
        onChange={(_event, index: number) => onSelect(index)}
        // Arrow keys move focus AND selection (FR-016).
        selectionFollowsFocus
        sx={{
          flexGrow: 1,
          minHeight: 0,
          overflowY: 'auto',
          maxHeight: '100vh',
          alignItems: 'stretch',
        }}
      >
        {profiles.map((profile, index) => (
          <Tab
            key={index}
            value={index}
            title={profile.title} // full name on hover (long titles truncate)
            label={
              renamingIndex === index ? (
                // Rendered as the Tab label — NOT as a Tabs child — because
                // MUI Tabs injects `value={index}` into direct children,
                // which would hijack a sibling TextField's value prop.
                <TextField
                  size="small"
                  autoFocus
                  defaultValue={profile.title}
                  slotProps={{ htmlInput: { 'aria-label': 'Rename profile' } }}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => commitRename(index, e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      commitRename(index, (e.target as HTMLInputElement).value);
                    } else if (e.key === 'Escape') {
                      setRenamingIndex(null);
                    }
                  }}
                  sx={{ width: '100%' }}
                />
              ) : (
                <Box
                  component="span"
                  sx={{
                    display: 'block',
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {profile.title}
                </Box>
              )
            }
            draggable={renamingIndex !== index}
            onDoubleClick={() => setRenamingIndex(index)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ anchor: e.currentTarget, index });
            }}
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex != null && dragIndex !== index) {
                onReorder(dragIndex, index);
              }
              setDragIndex(null);
            }}
            sx={{
              minHeight: 36,
              py: 0,
              px: 1,
              textTransform: 'none',
              alignItems: 'flex-start',
            }}
          />
        ))}
      </Tabs>
      <Button size="small" onClick={onCreate} sx={{ mx: 0.5, mb: 0.5 }}>
        + New profile
      </Button>
      <Menu
        anchorEl={menu?.anchor}
        open={menu != null}
        onClose={() => setMenu(null)}
        // Don't let the Menu hand focus back to the anchor tab on close —
        // it would instantly blur (and commit) the inline rename field.
        disableRestoreFocus
      >
        <MenuItem
          onClick={() => {
            if (menu) {
              setRenamingIndex(menu.index);
            }
            setMenu(null);
          }}
        >
          Rename
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu) {
              onDuplicate(menu.index);
            }
            setMenu(null);
          }}
        >
          Duplicate
        </MenuItem>
        <MenuItem
          disabled={profiles.length <= 1}
          onClick={() => {
            if (menu) {
              onDelete(menu.index);
            }
            setMenu(null);
          }}
        >
          Delete
        </MenuItem>
      </Menu>
    </Box>
  );
}
