import { expect, test } from './fixtures';
import { backgroundWorker, chromeIn, profileWith } from './helpers';
import type { Profile } from '../../lib/types';

/**
 * Profile rail e2e: one-click switching, create, popover rename, duplicate,
 * drag-reorder, delete-with-undo, last-profile guard, and keyboard navigation
 * — driven through the popup UI against storage state. Avatars show initials;
 * each tab's accessible name is the full profile title (aria-label).
 */

function seedProfiles(...titles: string[]): Profile[] {
  return titles.map((title) =>
    profileWith({
      title,
      headers: [{ enabled: true, name: `X-${title}`, value: '1' }],
    }),
  );
}

async function storedState(
  chrome: ReturnType<typeof chromeIn>,
): Promise<{ profiles: Profile[]; selectedProfileIndex: number }> {
  const state = await chrome.getLocal(['profiles', 'selectedProfileIndex']);
  return {
    profiles: state.profiles as Profile[],
    selectedProfileIndex: state.selectedProfileIndex as number,
  };
}

test.describe('profile tab bar (spec 002, US2)', () => {
  test('one-click switch shows the selected profile rules', async ({
    context,
    extensionId,
  }) => {
    const chrome = chromeIn(await backgroundWorker(context));
    await chrome.setLocal({
      profiles: seedProfiles('Alpha', 'Beta'),
      selectedProfileIndex: 0,
    });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    const alphaTab = popup.getByRole('tab', { name: 'Alpha' });
    const betaTab = popup.getByRole('tab', { name: 'Beta' });
    await expect(alphaTab).toHaveAttribute('aria-selected', 'true');

    // Workspace shows Alpha's rules before the switch.
    await expect(popup.getByPlaceholder('Header name').first()).toHaveValue(
      'X-Alpha',
    );

    await betaTab.click();
    await expect(betaTab).toHaveAttribute('aria-selected', 'true');
    await expect(popup.getByPlaceholder('Header name').first()).toHaveValue(
      'X-Beta',
    );
    await expect
      .poll(async () => (await storedState(chrome)).selectedProfileIndex)
      .toBe(1);
  });

  test('create appends a tab and selects it', async ({
    context,
    extensionId,
  }) => {
    const chrome = chromeIn(await backgroundWorker(context));
    await chrome.setLocal({
      profiles: seedProfiles('Alpha', 'Beta'),
      selectedProfileIndex: 0,
    });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    await popup.getByRole('button', { name: 'New profile' }).click();
    await expect(popup.getByRole('tab')).toHaveCount(3);
    await expect
      .poll(async () => {
        const state = await storedState(chrome);
        return `${state.profiles.length}|${state.selectedProfileIndex}`;
      })
      .toBe('3|2');
  });

  test('rename via double-click commits on Enter (duplicates allowed)', async ({
    context,
    extensionId,
  }) => {
    const chrome = chromeIn(await backgroundWorker(context));
    await chrome.setLocal({
      profiles: seedProfiles('Alpha', 'Beta'),
      selectedProfileIndex: 0,
    });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    await popup.getByRole('tab', { name: 'Alpha' }).dblclick();
    const editor = popup.getByRole('textbox', { name: 'Rename profile' });
    await editor.fill('Beta'); // duplicate name on purpose
    await editor.press('Enter');

    await expect(popup.getByRole('tab', { name: 'Beta' })).toHaveCount(2);
    await expect
      .poll(async () => (await storedState(chrome)).profiles[0]?.title)
      .toBe('Beta');
  });

  test('rename via context menu opens the editor and commits', async ({
    context,
    extensionId,
  }) => {
    const chrome = chromeIn(await backgroundWorker(context));
    await chrome.setLocal({
      profiles: seedProfiles('Alpha', 'Beta'),
      selectedProfileIndex: 0,
    });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    await popup.getByRole('tab', { name: 'Alpha' }).click({ button: 'right' });
    await popup.getByRole('menuitem', { name: 'Rename' }).click();
    const editor = popup.getByRole('textbox', { name: 'Rename profile' });
    await expect(editor).toBeVisible();
    await editor.fill('Renamed');
    await editor.press('Enter');
    await expect(
      popup.getByRole('tab', { name: 'Renamed' }),
    ).toHaveCount(1);
    await expect
      .poll(async () => (await storedState(chrome)).profiles[0]?.title)
      .toBe('Renamed');
  });

  test('duplicate appends a copy and selects it', async ({
    context,
    extensionId,
  }) => {
    const chrome = chromeIn(await backgroundWorker(context));
    await chrome.setLocal({
      profiles: seedProfiles('Alpha', 'Beta'),
      selectedProfileIndex: 0,
    });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    await popup.getByRole('tab', { name: 'Alpha' }).click({ button: 'right' });
    await popup.getByRole('menuitem', { name: 'Duplicate' }).click();

    const copyTab = popup.getByRole('tab', { name: 'Copy of Alpha' });
    await expect(copyTab).toHaveCount(1);
    await expect(copyTab).toHaveAttribute('aria-selected', 'true');
    await expect
      .poll(async () => {
        const state = await storedState(chrome);
        return `${state.profiles.length}|${state.selectedProfileIndex}`;
      })
      .toBe('3|2');
  });

  test('drag reorder persists across reopen and keeps the active profile active', async ({
    context,
    extensionId,
  }) => {
    const chrome = chromeIn(await backgroundWorker(context));
    await chrome.setLocal({
      profiles: seedProfiles('Alpha', 'Beta', 'Gamma'),
      selectedProfileIndex: 1,
    });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    await popup
      .getByRole('tab', { name: 'Beta' })
      .dragTo(popup.getByRole('tab', { name: 'Alpha' }));

    await expect
      .poll(async () => {
        const state = await storedState(chrome);
        return state.profiles.map((p) => p.title).join(',');
      })
      .toBe('Beta,Alpha,Gamma');
    // Beta was active and stays active at its new index.
    await expect
      .poll(async () => (await storedState(chrome)).selectedProfileIndex)
      .toBe(0);

    await popup.close();
    const reopened = await context.newPage();
    await reopened.goto(`chrome-extension://${extensionId}/popup.html`);
    const tabs = reopened.getByRole('tab');
    await expect(tabs).toHaveCount(3);
    // Avatar badges render initials only; the accessible name carries the title.
    await expect(tabs.nth(0)).toHaveAttribute('aria-label', 'Beta');
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  });

  test('delete offers an undo snackbar that restores the profile', async ({
    context,
    extensionId,
  }) => {
    const chrome = chromeIn(await backgroundWorker(context));
    await chrome.setLocal({
      profiles: seedProfiles('Alpha', 'Beta', 'Gamma'),
      selectedProfileIndex: 1,
    });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    await popup.getByRole('tab', { name: 'Beta' }).click({ button: 'right' });
    await popup.getByRole('menuitem', { name: 'Delete' }).click();

    // Tab removed immediately, nearest profile becomes active, snackbar shown.
    await expect(popup.getByRole('tab')).toHaveCount(2);
    await expect(
      popup.getByRole('tab', { name: 'Gamma' }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(popup.getByText('Profile deleted')).toBeVisible();

    // Undo restores Beta at its original index and re-selects it.
    await popup.getByRole('button', { name: 'Undo' }).click();
    await expect(popup.getByRole('tab')).toHaveCount(3);
    await expect(
      popup.getByRole('tab', { name: 'Beta' }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect
      .poll(async () => {
        const state = await storedState(chrome);
        return `${state.profiles.map((p) => p.title).join(',')}|${state.selectedProfileIndex}`;
      })
      .toBe('Alpha,Beta,Gamma|1');
  });

  test('delete is disabled for the last remaining profile', async ({
    context,
    extensionId,
  }) => {
    const chrome = chromeIn(await backgroundWorker(context));
    await chrome.setLocal({
      profiles: seedProfiles('Only'),
      selectedProfileIndex: 0,
    });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    await popup.getByRole('tab', { name: 'Only' }).click({ button: 'right' });
    await expect(
      popup.getByRole('menuitem', { name: 'Delete' }),
    ).toBeDisabled();
  });

  test('arrow keys move between tabs', async ({ context, extensionId }) => {
    const chrome = chromeIn(await backgroundWorker(context));
    await chrome.setLocal({
      profiles: seedProfiles('Alpha', 'Beta', 'Gamma'),
      selectedProfileIndex: 0,
    });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    await popup.getByRole('tab', { name: 'Alpha' }).click();
    await popup.keyboard.press('ArrowDown');
    await expect(
      popup.getByRole('tab', { name: 'Beta' }),
    ).toHaveAttribute('aria-selected', 'true');
    await popup.keyboard.press('ArrowDown');
    await expect(
      popup.getByRole('tab', { name: 'Gamma' }),
    ).toHaveAttribute('aria-selected', 'true');
    await popup.keyboard.press('ArrowUp');
    await expect(
      popup.getByRole('tab', { name: 'Beta' }),
    ).toHaveAttribute('aria-selected', 'true');
  });
});
