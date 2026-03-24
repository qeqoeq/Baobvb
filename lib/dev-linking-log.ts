/**
 * Development-only helpers for deep-link / auth redirect debugging.
 * Stripped in production builds; never log secrets (tokens are masked).
 */

export function devLogLinking(label: string, payload: Record<string, unknown>): void {
  if (__DEV__) {
    console.log(`[Baobab][linking] ${label}`, payload);
  }
}

/** Shorten ids/tokens for console output (not cryptographic). */
export function maskIdForLog(value: string | undefined, head = 4, tail = 4): string {
  if (value == null || value === '') return '(empty)';
  const t = value.trim();
  if (t.length <= head + tail) return `${t.slice(0, 2)}…`;
  return `${t.slice(0, head)}…${t.slice(-tail)}`;
}
