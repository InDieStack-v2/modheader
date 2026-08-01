import { afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

// The WxtVitest plugin aliases `wxt/browser` to this fake browser in tests.
// Reset its storage/API state between tests so cases stay isolated.
afterEach(() => {
  fakeBrowser.reset();
});
