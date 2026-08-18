import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Snackbar,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { browser } from 'wxt/browser';
import HeaderTable from '~/components/HeaderTable';
import FilterEditor from '~/components/FilterEditor';
import ProfileTabBar from '~/components/ProfileTabBar';
import SettingsDialog from '~/components/SettingsDialog';
import ImportExportDialog from '~/components/ImportExportDialog';
import CloudBackupDialog from '~/components/CloudBackupDialog';
import RequestLogList from '~/components/RequestLogList';
import {
  MAX_SESSION_RULES,
  REQUEST_HEADER_NAMES,
  RESPONSE_HEADER_NAMES,
} from '~/lib/constants';
import { compileProfileToRules } from '~/lib/dnr';
import { cloneProfile, createProfile, reorderProfiles } from '~/lib/profiles';
import {
  clearRuntimeState,
  getRuntimeState,
  setProfiles,
  setRuntimeState,
  subscribeRuntimeState,
} from '~/lib/storage';
import type {
  HeaderRule,
  Profile,
  RequestLogState,
  RuntimeState,
  UnsupportedNotice,
} from '~/lib/types';
import { profileHasEnabledRules } from '~/lib/request-match';
import { visibleEntries } from '~/lib/resource-types';
import {
  clearEntries,
  dropAt,
  ensureSlots,
  getRequestLogState,
  insertSlot,
  remapOnReorder,
  setRecording,
  subscribeRequestLog,
  syncRecordingWithPatching,
} from '~/lib/session-log';

function noticeMessage(notice: UnsupportedNotice): string {
  switch (notice.reason) {
    case 'response-append':
      return `Append mode is not supported for response header "${notice.header}" — it will override (set) instead.`;
    case 'non-re2-filter':
      return `URL filter "${notice.header}" is not RE2-compatible and will be skipped.`;
    case 'denied-header':
      return `Header "${notice.header}" cannot be modified by the browser and will be skipped.`;
    case 'rule-limit':
      return `Rule limit (${MAX_SESSION_RULES}) exceeded — extra rules were dropped.`;
  }
}

/**
 * Popup root (spec 002 compact redesign): left profile tab bar + compact
 * workspace. Loads profiles + runtime state, subscribes to changes, and saves
 * every edit to storage.local immediately (save-on-change, T021). Profile
 * deletion is immediate with an undo snackbar (FR-017).
 */
