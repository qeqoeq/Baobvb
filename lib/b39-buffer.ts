// [B39] TEMPORARY — module-level in-memory diagnostic buffer.
//
// Not React state, not AsyncStorage: a plain module array so it captures
// COLD-START events (bootstrap ↔ hydration) that happen BEFORE any screen mounts.
// Bounded to 100 entries. Read on-screen via the hidden panel in app/me/profile.tsx.
// Remove the whole [B39] probe (this file + its call sites + the panel) by grepping [B39].

export type B39Entry = { ts: number; label: string; payload: string };

const MAX_ENTRIES = 100;
const buffer: B39Entry[] = [];

/** Append one diagnostic entry. Serializes payload defensively; never throws. */
export function b39Push(label: string, payload: unknown): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(payload);
  } catch {
    serialized = String(payload);
  }
  buffer.push({ ts: Date.now(), label, payload: serialized });
  if (buffer.length > MAX_ENTRIES) {
    // Keep the most recent MAX_ENTRIES (drop from the front).
    buffer.splice(0, buffer.length - MAX_ENTRIES);
  }
}

/** Chronological snapshot of the captured entries (oldest first). */
export function b39Entries(): readonly B39Entry[] {
  return buffer;
}
