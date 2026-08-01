import { useEffect, useState } from 'react';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Drawer,
  Menu,
  MenuItem,
  Snackbar,
  TextField,
  Toolbar,
} from '@mui/material';
import { browser } from 'wxt/browser';
import HeaderTable from '~/components/HeaderTable';
import FilterEditor from '~/components/FilterEditor';
import ProfileList from '~/components/ProfileList';
import SettingsDialog from '~/components/SettingsDialog';
import ImportExportDialog from '~/components/ImportExportDialog';
import CloudBackupDialog from '~/components/CloudBackupDialog';
import {
  MAX_SESSION_RULES,
  REQUEST_HEADER_NAMES,
  RESPONSE_HEADER_NAMES,
} from '~/lib/constants';
import { compileProfileToRules } from '~/lib/dnr';
import { cloneProfile, createProfile } from '~/lib/profiles';
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
  RuntimeState,
  UnsupportedNotice,
} from '~/lib/types';

/** Rotating tips, ported from src/scripts/main.js:561-585. */
const TIPS: { text: string; buttonText?: string; url?: string }[] = [
  { text: 'Tip: You can switch between multiple profile' },
  { text: 'Tip: You can export your profile to share with others' },
  { text: 'Tip: Tab lock will apply the modification only to locked tab' },
  { text: 'Tip: Add filter will let you use regex to limit modification' },
  { text: 'Tip: Use the checkbox to quickly toggle header modification' },
  { text: 'Tip: Click on the column name to sort' },
  { text: 'Tip: Add filter also allows you to filter by resource type' },
  { text: 'Tip: Go to profile setting to toggle comment column' },
  { text: 'Tip: Append header value to existing one in profile setting' },
  { text: 'Tip: Pause button will temporarily pause all modifications' },
  { text: 'Tip: Go to cloud backup to retrieve your auto-synced profile' },
  {
    text: 'If you like ModHeader, please consider donating',
    buttonText: 'Donate',
    url: 'https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=3XFKZ8PCRB8P6&currency_code=USD&amount=5&source=url',
  },
  {
    text: 'Enjoying ModHeader, leave us a review',
    buttonText: 'Review',
    url: navigator.userAgent.includes('Firefox')
      ? 'https://addons.mozilla.org/firefox/addon/modheader-firefox/'
      : 'https://chrome.google.com/webstore/detail/modheader/idgpnmonknjnojddfkpgkljpfnnfcklj',
  },
];

function openLink(url: string): void {
  void browser.tabs.create({ url });
}

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
 * Popup root: loads profiles + runtime state, subscribes to changes, and saves
 * every edit to storage.local immediately (save-on-change, T021). Hosts pause/
 * lock controls, unsupported-header notices, and the rotating tip (T033).
 */
