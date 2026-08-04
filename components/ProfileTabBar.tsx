import { useRef, useState } from 'react';
import {
  Avatar,
  Box,
  IconButton,
  Menu,
  MenuItem,
  Popover,
  Tab,
  Tabs,
  TextField,
} from '@mui/material';
import type { Profile } from '~/lib/types';

/**
 * Compact profile rail: one avatar badge per profile (initials), exactly one
 * active. Hover shows the full title; double-click / context menu renames via
 * a popover editor, duplicate, delete (blocked for the last profile, FR-010),
 * HTML5 drag-reorder (research R1), and MUI roving-tabindex arrow-key
 * navigation (FR-016). The Tab's accessible name stays the full title via
 * aria-label, so tests and screen readers still see profile names.
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

/** Up to two uppercase initials for the avatar badge. */
function initials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '?';
  }
  return words
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
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
  const [rename, setRename] = useState<{
    anchor: HTMLElement;
    index: number;
  } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // The rename popover commits on backdrop-close (blur-commit, legacy
  // behavior); Escape sets this flag so the close handler skips the commit.
  const renameCancelled = useRef(false);

  const openRename = (index: number, anchor: HTMLElement) => {
    renameCancelled.current = false;
    setRenameValue(profiles[index]?.title ?? '');
    setRename({ index, anchor });
  };
  const commitRename = () => {
    if (rename && !renameCancelled.current) {
      onRename(rename.index, renameValue);
    }
    setRename(null);
  };

  return (
    <Box
      sx={{
        width: 48,
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
          '& .MuiTabs-indicator': { width: 2 },
        }}
      >
        {profiles.map((profile, index) => (
          <Tab
            key={index}
            value={index}
            title={profile.title} // full name on hover
            aria-label={profile.title}
            label={
              <Avatar
                sx={{
                  width: 28,
                  height: 28,
                  fontSize: 12,
                  bgcolor:
                    index === selectedIndex ? 'primary.main' : undefined,
                }}
              >
                {initials(profile.title)}
              </Avatar>
            }
            draggable
            onDoubleClick={(e) => openRename(index, e.currentTarget)}
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
              minHeight: 40,
              minWidth: 0,
              p: 0.5,
            }}
          />
        ))}
      </Tabs>
      <IconButton
        size="small"
        aria-label="New profile"
        onClick={onCreate}
        sx={{ m: 0.5 }}
      >
        +
      </IconButton>
      <Menu
        anchorEl={menu?.anchor}
        open={menu != null}
        onClose={() => setMenu(null)}
        // Don't let the Menu hand focus back to the anchor tab on close —
        // with selectionFollowsFocus that would re-select the anchor,
        // overriding Duplicate/Delete's selection of another profile.
        disableRestoreFocus
      >
        <MenuItem
          onClick={() => {
            if (menu) {
              openRename(menu.index, menu.anchor);
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
      <Popover
        anchorEl={rename?.anchor ?? null}
        open={rename != null}
        onClose={commitRename}
        // Escape is stopped at the TextField (below) so it cancels instead
        // of committing; backdrop clicks close and commit (blur-commit).
        // Focus must not return to the anchor tab — selectionFollowsFocus
        // would turn a rename into a profile switch.
        disableRestoreFocus
        anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
        transformOrigin={{ vertical: 'center', horizontal: 'left' }}
      >
        <Box sx={{ p: 0.5 }}>
          <TextField
            size="small"
            autoFocus
            value={renameValue}
            slotProps={{ htmlInput: { 'aria-label': 'Rename profile' } }}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                commitRename();
              } else if (e.key === 'Escape') {
                renameCancelled.current = true;
                setRename(null);
              }
            }}
          />
        </Box>
      </Popover>
    </Box>
  );
}
