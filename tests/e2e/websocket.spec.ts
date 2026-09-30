import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { backgroundWorker, chromeIn, profileWith } from './helpers';
import type { Profile } from '../../lib/types';

test.skip(({ browserName }) => browserName !== 'chromium', 'extension load is chromium-only');

type WsWindow = Window & {
  openWs(url: string): Promise<void>;
  sendWs(data: string | number[]): void;
  closeWs(code: number, reason: string): void;
};

async function setup(
  context: BrowserContext,
  extensionId: string,
  profile: Partial<Profile> = {},
): Promise<Page> {
  const chrome = chromeIn(await backgroundWorker(context));
  await chrome.setLocal({
    profiles: [
      profileWith({
        headers: [{ enabled: true, name: 'X-Test', value: '1' }],
        ...profile,
      }),
    ],
    selectedProfileIndex: 0,
  });
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  return popup;
}

async function startRecordingOnWebSockets(popup: Page): Promise<void> {
  await popup.getByRole('tab', { name: /^WebSockets/ }).click();
  await popup.getByRole('button', { name: 'Start recording' }).click();
  await expect(popup.getByRole('tab', { name: 'WebSockets · rec' })).toBeVisible();
}

async function openSocket(context: BrowserContext, pageUrl: string, wsUrl: string) {
  const page = await context.newPage();
  await page.goto(pageUrl);
  await page.evaluate((u) => (window as unknown as WsWindow).openWs(u), wsUrl);
  return page;
}

