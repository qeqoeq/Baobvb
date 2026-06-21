import { describe, expect, it } from 'vitest';

import { normalizePlaceIdentityName } from './place-identity-key';

describe('normalizePlaceIdentityName', () => {
  it('lowercases and strips accents', () => {
    expect(normalizePlaceIdentityName('Café Orée')).toBe('cafe oree');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizePlaceIdentityName('  Café Orée  ')).toBe('cafe oree');
  });

  it('treats different casing as equivalent', () => {
    expect(normalizePlaceIdentityName('CAFÉ ORÉE')).toBe('cafe oree');
  });

  it('is stable for already-plain ASCII input', () => {
    expect(normalizePlaceIdentityName('Cafe Oree')).toBe('cafe oree');
  });

  it('strips multiple diacritics in the same string', () => {
    expect(normalizePlaceIdentityName("Éléphant À l'Opéra")).toBe("elephant a l'opera");
  });

  it('returns an empty string for empty input', () => {
    expect(normalizePlaceIdentityName('')).toBe('');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizePlaceIdentityName('   ')).toBe('');
  });

  it('preserves internal punctuation, matching normalizeForSearch behavior', () => {
    expect(normalizePlaceIdentityName("L'Orée Café")).toBe("l'oree cafe");
  });

  it('is pure and deterministic — same input always yields the same output', () => {
    const input = 'Café Orée';
    const first = normalizePlaceIdentityName(input);
    const second = normalizePlaceIdentityName(input);
    expect(first).toBe(second);
    expect(input).toBe('Café Orée');
  });
});
