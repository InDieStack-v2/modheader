# ModHeader browser extension

<h3 align="center">
  ModHeader is a browser extension that allow you to modify HTTP request and response headers.
</h3>
<h3 align="center">
  <img src="https://mod-header.appspot.com/android-icon-96x96.png" width="24px" alt="ModHeader" />
  <a href="https://mod-header.appspot.com/">
    Official Website
  </a>
</h3>
<p align="center">
  <a href="https://chrome.google.com/webstore/detail/modheader/idgpnmonknjnojddfkpgkljpfnnfcklj">
    <img src="https://mod-header.appspot.com/images/chrome_1x.png" srcset="https://mod-header.appspot.com/images/chrome_2x.png 2x">
  </a>
  <a href="https://addons.mozilla.org/firefox/addon/modheader-firefox/">
    <img src="https://mod-header.appspot.com/images/firefox_1x.png" srcset="https://mod-header.appspot.com/images/firefox_2x.png 2x">
  </a>
</p>

## Donation

If you find ModHeader useful, please consider making a donation. If you use it for your company project, please ask your company to make a monthly donation!

[![paypal](https://www.paypalobjects.com/en_US/i/btn/btn_donate_SM.gif)](https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=3XFKZ8PCRB8P6&currency_code=USD&amount=5&source=url)
<a href="https://www.buymeacoffee.com/scCieVdfj">
  <img src="https://www.buymeacoffee.com/assets/img/custom_images/yellow_img.png" alt="Buy Me A Coffee">
</a>

## Features

* Add/modify/remove request headers and response headers
* Enable header modification based on URL/resource type
* Add comments to header
* Multiple different profiles
* Sorting headers by name, value, or comments
* Append value to existing request or response header
* Export and import header
* Clone profile
* Cloud backup
* Tab locking!

## Screenshots

<img src="https://mod-header.appspot.com/images/ss1.png">

## Forking and contribution

Feel free to send pull requests to add new features to ModHeader. It will benefit everyone! That said, I reserve the rights to reject pull requests that does not seem useful, or if they add too much complexity for very little benefits.

You may fork and redistribute ModHeader for a small group of friends / colleagues, but please do not impersonate ModHeader, or try to sell it for a profit. If  you use ModHeader in any commercial product, please let me know.

## Installation

Install ModHeader from the
[Chrome Web Store](https://chrome.google.com/webstore/detail/modheader/idgpnmonknjnojddfkpgkljpfnnfcklj)
or [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/modheader-firefox/).

To load a development build instead: `npm install`, then `npm run build`
(or `npm run build:firefox`) and load the produced `.output/chrome-mv3`
(`.output/firefox-mv3`) directory as an unpacked extension. `npm run zip`
produces store-ready packages for both browsers.

## Development

ModHeader is built with a Node.js toolchain (WXT + React + TypeScript).

```
npm install          # install dependencies (postinstall runs `wxt prepare`)
npm run dev          # Chrome dev build with live reload
npm run dev:firefox  # Firefox dev build with live reload
npm run build        # production build → .output/chrome-mv3
npm run build:firefox# production build → .output/firefox-mv3
npm run zip          # store-ready zips for both browsers → .output/*.zip
npm run test         # unit tests (vitest)
npm run test:e2e     # end-to-end tests (playwright; requires a prior build)
npm run lint         # eslint
npm run compile      # type-check only (tsc --noEmit)
```

## Architecture (MV3)

- **Popup**: React + TypeScript (MUI components) in `entrypoints/popup/`, with
  reusable pieces in `components/`.
- **Background**: an MV3 service worker (`entrypoints/background.ts`) that
  compiles the active profile into declarativeNetRequest **session rules** —
  no persistent webRequest listeners, so headers are modified even while the
  worker is asleep.
- **State**: all state lives in `chrome.storage.local` (profiles, selected
  profile, pause/lock state). A one-time migration from the legacy 2.3.2
  `localStorage` format runs automatically on upgrade via a hidden migration
  page (`entrypoints/migration/`); no user action required.
- **Cloud backup**: profiles are snapshotted into `chrome.storage.sync`,
  chunked to fit sync item quotas, written only when profiles actually change.

### Dependency audit (T043)

The shipped bundle has exactly five runtime dependencies, all actively
maintained: `react` 19, `react-dom` 19, `@mui/material` 9, `@emotion/react` 11,
`@emotion/styled` 11. The legacy AngularJS / Angular Material stack is gone —
no `angular*` package appears in `package.json`, the lockfile, or the build
output.

## Selenium usage

If you need to use ModHeader for Selenium tests, please visit: https://github.com/hao1300/modheader_selenium
