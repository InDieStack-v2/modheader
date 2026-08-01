import { browser } from 'wxt/browser';
import { collectLegacyState } from '~/lib/migration';

/**
 * Hidden migration page (T039, research D5): Chrome MV3 service workers have
 * no localStorage, so the background opens this page — as an offscreen
 * document, or as a fallback background tab — to read the legacy 2.3.2 keys.
 *
 * The page ONLY reads localStorage and messages the payload to the service
 * worker, which owns all storage writes: chrome.storage is unreliable inside
 * offscreen documents on real Chrome, while chrome.runtime messaging is their
 * primary supported API. This page must not touch browser.storage.
 */
void (async () => {
  let payload: Record<string, unknown> | null = null;
  let error: string | undefined;
  try {
    payload = collectLegacyState();
  } catch (e) {
    console.error('[modheader] migration page failed:', e);
    error = String(e);
  }
  // Fire-and-forget: the background listener may not exist (e.g. the page was
  // opened manually in a tab), in which case the rejection is harmless.
  await browser.runtime
    .sendMessage({ type: 'modheader:migration-data', payload, error })
    .catch(() => undefined);
})();