export default function App() {
  const [state, setState] = useState<RuntimeState | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ioMode, setIoMode] = useState<'import' | 'export' | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    message: string;
    buttonText?: string;
    url?: string;
  } | null>(null);

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
    // Rotating tip, shown once per popup open (legacy behavior).
    const tip = TIPS[Math.floor(Math.random() * TIPS.length)]!;
    setSnackbar({ message: tip.text, buttonText: tip.buttonText, url: tip.url });
    return subscribeRuntimeState(setState);
  }, []);

  if (!state) {
    return null; // loading
  }
  const profileIndex =
    state.selectedProfileIndex < state.profiles.length
      ? state.selectedProfileIndex
      : 0;
  const profile = state.profiles[profileIndex];

  // T021: every edit is written straight through to storage.local so the
  // background recompiles DNR rules immediately.
  const saveProfiles = (profiles: Profile[], selectedIndex?: number) => {
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

  const pause = () => {
    void setRuntimeState({ isPaused: true });
    notify('ModHeader paused');
  };
  const play = () => {
    void clearRuntimeState(['isPaused']);
    notify('ModHeader unpaused');
  };
  const lockToTab = () => {
    void (async () => {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab?.id != null) {
        await setRuntimeState({ lockedTabId: tab.id });
        notify('Restricted ModHeader to the current tab');
      }
    })();
  };
  const unlockAllTab = () => {
    void clearRuntimeState(['lockedTabId']);
    notify('Applying ModHeader to all tabs');
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
    <Box sx={{ width: 720 }}>
      <AppBar position="static">
        <Toolbar variant="dense" sx={{ gap: 1 }}>
          <Button
            color="inherit"
            aria-label="Profile menu"
            onClick={() => setDrawerOpen(true)}
          >
            ☰
          </Button>
          <TextField
            variant="standard"
            placeholder="Profile name"
            value={profile.title}
            onChange={(e) => saveProfile({ ...profile, title: e.target.value })}
            slotProps={{ input: { disableUnderline: true } }}
            sx={{ input: { color: 'inherit' }, width: 220 }}
          />
          <Box sx={{ flexGrow: 1 }} />
          {state.lockedTabId == null ? (
            <Button color="inherit" aria-label="Tab lock" onClick={lockToTab}>
              Tab lock
            </Button>
          ) : (
            <Button color="inherit" aria-label="Unlock" onClick={unlockAllTab}>
              Unlock
            </Button>
          )}
          {state.isPaused ? (
            <Button color="inherit" aria-label="Play" onClick={play}>
              ▶
            </Button>
          ) : (
            <Button color="inherit" aria-label="Pause" onClick={pause}>
              ❚❚
            </Button>
          )}
          <Button
            color="inherit"
            aria-label="More"
            onClick={(e) => setMoreAnchor(e.currentTarget)}
          >
            ⋮
          </Button>
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
                const profiles = state.profiles.filter(
                  (_, i) => i !== profileIndex,
                );
                if (profiles.length === 0) {
                  profiles.push(createProfile([]));
                }
                saveProfiles(profiles, profiles.length - 1);
              }}
            >
              Delete profile
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMoreAnchor(null);
                const profiles = [...state.profiles, cloneProfile(profile)];
                saveProfiles(profiles, profiles.length - 1);
              }}
            >
              Clone profile
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
          </Menu>
        </Toolbar>
      </AppBar>

      {state.isPaused && (
        <Alert severity="warning" sx={{ borderRadius: 0 }}>
          ModHeader is paused{' '}
          <Button size="small" onClick={play}>
            Click to unpause
          </Button>
        </Alert>
      )}
      {!state.isPaused && state.lockedTabId != null && (
        <Alert severity="info" sx={{ borderRadius: 0 }}>
          Tab lock is active{' '}
          <Button size="small" onClick={unlockAllTab}>
            Click to unlock tab
          </Button>
        </Alert>
      )}
      {unsupported.map((notice, i) => (
        <Alert severity="warning" sx={{ borderRadius: 0 }} key={i}>
          {noticeMessage(notice)}
        </Alert>
      ))}

      <Box sx={{ p: 2 }}>
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

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <ProfileList
          profiles={state.profiles}
          selectedIndex={profileIndex}
          onSelect={(index) => {
            void setRuntimeState({ selectedProfileIndex: index });
            setDrawerOpen(false);
          }}
          onCreate={() => {
            const profiles = [...state.profiles, createProfile(state.profiles)];
            saveProfiles(profiles, profiles.length - 1);
            setDrawerOpen(false);
          }}
          onClone={(index) => {
            const clone = cloneProfile(state.profiles[index]!);
            const profiles = [...state.profiles, clone];
            saveProfiles(profiles, profiles.length - 1);
            setDrawerOpen(false);
          }}
          onDelete={(index) => {
            const profiles = state.profiles.filter((_, i) => i !== index);
            if (profiles.length === 0) {
              profiles.push(createProfile([]));
            }
            saveProfiles(profiles, profiles.length - 1);
            setDrawerOpen(false);
          }}
          onOpenCloudBackup={() => {
            setDrawerOpen(false);
            setBackupOpen(true);
          }}
          openLink={openLink}
        />
      </Drawer>

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

      <Snackbar
        open={snackbar != null}
        autoHideDuration={snackbar?.url ? null : 3000}
        onClose={() => setSnackbar(null)}
        message={snackbar?.message}
        action={
          snackbar?.url ? (
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                openLink(snackbar.url!);
                setSnackbar(null);
              }}
            >
              {snackbar.buttonText}
            </Button>
          ) : undefined
        }
      />
    </Box>
  );
}
