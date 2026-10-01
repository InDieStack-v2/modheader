export const BADGE_COLOR_NORMAL = '#db4343';
export const BADGE_COLOR_PAUSED = '#666';
export const BADGE_COLOR_LOCKED = '#ff8e8e';
/** Fully transparent so only the rec emoji shows — no badge chip. */
export const BADGE_COLOR_RECORDING = '#f00';

export type ToolbarBadge = {
  icon: 'color' | 'grey';
  text: string;
  color?: string;
};

/** Toolbar badge for pause / empty / lock / recording / header count. */
export function toolbarBadge(input: {
  paused: boolean;
  headerCount: number;
  lockedElsewhere: boolean;
  recording: boolean;
}): ToolbarBadge {
  if (input.paused) {
    return { icon: 'grey', text: '❚❚', color: BADGE_COLOR_PAUSED };
  }
  if (input.headerCount === 0) {
    return { icon: 'grey', text: '' };
  }
  if (input.lockedElsewhere) {
    return { icon: 'grey', text: '🔒', color: BADGE_COLOR_LOCKED };
  }
  if (input.recording) {
    return { icon: 'color', text: 'REC', color: BADGE_COLOR_RECORDING };
  }
  return {
    icon: 'color',
    text: String(input.headerCount),
    color: BADGE_COLOR_NORMAL,
  };
}
