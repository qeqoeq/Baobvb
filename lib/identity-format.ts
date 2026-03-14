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
