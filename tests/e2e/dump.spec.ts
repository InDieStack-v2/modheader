import fs from 'node:fs';
import { expect, test } from './fixtures';
import { chromeIn, backgroundWorker, profileWith } from './helpers';
import type { Profile } from '../../lib/types';

/**
 * E2E profiles file tests: export downloads a Profile[] JSON file; import
 * opens a checkbox picker and appends the chosen profiles.
 */

async function titlesInStorage(
  chrome: ReturnType<typeof chromeIn>,
): Promise<string> {
  const state = await chrome.getLocal(['profiles', 'selectedProfileIndex']);
  const profiles = state.profiles as Profile[];
  return `${state.selectedProfileIndex}|${profiles.map((p) => p.title).join(',')}`;
}

test.describe('export/import profiles', () => {
  test('export/import dump file round-trip via the popup UI', async ({
    context,
    extensionId,
  }) => {
    const chrome = chromeIn(await backgroundWorker(context));
    const original = [
      profileWith({
        title: 'Alpha',
        headers: [{ enabled: true, name: 'X-Alpha', value: '1' }],
      }),
      profileWith({
        title: 'Beta',
        headers: [{ enabled: true, name: 'X-Beta', value: '2' }],
      }),
    ];
    await chrome.setLocal({ profiles: original, selectedProfileIndex: 1 });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    await popup.getByLabel('More').click();
    const [download] = await Promise.all([
      popup.waitForEvent('download'),
      popup.getByRole('menuitem', { name: 'Export profiles' }).click(),
    ]);
    const dest = test.info().outputPath('exported-dump.json');
    await download.saveAs(dest);
    const exported = JSON.parse(fs.readFileSync(dest, 'utf8')) as Profile[];
    expect(exported.map((p) => p.title)).toEqual(['Alpha', 'Beta']);
    await expect.poll(() => popup.isClosed()).toBe(true);

    await chrome.setLocal({
      profiles: [
        profileWith({
          title: 'Scratch',
          headers: [{ enabled: true, name: 'X-Scratch', value: 'tmp' }],
        }),
      ],
      selectedProfileIndex: 0,
    });
    const importPopup = await context.newPage();
    await importPopup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(importPopup.getByText('Scratch')).toBeVisible();

    await importPopup.getByLabel('More').click();
    const [chooser] = await Promise.all([
      importPopup.waitForEvent('filechooser'),
      importPopup.getByRole('menuitem', { name: 'Import profiles' }).click(),
    ]);
    await chooser.setFiles(dest);

    const dialog = importPopup.getByRole('dialog');
    await expect(dialog.getByRole('checkbox', { name: 'Select all' })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: 'Alpha' })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: 'Beta' })).toBeChecked();
    await dialog.getByRole('button', { name: 'Import' }).click();
    await expect(importPopup.getByText('Profiles successfully import')).toBeVisible();
    await expect.poll(() => titlesInStorage(chrome)).toBe('1|Scratch,Alpha,Beta');
  });

  test('import dump lets the user pick a subset', async ({
    context,
    extensionId,
  }) => {
    const chrome = chromeIn(await backgroundWorker(context));
    await chrome.setLocal({
      profiles: [profileWith({ title: 'Keep me' })],
      selectedProfileIndex: 0,
    });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByLabel('More').click();
    const [chooser] = await Promise.all([
      popup.waitForEvent('filechooser'),
      popup.getByRole('menuitem', { name: 'Import profiles' }).click(),
    ]);
    await chooser.setFiles({
      name: 'dump.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify([
          profileWith({ title: 'Alpha' }),
          profileWith({ title: 'Beta' }),
        ]),
      ),
    });

    const dialog = popup.getByRole('dialog');
    await dialog.getByRole('checkbox', { name: 'Select all' }).uncheck();
    await expect(dialog.getByRole('button', { name: 'Import' })).toBeDisabled();
    await dialog.getByRole('checkbox', { name: 'Alpha' }).check();
    await expect(dialog.getByRole('checkbox', { name: 'Select all' })).toHaveAttribute(
      'aria-checked',
      'mixed',
    );
    await dialog.getByRole('button', { name: 'Import' }).click();
    await expect(popup.getByText('Profiles successfully import')).toBeVisible();
    await expect.poll(() => titlesInStorage(chrome)).toBe('1|Keep me,Alpha');
  });

  test('import failure leaves profiles unchanged', async ({
    context,
    extensionId,
  }) => {
    const chrome = chromeIn(await backgroundWorker(context));
    await chrome.setLocal({
      profiles: [
        profileWith({
          title: 'Keep me',
          headers: [{ enabled: true, name: 'X-Keep', value: 'yes' }],
        }),
      ],
      selectedProfileIndex: 0,
    });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByLabel('More').click();
    const [chooser] = await Promise.all([
      popup.waitForEvent('filechooser'),
      popup.getByRole('menuitem', { name: 'Import profiles' }).click(),
    ]);
    await chooser.setFiles({
      name: 'bad-dump.json',
      mimeType: 'application/json',
      buffer: Buffer.from('this is not json'),
    });
    await expect(popup.getByText('Failed to import profiles')).toBeVisible();
    await expect(popup.getByRole('dialog')).toHaveCount(0);
    const state = await chrome.getLocal(['profiles']);
    expect((state.profiles as Profile[])[0]!.title).toBe('Keep me');
  });
});
