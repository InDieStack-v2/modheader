import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { saveBackupIfChanged } from '~/lib/backup';
import { compileProfileToRules } from '~/lib/dnr';
import { applyMigratedState, migrateLegacyLocalStorage } from '~/lib/migration';
import {
  STORAGE_KEYS,
  clearRuntimeState,
  getRuntimeState,
  setRuntimeState,
} from '~/lib/storage';
import type { Profile, RuntimeState } from '~/lib/types';
import { profileHasEnabledRules } from '~/lib/request-match';
import {
  startRequestLogObserver,
  syncRequestLogHook,
} from '~/lib/request-log-observer';
import {
  REQUEST_LOG_ENTRIES_KEY,
  REQUEST_LOG_RECORDING_KEY,
  REQUEST_LOG_WS_RECORDING_KEY,
  getRequestLogState,
  syncRecordingWithPatching,
  wipeLocalFallbackKeys,
} from '~/lib/session-log';
import { toolbarBadge } from '~/lib/toolbar-badge';

/** Chrome-only offscreen API (not present in Firefox types/runtime). */
interface OffscreenApi {
  createDocument(options: {
    url: string;
    reasons: string[];
    justification: string;
  }): Promise<void>;
  closeDocument(): Promise<void>;
  hasDocument(): Promise<boolean>;
}

/**
 * Background worker: compiles DNR session rules from the selected profile
 * (T014), plus badge state (T016), pause/lock context menus (T017), and
 * active-tab URL tracking (T018) via the tabs API.
 */

/** Storage keys whose changes require a rule recompile. */
const RULE_STATE_KEYS: readonly string[] = [
  'profiles',
  'selectedProfileIndex',
  'isPaused',
  'lockedTabId',
];

const ICON_COLOR = 'icon.png';
const ICON_GREY = 'icon_bw.png';

