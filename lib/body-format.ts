/** Pretty-print JSON objects/arrays for display only. Never throws. */
export function formatBodyForDisplay(text: string): string {
  try {
    const value = JSON.parse(text);
    if (value !== null && typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
  } catch {
    /* not JSON — show as captured */
  }
  return typeof text === 'string' ? text : '';
}