export default function App() {
  const [state, setState] = useState<RuntimeState | null>(null);
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ioMode, setIoMode] = useState<'import' | 'export' | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const [undoBuffer, setUndoBuffer] = useState<{
    profile: Profile;
    index: number;
  } | null>(null);
  const [snackbar, setSnackbar] = useState<{
    message: string;
    buttonText?: string;
    kind?: 'undo-delete';
  } | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<'headers' | 'logs'>(
    'headers',
  );
  const [logState, setLogState] = useState<RequestLogState>({
    recording: [],
    entries: [],
    typeFilter: [],
  });
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const notify = (message: string) => setSnackbar({ message });

  useEffect(() => {
    void (async () => {
      const loaded = await getRuntimeState();
      if (loaded.profiles.length === 0) {
        // Legacy behavior: always start with at least one profile.
        const profiles = [createProfile()];
        await setProfiles(profiles);
        loaded.profiles = profiles;
      }
      setState(loaded);
    })();
    return subscribeRuntimeState((fresh) => {
      setState((prev) => {
        if (!prev) {
          return fresh;
        }
        const merged: RuntimeState = {
          ...fresh,
          profiles: prev.profiles,
          selectedProfileIndex: prev.selectedProfileIndex,
        };
        return JSON.stringify(merged) === JSON.stringify(prev) ? prev : merged;
      });
    });
  }, []);

  useEffect(() => {
    void getRequestLogState().then(setLogState);
    return subscribeRequestLog(setLogState);
  }, []);

  useEffect(() => {
    setWorkspaceTab('headers');
    setExpandedLogId(null);
  }, [state?.selectedProfileIndex]);

  useEffect(() => {
    if (workspaceTab !== 'logs') {
      setExpandedLogId(null);
    }
  }, [workspaceTab]);

  useEffect(() => {
    if (state?.profiles.length) {
      void ensureSlots(state.profiles.length);
    }
  }, [state?.profiles.length]);

  const recordingReady = state != null;
  const recordingIndex =
    state && state.selectedProfileIndex < state.profiles.length
      ? state.selectedProfileIndex
      : 0;
  const recordingPaused = state?.isPaused ?? false;
  const recordingHasRules = state?.profiles[recordingIndex]
    ? profileHasEnabledRules(state.profiles[recordingIndex]!)
    : false;

  useEffect(() => {
    if (!expandedLogId) {
      return;
    }
    const entries = logState.entries[recordingIndex] ?? [];
    const filter = logState.typeFilter[recordingIndex] ?? [];
    if (!visibleEntries(entries, filter).some((entry) => entry.id === expandedLogId)) {
      setExpandedLogId(null);
    }
  }, [expandedLogId, logState, recordingIndex]);

  useEffect(() => {
    if (!recordingReady) {
      return;
    }
    void syncRecordingWithPatching({
      paused: recordingPaused,
      selectedIndex: recordingIndex,
      selectedHasRules: recordingHasRules,
    });
  }, [recordingReady, recordingPaused, recordingIndex, recordingHasRules]);

  if (!state) {
    return null; // loading
  }
  const profileIndex =
    state.selectedProfileIndex < state.profiles.length
      ? state.selectedProfileIndex
      : 0;
  const profile = state.profiles[profileIndex];

  // T021: every edit is written straight through to storage.local so the
  // background recompiles DNR rules immediately. Local state is updated
  // optimistically first: controlled inputs must see their own edits in the
  // same render, or the storage round trip resets cursor/selection/undo.
  const saveProfiles = (profiles: Profile[], selectedIndex?: number) => {
    setState((prev) =>
      prev
        ? {
            ...prev,
            profiles,
            selectedProfileIndex:
              selectedIndex ?? prev.selectedProfileIndex,
            }
        : prev,
    );
    void (async () => {
      await setProfiles(profiles);
      if (selectedIndex !== undefined) {
        await setRuntimeState({ selectedProfileIndex: selectedIndex });
      }
    })();
  };
  const saveProfile = (updated: Profile) => {
    saveProfiles(
      state.profiles.map((p, i) => (i === profileIndex ? updated : p)),
    );
  };

  // --- Profile tab bar handlers (spec 002 US2) ---

  const selectProfile = (index: number) => {
    // Optimistic: the subscription deliberately ignores our own echoes.
    setState((prev) =>
      prev ? { ...prev, selectedProfileIndex: index } : prev,
    );
    void setRuntimeState({ selectedProfileIndex: index });
  };
  const addProfile = () => {
    const profiles = [...state.profiles, createProfile(state.profiles)];
    void ensureSlots(profiles.length);
    saveProfiles(profiles, profiles.length - 1);
  };
  const duplicateProfile = (index: number) => {
    const profiles = [...state.profiles, cloneProfile(state.profiles[index]!)];
    void ensureSlots(profiles.length);
    saveProfiles(profiles, profiles.length - 1);
  };
  const renameProfile = (index: number, title: string) => {
    saveProfiles(
      state.profiles.map((p, i) => (i === index ? { ...p, title } : p)),
    );
  };
  const reorderProfile = (from: number, to: number) => {
    const profiles = reorderProfiles(state.profiles, from, to);
    // The active profile stays active after the move.
    let selected = profileIndex;
    if (profileIndex === from) {
      selected = to;
    } else if (from < profileIndex && to >= profileIndex) {
      selected = profileIndex - 1;
    } else if (from > profileIndex && to <= profileIndex) {
      selected = profileIndex + 1;
    }
    void remapOnReorder(from, to);
    saveProfiles(profiles, selected);
  };
  const deleteProfile = (index: number) => {
    if (state.profiles.length <= 1) {
      return; // FR-010: an active profile always exists.
    }
    const removed = state.profiles[index]!;
    const profiles = state.profiles.filter((_, i) => i !== index);
    let selected = profileIndex;
    if (index === profileIndex) {
      selected = Math.min(index, profiles.length - 1); // nearest remaining
    } else if (index < profileIndex) {
      selected = profileIndex - 1;
    }
    setUndoBuffer({ profile: removed, index });
    void dropAt(index);
    saveProfiles(profiles, selected);
    setSnackbar({ message: 'Profile deleted', buttonText: 'Undo', kind: 'undo-delete' });
  };
  const undoDelete = () => {
    if (!undoBuffer) {
      return;
    }
    const profiles = [...state.profiles];
    profiles.splice(
      Math.min(undoBuffer.index, profiles.length),
      0,
      undoBuffer.profile,
    );
    setUndoBuffer(null);
    setSnackbar(null);
    void insertSlot(undoBuffer.index);
    saveProfiles(profiles, undoBuffer.index);
  };

  // --- Global state controls ---

  const pause = () => {
    void setRuntimeState({ isPaused: true });
    notify('ModHeaderX paused');
  };
  const play = () => {
    void clearRuntimeState(['isPaused']);
    notify('ModHeaderX unpaused');
  };
  const lockToTab = () => {
    void (async () => {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab?.id != null) {
        await setRuntimeState({ lockedTabId: tab.id });
        notify('Restricted ModHeaderX to the current tab');
      }
    })();
  };
  const unlockAllTab = () => {
    void clearRuntimeState(['lockedTabId']);
    notify('Applying ModHeaderX to all tabs');
  };

  if (!profile) {
    return null;
  }

  // T033: surface graceful-degradation notices from the DNR compiler.
  const { unsupported } = compileProfileToRules(
    profile,
    state.isPaused ?? false,
    state.lockedTabId ?? null,
  );

  return (
    <Box sx={{ width: 720, display: 'flex' }}>
      <ProfileTabBar
        profiles={state.profiles}
        selectedIndex={profileIndex}
        onSelect={selectProfile}
        onCreate={addProfile}
        onDuplicate={duplicateProfile}
        onRename={renameProfile}
        onDelete={deleteProfile}
        onReorder={reorderProfile}
      />

      <Box sx={{ flexGrow: 1, minWidth: 0, position: 'relative' }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            minHeight: 32,
            px: 0.5,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Typography
            variant="body2"
            noWrap
            title={profile.title}
            sx={{ px: 0.5, fontWeight: 500 }}
          >
            {profile.title}
          </Typography>
          <Typography
            variant="caption"
            noWrap
            color="text.secondary"
            sx={{ flexShrink: 0 }}
          >
            v{browser.runtime.getManifest().version}
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          {state.isPaused ? (
            <Chip
              size="small"
              color="warning"
              label="Paused"
              onClick={play}
              aria-label="Play"
            />
          ) : (
            <IconButton size="small" aria-label="Pause" onClick={pause}>
              ❚❚
            </IconButton>
          )}
          {logState.recording[profileIndex] ? (
            <Chip
              size="small"
              color="error"
              label="Recording"
              aria-label="Recording"
            />
          ) : null}
          {state.lockedTabId != null ? (
            <Chip
              size="small"
              color="info"
              label="Tab locked"
              onClick={unlockAllTab}
              aria-label="Unlock"
            />
          ) : (
            <IconButton size="small" aria-label="Tab lock" onClick={lockToTab}>
              🔒
            </IconButton>
          )}
          <IconButton
            size="small"
            aria-label="More"
            onClick={(e) => setMoreAnchor(e.currentTarget)}
          >
            ⋮
          </IconButton>
          <Menu
            anchorEl={moreAnchor}
            open={moreAnchor != null}
            onClose={() => setMoreAnchor(null)}
          >
            <MenuItem
              onClick={() => {
                setMoreAnchor(null);
                setSettingsOpen(true);
              }}
            >
              Profile settings
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMoreAnchor(null);
                setIoMode('export');
              }}
            >
              Export profile
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMoreAnchor(null);
                setIoMode('import');
              }}
            >
              Import profile
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMoreAnchor(null);
                setBackupOpen(true);
              }}
            >
              Cloud backup
            </MenuItem>
          </Menu>
        </Box>

        {unsupported.map((notice, i) => (
          <Alert severity="warning" sx={{ borderRadius: 0, py: 0 }} key={i}>
            {noticeMessage(notice)}
          </Alert>
        ))}

        <Tabs
          value={workspaceTab}
          onChange={(_e, value: 'headers' | 'logs') => setWorkspaceTab(value)}
          aria-label="Workspace"
          sx={{ minHeight: 32, px: 0.5 }}
        >
          <Tab
            value="headers"
            label="Headers"
            sx={{ minHeight: 32, py: 0 }}
          />
          <Tab
            value="logs"
            label={
              logState.recording[profileIndex]
                ? 'Logs · rec'
                : 'Logs'
            }
            sx={{ minHeight: 32, py: 0 }}
          />
        </Tabs>

        {workspaceTab === 'headers' ? (
        <Box sx={{ px: 1, py: 0.25 }}>
          <FilterEditor
            filters={profile.filters}
            activeTabUrl={state.activeTabUrl}
            onChange={(filters) => saveProfile({ ...profile, filters })}
          />
          <HeaderTable
            title="Request Headers"
            headers={profile.headers}
            headerNames={REQUEST_HEADER_NAMES}
            hideComment={profile.hideComment !== false}
            onChange={(headers: HeaderRule[]) =>
              saveProfile({ ...profile, headers })
            }
          />
          <HeaderTable
            title="Response Headers"
            headers={profile.respHeaders}
            headerNames={RESPONSE_HEADER_NAMES}
            hideComment={profile.hideComment !== false}
            onChange={(respHeaders: HeaderRule[]) =>
              saveProfile({ ...profile, respHeaders })
            }
          />
        </Box>
        ) : (
          <RequestLogList
            profileIndex={profileIndex}
            recording={logState.recording[profileIndex] === true}
            canRecord={!recordingPaused && recordingHasRules}
            entries={logState.entries[profileIndex] ?? []}
            typeFilter={logState.typeFilter[profileIndex] ?? []}
            onToggleRecording={() => {
              const turningOn = logState.recording[profileIndex] !== true;
              if (turningOn && (recordingPaused || !recordingHasRules)) {
                return;
              }
              void setRecording(profileIndex, turningOn);
            }}
            onClear={() => {
              setExpandedLogId(null);
              void clearEntries(profileIndex);
            }}
            onCopyCurl={notify}
            expandedId={expandedLogId}
            onExpand={setExpandedLogId}
          />
        )}

      <Snackbar
        open={snackbar != null}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        autoHideDuration={snackbar?.kind === 'undo-delete' ? 5000 : 3000}
        onClose={() => {
          setSnackbar(null);
          setUndoBuffer(null);
        }}
        message={snackbar?.message}
        sx={{ position: 'absolute', bottom: 12, left: 0, right: 0 }}
        slotProps={{
          content: {
            sx: {
              bgcolor: 'background.paper',
              color: 'text.primary',
              border: 1,
              borderColor: 'divider',
              justifyContent: 'center',
              textAlign: 'center',
              '& .MuiSnackbarContent-message': {
                flex: '1 1 auto',
                textAlign: 'center',
                width: '100%',
              },
            },
          },
        }}
        action={
          snackbar?.kind === 'undo-delete' ? (
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                undoDelete();
              }}
            >
              {snackbar.buttonText}
            </Button>
          ) : undefined
        }
      />
      </Box>

      <SettingsDialog
        open={settingsOpen}
        profile={profile}
        onChange={saveProfile}
        onClose={() => setSettingsOpen(false)}
      />
      <ImportExportDialog
        open={ioMode != null}
        mode={ioMode ?? 'export'}
        profile={profile}
        onClose={() => setIoMode(null)}
        onImport={saveProfile}
        onNotify={notify}
      />
      <CloudBackupDialog
        open={backupOpen}
        currentProfiles={state.profiles}
        onClose={() => setBackupOpen(false)}
        onRestore={(profiles) => saveProfiles(profiles, 0)}
        onNotify={notify}
      />
    </Box>
  );
}