export default defineBackground(() => {
  function selectProfile(state: RuntimeState): Profile | undefined {
    return state.profiles[state.selectedProfileIndex] ?? state.profiles[0];
  }

  /** Enabled, non-empty-named headers — same counting rule as the DNR compiler. */
  function countEnabledHeaders(profile: Profile | undefined): number {
    if (!profile) {
      return 0;
    }
    const count = (rows: { enabled: boolean; name: string }[] | undefined) =>
      (rows ?? []).filter((r) => r.enabled && r.name.trim() !== '').length;
    return count(profile.headers) + count(profile.respHeaders);
  }

  async function recompileSessionRules(state: RuntimeState): Promise<void> {
    const profile = selectProfile(state);
    const { rules, unsupported } = profile
      ? compileProfileToRules(
          profile,
          state.isPaused ?? false,
          state.lockedTabId ?? null,
        )
      : { rules: [], unsupported: [] };
    if (unsupported.length > 0) {
      console.warn('[modheader] unsupported configurations:', unsupported);
    }
    // updateSessionRules is atomic: replace the whole session ruleset.
    const existing = await browser.declarativeNetRequest.getSessionRules();
    await browser.declarativeNetRequest.updateSessionRules({
      removeRuleIds: existing.map((rule) => rule.id),
      addRules: rules,
    });
  }

  /** Badge: pause / empty / lock / recording / header count. */
  async function updateBadge(state: RuntimeState): Promise<void> {
    const log = await getRequestLogState();
    const selectedIndex =
      state.selectedProfileIndex < state.profiles.length
        ? state.selectedProfileIndex
        : 0;
    let lockedElsewhere = false;
    if (state.lockedTabId != null) {
      const [activeTab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      lockedElsewhere = activeTab?.id !== state.lockedTabId;
    }
    const view = toolbarBadge({
      paused: state.isPaused ?? false,
      headerCount: countEnabledHeaders(selectProfile(state)),
      lockedElsewhere,
      recording:
        log.recording[selectedIndex] === true ||
        log.wsRecording[selectedIndex] === true,
    });
    await browser.action.setIcon({
      path: view.icon === 'grey' ? ICON_GREY : ICON_COLOR,
    });
    await browser.action.setBadgeText({ text: view.text });
    if (view.color) {
      await browser.action.setBadgeBackgroundColor({ color: view.color });
    }
  }

  /** Pause / lock context-menu titles. */
  async function updateContextMenus(state: RuntimeState): Promise<void> {
    await browser.contextMenus.update('pause', {
      title: state.isPaused ? 'Unpause ModHeaderX' : 'Pause ModHeaderX',
    });
    await browser.contextMenus.update('lock', {
      title: state.lockedTabId != null ? 'Unlock to all tabs' : 'Lock to this tab',
    });
  }

  let menusInFlight: Promise<void> | undefined;
  async function ensureContextMenus(): Promise<void> {
    if (menusInFlight) {
      await menusInFlight;
      return;
    }
    menusInFlight = (async () => {
      await browser.contextMenus.removeAll();
      await browser.contextMenus.create({
        id: 'pause',
        title: 'Pause ModHeaderX',
        contexts: ['action'],
      });
      await browser.contextMenus.create({
        id: 'lock',
        title: 'Lock to this tab',
        contexts: ['action'],
      });
    })();
    try {
      await menusInFlight;
    } finally {
      menusInFlight = undefined;
    }
  }

  async function refresh(): Promise<void> {
    const state = await getRuntimeState();
    await recompileSessionRules(state);
    await updateBadge(state);
    await updateContextMenus(state);
    const selected = selectProfile(state);
    const selectedIndex =
      state.selectedProfileIndex < state.profiles.length
        ? state.selectedProfileIndex
        : 0;
    await syncRecordingWithPatching({
      paused: state.isPaused ?? false,
      selectedIndex,
      selectedHasRules: selected ? profileHasEnabledRules(selected) : false,
    });
  }

  // --- Pause/lock context menu clicks (T017) ---
  browser.contextMenus.onClicked.addListener((info) => {
    void (async () => {
      const state = await getRuntimeState();
      if (info.menuItemId === 'pause') {
        if (state.isPaused) {
          await clearRuntimeState(['isPaused']);
        } else {
          await setRuntimeState({ isPaused: true });
        }
      } else if (info.menuItemId === 'lock') {
        if (state.lockedTabId != null) {
          await clearRuntimeState(['lockedTabId']);
        } else {
          const [activeTab] = await browser.tabs.query({
            active: true,
            currentWindow: true,
          });
          if (activeTab?.id != null) {
            await setRuntimeState({ lockedTabId: activeTab.id });
          }
        }
      }
      // The storage.onChanged listener below recompiles rules and refreshes
      // badge/menus in response to these writes.
    })();
  });

  // --- Active-tab URL tracking via the tabs API (T018) ---
  async function trackActiveTab(): Promise<void> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url;
    if (!url) {
      return;
    }
    const state = await getRuntimeState();
    if (state.activeTabUrl !== url) {
      await setRuntimeState({ activeTabUrl: url });
    }
  }
  browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (tab.active && changeInfo.url) {
      void trackActiveTab();
    }
  });
  browser.tabs.onActivated.addListener(() => {
    void trackActiveTab();
  });
  browser.windows.onFocusChanged.addListener((windowId) => {
    if (windowId !== browser.windows.WINDOW_ID_NONE) {
      void trackActiveTab();
    }
  });

  // --- Auto cloud backup on profiles change (FR-002) ---
  function maybeAutoBackup(): void {
    void (async () => {
      try {
        const state = await getRuntimeState();
        // Only back up post-migration so legacy localStorage isn't clobbered
        // by an empty pre-migration profile list.
        if (state.migrationDone && state.profiles.length > 0) {
          await saveBackupIfChanged(state.profiles);
        }
      } catch (e) {
        // Sync quota failures must never break the worker (surfaced to the
        // user from the Cloud backup dialog instead, FR-014).
        console.warn('[modheader] cloud backup failed:', e);
      }
    })();
  }

  // --- Legacy localStorage migration (T039, research D5) ---

  /**
   * Resolves true once the migration page posts 'modheader:migration-data'
   * (applying the payload, closing the offscreen document / sender tab and
   * refreshing rules), or false on timeout/cancel so the caller can fall back
   * to another page host. Unknown messages are ignored.
   */
  function createMigrationDoneWaiter(
    offscreen: OffscreenApi | undefined,
    timeoutMs: number,
  ): { promise: Promise<boolean>; cancel: () => void } {
    let resolvePromise: (done: boolean) => void = () => undefined;
    const cleanup = () => {
      browser.runtime.onMessage.removeListener(onMessage);
      clearTimeout(timer);
    };
    const onMessage = (message: unknown, sender: Browser.runtime.MessageSender) => {
      const msg = message as {
        type?: unknown;
        payload?: unknown;
        error?: unknown;
      } | null;
      if (msg?.type !== 'modheader:migration-data') {
        return;
      }
      cleanup();
      void (async () => {
        if (typeof msg.error === 'string') {
          // The page failed to even read localStorage: record it and mark
          // done so we don't retry forever on every startup.
          console.warn('[modheader] migration page reported an error:', msg.error);
          await browser.storage.local
            .set({ migrationError: msg.error, migrationDone: true })
            .catch(() => undefined);
        } else if (msg.payload !== null && typeof msg.payload === 'object') {
          await applyMigratedState(msg.payload as Record<string, unknown>);
        }
        await offscreen?.closeDocument().catch(() => undefined);
        if (sender.tab?.id !== undefined) {
          await browser.tabs.remove(sender.tab.id).catch(() => undefined);
        }
        await refresh();
        resolvePromise(true);
      })();
    };
    const timer = setTimeout(() => {
      cleanup();
      resolvePromise(false);
    }, timeoutMs);
    browser.runtime.onMessage.addListener(onMessage);
    const promise = new Promise<boolean>((resolve) => {
      resolvePromise = resolve;
    });
    return {
      promise,
      cancel: () => {
        cleanup();
        resolvePromise(false);
      },
    };
  }

  let migrationInFlight = false;
  async function runMigrationIfNeeded(): Promise<void> {
    if (migrationInFlight) {
      return; // onInstalled and startup fallback can race within one worker
    }
    migrationInFlight = true;
    try {
      const state = await getRuntimeState();
      if (state.migrationDone) {
        return;
      }
      const offscreen = (browser as unknown as { offscreen?: OffscreenApi })
        .offscreen;
      if (offscreen) {
        // Chrome MV3 service worker: no localStorage — migrate in an offscreen
        // document, then close it and recompile with the migrated profiles.
        if (await offscreen.hasDocument()) {
          return; // migration already running in the offscreen document
        }
        const waiter = createMigrationDoneWaiter(offscreen, 8000);
        try {
          await offscreen.createDocument({
            url: 'migration.html',
            reasons: ['LOCAL_STORAGE'],
            justification:
              'One-time migration of legacy ModHeaderX localStorage profiles to chrome.storage.local',
          });
        } catch {
          waiter.cancel();
        }
        if (await waiter.promise) {
          return;
        }
        // Offscreen documents whose scripts never run (observed with Chrome
        // for Testing 151): fall back to a background tab running the same
        // migration page, closed by the waiter on completion.
        await offscreen.closeDocument().catch(() => undefined);
        const tabWaiter = createMigrationDoneWaiter(offscreen, 30000);
        const tab = await browser.tabs.create({
          url: 'migration.html',
          active: false,
        });
        if (!(await tabWaiter.promise) && tab.id !== undefined) {
          console.warn('[modheader] migration tab did not complete');
          await browser.tabs.remove(tab.id).catch(() => undefined);
        }
      } else {
        // Firefox MV3 event page is a DOM document: migrate directly.
        await migrateLegacyLocalStorage();
        await refresh();
      }
    } catch (e) {
      console.warn('[modheader] migration failed:', e);
    } finally {
      migrationInFlight = false;
    }
  }

  // --- State changes: recompile rules only for rule-relevant keys ---
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }
    const keys = Object.keys(changes);
    if (keys.some((k) => RULE_STATE_KEYS.includes(k))) {
      void refresh();
    } else if (keys.some((k) => (STORAGE_KEYS as readonly string[]).includes(k))) {
      void getRuntimeState().then(async (state) => {
        await updateBadge(state);
        await updateContextMenus(state);
      });
    }
    if (keys.includes('profiles')) {
      maybeAutoBackup();
    }
  });

  browser.runtime.onInstalled.addListener(() => {
    void ensureContextMenus()
      .then(refresh)
      .then(runMigrationIfNeeded);
  });

  browser.runtime.onStartup.addListener(() => {
    void wipeLocalFallbackKeys();
  });

  startRequestLogObserver();
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (
      (areaName === 'session' || areaName === 'local') &&
      (REQUEST_LOG_RECORDING_KEY in changes ||
        REQUEST_LOG_WS_RECORDING_KEY in changes ||
        REQUEST_LOG_ENTRIES_KEY in changes)
    ) {
      void syncRequestLogHook();
      if (
        REQUEST_LOG_RECORDING_KEY in changes ||
        REQUEST_LOG_WS_RECORDING_KEY in changes
      ) {
        void getRuntimeState().then(updateBadge);
      }
    }
  });
  void syncRequestLogHook();

  // Worker startup: rebuild menus (browser restart case), compile rules, and
  // fall back to migration if it hasn't run yet (e.g. onInstalled missed).
  void ensureContextMenus()
    .then(refresh)
    .then(runMigrationIfNeeded);
});
