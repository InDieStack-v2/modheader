import { describe, expect, it } from 'vitest';
import {
  BADGE_COLOR_LOCKED,
  BADGE_COLOR_NORMAL,
  BADGE_COLOR_PAUSED,
  BADGE_COLOR_RECORDING,
  toolbarBadge,
} from '~/lib/toolbar-badge';

const active = {
  paused: false,
  headerCount: 2,
  lockedElsewhere: false,
  recording: false,
};

describe('toolbarBadge', () => {
  it('shows pause over every other state', () => {
    expect(
      toolbarBadge({ ...active, paused: true, recording: true }),
    ).toEqual({ icon: 'grey', text: '❚❚', color: BADGE_COLOR_PAUSED });
  });

  it('clears the badge when nothing is being modified', () => {
    expect(toolbarBadge({ ...active, headerCount: 0 })).toEqual({
      icon: 'grey',
      text: '',
    });
  });

  it('shows lock when the active tab is not the locked tab', () => {
    expect(toolbarBadge({ ...active, lockedElsewhere: true })).toEqual({
      icon: 'grey',
      text: '🔒',
      color: BADGE_COLOR_LOCKED,
    });
  });

  it('shows a rec emoji while the selected profile is recording', () => {
    expect(toolbarBadge({ ...active, recording: true })).toEqual({
      icon: 'color',
      text: '🔴',
      color: BADGE_COLOR_RECORDING,
    });
  });

  it('keeps lock over recording when the active tab is not the locked tab', () => {
    expect(
      toolbarBadge({ ...active, lockedElsewhere: true, recording: true }),
    ).toEqual({ icon: 'grey', text: '🔒', color: BADGE_COLOR_LOCKED });
  });

  it('shows the header count when idle and modifying', () => {
    expect(toolbarBadge(active)).toEqual({
      icon: 'color',
      text: '2',
      color: BADGE_COLOR_NORMAL,
    });
  });
});
