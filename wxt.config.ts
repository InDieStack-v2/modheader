import { mkdir } from 'node:fs/promises';
import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  zip: {
    // Output release artifacts to dist/ instead of the default .output/.
    artifactTemplate:
      '../dist/{{name}}-{{packageVersion}}-{{browser}}{{modeSuffix}}.zip',
    sourcesTemplate:
      '../dist/{{name}}-{{packageVersion}}-sources{{modeSuffix}}.zip',
    // Keep previously zipped artifacts out of the sources zip.
    excludeSources: ['dist/**'],
  },
  hooks: {
    // WXT doesn't create the zip output directory; dist/ is gitignored, so it
    // doesn't exist on fresh checkouts (CI). The extension zip always runs
    // before the sources zip, so this single hook covers both.
    'zip:extension:start': async () => {
      await mkdir('dist', { recursive: true });
    },
  },
  // Extension pages share chunks across worlds (popup, offscreen doc), which
  // makes Chromium log benign "cross-world extension resource mismatch"
  // preload warnings. Preloading buys nothing at this bundle size — disable it.
  vite: () => ({
    build: { modulePreload: false },
  }),
  manifest: ({ browser }) => ({
    name: 'ModHeaderX',
    description: 'Add, modify, and remove HTTP request and response headers.',
    icons: {
      16: 'icon/16.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    // Research D3: modifyHeaders requires host access; parity requires all URLs.
    // 'offscreen' is Chrome-only (migration via offscreen document, D5);
    // Firefox event pages have DOM/localStorage and migrate directly.
    permissions: [
      'declarativeNetRequestWithHostAccess',
      'storage',
      'contextMenus',
      'tabs',
      'webRequest',
      'scripting',
      ...(browser === 'firefox' ? [] : ['offscreen']),
    ],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'ModHeaderX',
      default_icon: {
        16: 'icon/16.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
      // default_popup is set automatically by WXT from entrypoints/popup/.
    },
  }),
});