test.describe('WebSocket capture tab (spec 006)', () => {
  test('third tab lists patched sockets, not in Requests', async ({
    context,
    extensionId,
    echoServer,
  }) => {
    const popup = await setup(context, extensionId);
    const tabs = popup.getByRole('tablist', { name: 'Workspace' }).getByRole('tab');
    await expect(tabs).toHaveText(['Headers', 'Requests', 'WebSockets']);
    await expect(popup.getByRole('tab', { name: 'Headers' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await startRecordingOnWebSockets(popup);

    await openSocket(context, `${echoServer.url}/ws-page`, echoServer.wsUrl);
    expect(echoServer.lastUpgradeHeaders?.['x-test']).toBe('1');

    await popup.bringToFront();
    const row = popup.getByLabel(`WebSocket ${echoServer.wsUrl}`);
    await expect(row).toBeVisible({ timeout: 2000 });
    await expect(popup.getByLabel('State open')).toBeVisible();

    // FR-003: the handshake never shows up as an HTTP log row.
    await popup.getByRole('tab', { name: /^Logs/ }).click();
    await expect(popup.getByText('/echo')).toHaveCount(0);
  });

  test('type filter without WebSocket skips sockets', async ({
    context,
    extensionId,
    echoServer,
  }) => {
    const popup = await setup(context, extensionId, {
      filters: [{ enabled: true, type: 'types', resourceType: ['xmlhttprequest'] }],
    });
    await startRecordingOnWebSockets(popup);
    await openSocket(context, `${echoServer.url}/ws-page`, echoServer.wsUrl);
    await popup.bringToFront();
    await popup.waitForTimeout(1000);
    await expect(popup.getByLabel(`WebSocket ${echoServer.wsUrl}`)).toHaveCount(0);

    const chrome = chromeIn(await backgroundWorker(context));
    await chrome.setLocal({
      profiles: [
        profileWith({
          headers: [{ enabled: true, name: 'X-Test', value: '1' }],
          filters: [
            { enabled: true, type: 'types', resourceType: ['xmlhttprequest', 'websocket'] },
          ],
        }),
      ],
    });
    await popup.waitForTimeout(300);
    await openSocket(context, `${echoServer.url}/ws-page`, echoServer.wsUrl);
    await popup.bringToFront();
    await expect(popup.getByLabel(`WebSocket ${echoServer.wsUrl}`)).toBeVisible({
      timeout: 2000,
    });
  });

  test('response-only profile does not capture sockets', async ({
    context,
    extensionId,
    echoServer,
  }) => {
    const popup = await setup(context, extensionId, {
      headers: [],
      respHeaders: [{ enabled: true, name: 'X-Resp', value: '1' }],
    });
    await startRecordingOnWebSockets(popup);
    await openSocket(context, `${echoServer.url}/ws-page`, echoServer.wsUrl);
    await popup.bringToFront();
    await popup.waitForTimeout(1000);
    await expect(popup.getByLabel(`WebSocket ${echoServer.wsUrl}`)).toHaveCount(0);
  });

  test('messages: order, auto view, decoded views, live append, close', async ({
    context,
    extensionId,
    echoServer,
  }) => {
    const popup = await setup(context, extensionId);
    await startRecordingOnWebSockets(popup);
    const page = await openSocket(context, `${echoServer.url}/ws-page`, echoServer.wsUrl);
    const send = (data: string | number[]) =>
      page.evaluate((d) => (window as unknown as WsWindow).sendWs(d), data);
    const msgpack = [0x81, 0xa1, 0x78, 0x92, 0x01, 0x02]; // {"x":[1,2]}

    await send('{"a":1}');
    await send('hello');
    await send([1, 2, 3]);
    await send(msgpack);
    await send('aGVsbG8=');

    await popup.bringToFront();
    await popup.getByLabel(`WebSocket ${echoServer.wsUrl}`).click();
    const messages = popup.getByRole('button', { name: /^(sent|received) message / });
    await expect(messages).toHaveCount(10, { timeout: 3000 });
    // Echo server replies after each send; direction pairs stay in order.
    await expect(messages.first()).toHaveAttribute('aria-label', /^sent message \{"a":1\}/);

    const content = popup.getByLabel('Message content');
    await messages.nth(0).click();
    await expect(content).toHaveText('{\n  "a": 1\n}'); // JSON auto view
    await messages.nth(2).click();
    await expect(content).toHaveText('hello'); // Text auto view
    await messages.nth(4).click();
    await expect(content).toHaveText('00000000  01 02 03'); // binary → Hex
    await messages.nth(6).click();
    await expect(content).toContainText('"x": ['); // MessagePack auto view
    await popup.getByRole('button', { name: 'Base64', exact: true }).click();
    await expect(content).toHaveText('gaF4kgEC');
    await messages.nth(8).click();
    await popup.getByRole('button', { name: 'Base64', exact: true }).click();
    await expect(content).toHaveText('hello');
    await popup.getByRole('button', { name: 'MessagePack' }).click();
    await expect(content).toHaveText('Cannot decode as MessagePack');
    await popup.getByRole('button', { name: 'Text', exact: true }).click();
    await expect(content).toHaveText('aGVsbG8=');

    // Live append while the detail stays open.
    await send('later');
    await expect(messages).toHaveCount(12, { timeout: 2500 });

    await page.evaluate(() => (window as unknown as WsWindow).closeWs(4001, 'bye'));
    await expect(popup.getByLabel('State closed 4001')).toBeVisible({ timeout: 3000 });
    await expect(popup.getByText('Closed 4001 · bye')).toBeVisible();
    // The __close command itself is a sent frame; earlier messages remain readable.
    await expect(messages).toHaveCount(13);
  });

  test('keeps the last 500 messages and says earlier ones were dropped', async ({
    context,
    extensionId,
    echoServer,
  }) => {
    const popup = await setup(context, extensionId);
    await startRecordingOnWebSockets(popup);
    const page = await openSocket(context, `${echoServer.url}/ws-page`, echoServer.wsUrl);
    await page.evaluate(() => {
      const w = window as unknown as WsWindow;
      for (let i = 0; i < 300; i++) {
        w.sendWs(`m${i}`);
      }
    });
    await popup.bringToFront();
    await popup.getByLabel(`WebSocket ${echoServer.wsUrl}`).click();
    await expect(popup.getByText('Earlier messages were dropped.')).toBeVisible({
      timeout: 5000,
    });
    await expect(popup.getByText('Messages (500)')).toBeVisible();

    // SC-004: reopening a full connection and switching tabs stay under 1 s.
    const row = popup.getByLabel(`WebSocket ${echoServer.wsUrl}`);
    await row.click();
    let started = Date.now();
    await row.click();
    await expect(popup.getByText('Messages (500)')).toBeVisible();
    expect(Date.now() - started).toBeLessThan(1000);
    await popup.getByRole('tab', { name: /^Logs/ }).click();
    started = Date.now();
    await popup.getByRole('tab', { name: /^WebSockets/ }).click();
    await expect(popup.getByRole('button', { name: 'Pause recording' })).toBeVisible();
    expect(Date.now() - started).toBeLessThan(1000);
  });

  test('independent recording toggles, pause, clear, edge cases, restart reset', async ({
    context,
    extensionId,
    echoServer,
  }) => {
    const popup = await setup(context, extensionId);
    const chrome = chromeIn(await backgroundWorker(context));
    const wsRow = popup.getByLabel(`WebSocket ${echoServer.wsUrl}`);
    const stored = async () =>
      (await (await backgroundWorker(context)).evaluate(async () => {
        const c = (globalThis as unknown as {
          chrome: { storage: { session: { get(k: string): Promise<Record<string, unknown[][]>> } } };
        }).chrome;
        return (await c.storage.session.get('requestLogSockets')).requestLogSockets ?? [];
      })) as unknown[][];

    // A socket opened before recording starts is never captured (even once recording is on).
    const early = await openSocket(context, `${echoServer.url}/ws-page`, echoServer.wsUrl);
    await startRecordingOnWebSockets(popup);
    await early.evaluate(() => (window as unknown as WsWindow).sendWs('early'));
    await popup.waitForTimeout(800);
    await expect(wsRow).toHaveCount(0);

    // Independent toggles: WebSocket recording does not start Logs recording.
    await expect(popup.getByRole('tab', { name: 'Requests', exact: true })).toBeVisible();
    await popup.getByRole('tab', { name: 'Requests', exact: true }).click();
    await expect(popup.getByRole('button', { name: 'Start recording' })).toBeVisible();
    const httpPage = await context.newPage();
    await httpPage.goto(`${echoServer.url}/echo`);
    await httpPage.evaluate((u) => fetch(u), `${echoServer.url}/echo?a=1`);
    await popup.bringToFront();
    await popup.waitForTimeout(800);
    await expect(popup.getByText('Start recording to capture patched requests.')).toBeVisible();
    // Starting Logs recording leaves WebSocket recording on, and pausing it leaves WebSockets on.
    await popup.getByRole('button', { name: 'Start recording' }).click();
    await expect(popup.getByLabel('Recording Logs+WS')).toBeVisible();
    await popup.getByRole('button', { name: 'Pause recording' }).click();
    await expect(popup.getByRole('tab', { name: 'WebSockets · rec' })).toBeVisible();
    await expect(popup.getByRole('tab', { name: 'Requests', exact: true })).toBeVisible();
    await expect(popup.getByLabel('Recording WS')).toBeVisible();

    // Tab lock: only the locked tab's sockets are captured.
    const other = await context.newPage();
    await other.goto(`${echoServer.url}/ws-page`);
    const tabId = await (await backgroundWorker(context)).evaluate(async () => {
      const c = (globalThis as unknown as {
        chrome: { tabs: { query(q: object): Promise<{ id: number; url: string }[]> } };
      }).chrome;
      return (await c.tabs.query({})).find((t) => t.url.endsWith('/ws-page'))!.id;
    });
    await chrome.setLocal({ lockedTabId: tabId + 999_999 });
    await popup.waitForTimeout(300);
    await other.evaluate((u) => (window as unknown as WsWindow).openWs(u), echoServer.wsUrl);
    await popup.waitForTimeout(800);
    expect((await stored())[0] ?? []).toHaveLength(0);
    await (await backgroundWorker(context)).evaluate(async () => {
      await (globalThis as unknown as {
        chrome: { storage: { local: { remove(k: string): Promise<void> } } };
      }).chrome.storage.local.remove('lockedTabId');
    });

    // Normal capture, then pause: new sockets/messages are not added, old ones stay.
    const page = await openSocket(context, `${echoServer.url}/ws-page`, echoServer.wsUrl);
    await page.evaluate(() => (window as unknown as WsWindow).sendWs('one'));
    await popup.getByRole('tab', { name: /^WebSockets/ }).click();
    await wsRow.click();
    await expect(popup.getByText('Messages (2)')).toBeVisible({ timeout: 3000 });
    await popup.getByRole('button', { name: 'Pause recording' }).click();
    await page.evaluate(() => (window as unknown as WsWindow).sendWs('two'));
    await openSocket(context, `${echoServer.url}/ws-page`, echoServer.wsUrl);
    await popup.waitForTimeout(1000);
    await expect(popup.getByText('Messages (2)')).toBeVisible();
    expect((await stored())[0]).toHaveLength(1);

    // Clear removes sockets only; HTTP log and recording state are untouched.
    await popup.getByRole('button', { name: 'Clear WebSockets' }).click();
    await expect(wsRow).toHaveCount(0);
    await expect(popup.getByRole('button', { name: 'Start recording' })).toBeVisible();

    // Restart: session state is wiped and recording is off.
    await popup.getByRole('button', { name: 'Start recording' }).click();
    await openSocket(context, `${echoServer.url}/ws-page`, echoServer.wsUrl);
    await expect(wsRow).toBeVisible({ timeout: 3000 });
    await (await backgroundWorker(context)).evaluate(async () => {
      await (globalThis as unknown as {
        chrome: { storage: { session: { clear(): Promise<void> } } };
      }).chrome.storage.session.clear();
    });
    await expect(wsRow).toHaveCount(0);
    await expect(popup.getByRole('button', { name: 'Start recording' })).toBeVisible();
  });
});
