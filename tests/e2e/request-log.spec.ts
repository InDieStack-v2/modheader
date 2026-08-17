import { expect, test } from './fixtures';
import { backgroundWorker, chromeIn, profileWith } from './helpers';

test.skip(({ browserName }) => browserName !== 'chromium', 'extension load is chromium-only');

test.describe('profile request logs (spec 003)', () => {
  test('workspace splits into Headers and Logs; Headers is default', async ({
    context,
    extensionId,
  }) => {
    const chrome = chromeIn(await backgroundWorker(context));
    await chrome.setLocal({
      profiles: [
        profileWith({
          title: 'Alpha',
          headers: [{ enabled: true, name: 'X-Alpha', value: '1' }],
        }),
        profileWith({
          title: 'Beta',
          headers: [{ enabled: true, name: 'X-Beta', value: '2' }],
        }),
      ],
      selectedProfileIndex: 0,
    });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    const headersTab = popup.getByRole('tab', { name: 'Headers' });
    const logsTab = popup.getByRole('tab', { name: /^Logs/ });
    await expect(headersTab).toHaveAttribute('aria-selected', 'true');
    await expect(popup.getByPlaceholder('Header name').first()).toHaveValue(
      'X-Alpha',
    );

    await popup.getByPlaceholder('Header name').first().fill('X-Edited');
    await logsTab.click();
    await expect(logsTab).toHaveAttribute('aria-selected', 'true');
    await expect(
      popup.getByText('Start recording to capture patched requests.'),
    ).toBeVisible();

    await headersTab.click();
    await expect(popup.getByPlaceholder('Header name').first()).toHaveValue(
      'X-Edited',
    );

    await popup.getByRole('tab', { name: 'Beta' }).click();
    await expect(headersTab).toHaveAttribute('aria-selected', 'true');
    await expect(popup.getByPlaceholder('Header name').first()).toHaveValue(
      'X-Beta',
    );
  });

  test('start recording logs only patched matching requests', async ({
    context,
    extensionId,
    echoServer,
  }) => {
    const origin = new URL(echoServer.url).origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const chrome = chromeIn(await backgroundWorker(context));
    await chrome.setLocal({
      profiles: [
        profileWith({
          headers: [{ enabled: true, name: 'X-Log', value: '1' }],
          filters: [
            { enabled: true, type: 'urls', urlRegex: `${origin}/.*` },
          ],
        }),
      ],
      selectedProfileIndex: 0,
    });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByRole('tab', { name: /^Logs/ }).click();
    await popup.getByRole('button', { name: 'Start recording' }).click();
    await expect(popup.getByLabel('Recording', { exact: true })).toBeVisible();

    const page = await context.newPage();
    await page.goto(`${echoServer.url}/echo`);
    await page.evaluate(async (url: string) => {
      await fetch(url);
    }, `${echoServer.url}/echo`);
    await page.evaluate(async () => {
      try {
        await fetch('https://example.org/');
      } catch {
        // CORS / network failure is fine — we only care it is not logged
      }
    });

    await popup.bringToFront();
    await expect(popup.getByText(`${echoServer.url}/echo`).first()).toBeVisible({
      timeout: 5000,
    });
    await expect(popup.getByText('example.org')).toHaveCount(0);

    await popup.getByRole('tab', { name: 'Headers' }).click();
    await expect(popup.getByLabel('Recording', { exact: true })).toBeVisible();

    await popup.getByRole('tab', { name: /^Logs/ }).click();
    await popup.getByRole('button', { name: 'Pause recording' }).click();
    const before = await popup.getByText(`${echoServer.url}/echo`).count();
    await page.evaluate(async (url: string) => {
      await fetch(`${url}?paused=1`);
    }, `${echoServer.url}/echo`);
    await popup.waitForTimeout(1500);
    await expect(popup.getByText(`${echoServer.url}/echo`)).toHaveCount(before);
  });

  test('expand shows headers; clear keeps recording; live row', async ({
    context,
    extensionId,
    echoServer,
  }) => {
    const chrome = chromeIn(await backgroundWorker(context));
    await chrome.setLocal({
      profiles: [
        profileWith({
          headers: [{ enabled: true, name: 'X-Log', value: 'yes' }],
        }),
      ],
      selectedProfileIndex: 0,
    });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByRole('tab', { name: /^Logs/ }).click();
    await popup.getByRole('button', { name: 'Start recording' }).click();

    const page = await context.newPage();
    await page.goto(`${echoServer.url}/echo`);
    await page.evaluate(async (url: string) => {
      await fetch(url);
    }, `${echoServer.url}/echo`);

    await popup.bringToFront();
    const row = popup.getByLabel(`Log GET xmlhttprequest ${echoServer.url}/echo`);
    await expect(row).toBeVisible({ timeout: 5000 });
    await row.click();
    await expect(popup.getByText(/X-Log/)).toBeVisible();

    await page.evaluate(async (url: string) => {
      await fetch(`${url}?second=1`);
    }, `${echoServer.url}/echo`);
    await expect(popup.getByText(`${echoServer.url}/echo?second=1`)).toBeVisible({
      timeout: 5000,
    });

    await popup.getByRole('button', { name: 'Clear log' }).click();
    await expect(
      popup.getByText('Matching patched requests will appear here.'),
    ).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Pause recording' })).toBeVisible();
  });

  test('bodies and copy cURL from the row', async ({
    context,
    extensionId,
    echoServer,
  }) => {
    const chrome = chromeIn(await backgroundWorker(context));
    await chrome.setLocal({
      profiles: [
        profileWith({
          headers: [{ enabled: true, name: 'X-Log', value: '1' }],
        }),
      ],
      selectedProfileIndex: 0,
    });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByRole('tab', { name: /^Logs/ }).click();
    await popup.getByRole('button', { name: 'Start recording' }).click();

    const page = await context.newPage();
    await page.goto(`${echoServer.url}/echo`);
    await page.evaluate(async (url: string) => {
      await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hello: 'world' }),
      });
    }, `${echoServer.url}/echo`);

    await popup.bringToFront();
    const row = popup.getByLabel(`Log POST xmlhttprequest ${echoServer.url}/echo`);
    await expect(row).toBeVisible({ timeout: 5000 });
    await row.click();
    await expect(popup.getByText('hello').or(popup.getByText('No body'))).toBeVisible();

    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await popup.getByRole('button', { name: 'Copy cURL' }).first().click();
    await expect(popup.getByText(/Copied cURL/)).toBeVisible();
    const copied = await popup.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('POST');
    expect(copied).toContain(`${echoServer.url}/echo`);
  });

  test('type filter hides rows and survives popup reopen', async ({
    context,
    extensionId,
    echoServer,
  }) => {
    const chrome = chromeIn(await backgroundWorker(context));
    await chrome.setLocal({
      profiles: [
        profileWith({
          headers: [{ enabled: true, name: 'X-Log', value: '1' }],
        }),
      ],
      selectedProfileIndex: 0,
    });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByRole('tab', { name: /^Logs/ }).click();
    await popup.getByRole('button', { name: 'Start recording' }).click();

    const page = await context.newPage();
    await page.goto(`${echoServer.url}/echo`);
    await page.evaluate(async (url: string) => {
      await fetch(url);
    }, `${echoServer.url}/echo`);

    await popup.bringToFront();
    const xhrRow = popup.getByLabel(
      `Log GET xmlhttprequest ${echoServer.url}/echo`,
    );
    const docRow = popup.getByLabel(`Log GET main_frame ${echoServer.url}/echo`);
    await expect(xhrRow).toBeVisible({ timeout: 5000 });
    await expect(docRow).toBeVisible();

    await popup.getByRole('button', { name: 'XHR' }).click();
    await expect(xhrRow).toBeVisible();
    await expect(docRow).toHaveCount(0);
    await expect(popup.getByLabel('Recording', { exact: true })).toBeVisible();

    await popup.getByRole('button', { name: 'All' }).click();
    await expect(docRow).toBeVisible();

    await popup.getByRole('button', { name: 'XHR' }).click();
    await popup.close();
    const reopened = await context.newPage();
    await reopened.goto(`chrome-extension://${extensionId}/popup.html`);
    await reopened.getByRole('tab', { name: /^Logs/ }).click();
    await expect(
      reopened.getByLabel(`Log GET xmlhttprequest ${echoServer.url}/echo`),
    ).toBeVisible();
    await expect(
      reopened.getByLabel(`Log GET main_frame ${echoServer.url}/echo`),
    ).toHaveCount(0);
  });

  test('headers capture filter uses always-visible toggles', async ({
    context,
    extensionId,
  }) => {
    const chrome = chromeIn(await backgroundWorker(context));
    await chrome.setLocal({
      profiles: [
        profileWith({
          title: 'Alpha',
          filters: [
            {
              enabled: true,
              type: 'types',
              resourceType: ['main_frame'],
            },
          ],
        }),
      ],
      selectedProfileIndex: 0,
    });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    const xhr = popup.getByRole('button', { name: 'XHR' });
    const script = popup.getByRole('button', { name: 'Script' });
    const doc = popup.getByRole('button', { name: 'Main Frame' });
    await expect(doc).toHaveAttribute('aria-pressed', 'true');

    await xhr.click();
    await script.click();
    await expect(xhr).toHaveAttribute('aria-pressed', 'true');
    await expect(script).toHaveAttribute('aria-pressed', 'true');

    await doc.click();
    await expect(doc).toHaveAttribute('aria-pressed', 'false');
    await xhr.click();
    await script.click();
    await expect(popup.getByRole('group', { name: 'Capture resource types' }).getByRole('button', { pressed: true })).toHaveCount(1);
  });

  test('global pause and no enabled headers reset recording', async ({
    context,
    extensionId,
    echoServer,
  }) => {
    const chrome = chromeIn(await backgroundWorker(context));
    await chrome.setLocal({
      profiles: [
        profileWith({
          headers: [{ enabled: true, name: 'X-Log', value: '1' }],
        }),
      ],
      selectedProfileIndex: 0,
    });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByRole('tab', { name: /^Logs/ }).click();
    await popup.getByRole('button', { name: 'Start recording' }).click();
    await expect(popup.getByLabel('Recording', { exact: true })).toBeVisible();

    const page = await context.newPage();
    await page.goto(`${echoServer.url}/echo`);
    await page.evaluate(async (url: string) => {
      await fetch(url);
    }, `${echoServer.url}/echo`);
    await popup.bringToFront();
    await expect(popup.getByText(`${echoServer.url}/echo`).first()).toBeVisible({
      timeout: 5000,
    });
    const before = await popup.getByText(`${echoServer.url}/echo`).count();

    await popup.getByRole('tab', { name: 'Headers' }).click();
    await popup.getByLabel('Pause').click();
    await expect(popup.getByLabel('Play')).toBeVisible();
    await expect(popup.getByLabel('Recording', { exact: true })).toHaveCount(0);

    await page.evaluate(async (url: string) => {
      await fetch(`${url}?paused=1`);
    }, `${echoServer.url}/echo`);
    await popup.getByRole('tab', { name: /^Logs/ }).click();
    await popup.waitForTimeout(1500);
    await expect(popup.getByText(`${echoServer.url}/echo`)).toHaveCount(before);
    await expect(
      popup.getByRole('button', { name: 'Start recording' }),
    ).toBeDisabled();

    await popup.getByRole('tab', { name: 'Headers' }).click();
    await popup.getByLabel('Play').click();
    await expect(popup.getByLabel('Recording', { exact: true })).toHaveCount(0);

    await popup.getByRole('tab', { name: /^Logs/ }).click();
    await expect(
      popup.getByRole('button', { name: 'Start recording' }),
    ).toBeEnabled();
    await popup.getByRole('button', { name: 'Start recording' }).click();
    await expect(popup.getByLabel('Recording', { exact: true })).toBeVisible();

    await popup.getByRole('tab', { name: 'Headers' }).click();
    await popup.getByPlaceholder('Header name').first().fill('');
    await expect(popup.getByLabel('Recording', { exact: true })).toHaveCount(0);
  });
});
