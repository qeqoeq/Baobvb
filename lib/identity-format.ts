export function normalizeHandleInput(raw: string) {
  const noSpaces = raw.trim().toLowerCase().replace(/\s+/g, '');
  const noAt = noSpaces.replace(/^@+/, '');
  const safe = noAt.replace(/[^a-z0-9._-]/g, '');
  return safe ? `@${safe}` : '';
}

export function deriveAvatarSeed(displayName: string) {
  const seed = displayName.trim().charAt(0).toUpperCase();
  return seed || '?';
}

/**
 * Derives a short, human-readable Baobab code from the publicProfileId.
 * Takes the first 6 hexadecimal characters of the UUID (dashes stripped), uppercased.
 * Displayed alongside the handle for disambiguation: "@yasmine.baobab · F7D3C2"
 * Returns null if the publicProfileId is not yet provisioned.
 */
export function deriveBaobabCode(publicProfileId: string | null | undefined): string | null {
  if (!publicProfileId) return null;
  const raw = publicProfileId.replace(/-/g, '').slice(0, 6).toUpperCase();
  return raw.length >= 4 ? raw : null;
}
