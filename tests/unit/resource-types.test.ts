import { describe, expect, it } from 'vitest';
import {
  STANDARD_RESOURCE_TYPES,
  normalizeResourceType,
  resourceTypesFor,
  toggleResourceType,
  typeShortLabel,
  visibleEntries,
} from '~/lib/resource-types';

describe('normalizeResourceType', () => {
  it('maps unknown types to other', () => {
    expect(normalizeResourceType('font')).toBe('other');
    expect(normalizeResourceType('websocket')).toBe('websocket');
    expect(normalizeResourceType('xmlhttprequest')).toBe('xmlhttprequest');
  });
});

describe('visibleEntries', () => {
  const rows = [
    { id: '1', resourceType: 'main_frame' },
    { id: '2', resourceType: 'xmlhttprequest' },
    { id: '3', resourceType: 'font' },
  ];

  it('returns all when selected is empty', () => {
    expect(visibleEntries(rows, []).map((r) => r.id)).toEqual(['1', '2', '3']);
  });

  it('filters to selected types and groups unknown as other', () => {
    expect(visibleEntries(rows, ['xmlhttprequest']).map((r) => r.id)).toEqual([
      '2',
    ]);
    expect(visibleEntries(rows, ['other']).map((r) => r.id)).toEqual(['3']);
  });
});

describe('toggleResourceType', () => {
  it('logs: from all, picking a type selects only that type', () => {
    expect(toggleResourceType([], 'xmlhttprequest', 'logs')).toEqual([
      'xmlhttprequest',
    ]);
  });

  it('logs: removing the last type returns all', () => {
    expect(toggleResourceType(['xmlhttprequest'], 'xmlhttprequest', 'logs')).toEqual(
      [],
    );
  });

  it('logs: all token clears subset', () => {
    expect(toggleResourceType(['script', 'image'], 'all', 'logs')).toEqual([]);
  });

  it('capture: cannot remove the last type', () => {
    expect(toggleResourceType(['main_frame'], 'main_frame', 'capture')).toEqual([
      'main_frame',
    ]);
  });

  it('capture: can add and remove when more than one', () => {
    expect(toggleResourceType(['main_frame'], 'script', 'capture')).toEqual([
      'main_frame',
      'script',
    ]);
    expect(
      toggleResourceType(['main_frame', 'script'], 'script', 'capture'),
    ).toEqual(['main_frame']);
  });
});

describe('websocket resource type (spec 006)', () => {
  it('is a standard type labelled WS', () => {
    expect(STANDARD_RESOURCE_TYPES).toContainEqual({
      value: 'websocket',
      label: 'WebSocket',
      shortLabel: 'WS',
    });
    expect(typeShortLabel('websocket')).toBe('WS');
  });

  it('shows in profile capture filters but not in the Logs filter', () => {
    const values = (mode: 'logs' | 'capture') =>
      resourceTypesFor(mode).map((t) => t.value);
    expect(values('capture')).toContain('websocket');
    expect(values('logs')).not.toContain('websocket');
    expect(values('logs')).toContain('xmlhttprequest');
  });
});
