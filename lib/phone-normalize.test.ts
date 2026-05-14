import { describe, it, expect } from 'vitest';
import { normalizePhoneForAnchor } from './phone-normalize';

// ── FR ───────────────────────────────────────────────────────────────────────

describe('normalizePhoneForAnchor — France', () => {
  it('normalizes a local FR number with spaces and defaultCountry FR', () => {
    const result = normalizePhoneForAnchor('06 12 34 56 78', 'FR');
    expect(result?.e164).toBe('+33612345678');
    expect(result?.country).toBe('FR');
  });

  it('normalizes an international FR number without defaultCountry', () => {
    const result = normalizePhoneForAnchor('+33 6 12 34 56 78');
    expect(result?.e164).toBe('+33612345678');
    expect(result?.country).toBe('FR');
  });

  it('strips all formatting and produces the same E.164 regardless of spacing', () => {
    const a = normalizePhoneForAnchor('+33612345678');
    const b = normalizePhoneForAnchor('+33 6 12 34 56 78');
    const c = normalizePhoneForAnchor('06 12 34 56 78', 'FR');
    expect(a?.e164).toBe(b?.e164);
    expect(b?.e164).toBe(c?.e164);
  });

  it('returns nationalNumber without country code', () => {
    const result = normalizePhoneForAnchor('+33612345678');
    expect(result?.nationalNumber).toBe('612345678');
  });
});

// ── US ───────────────────────────────────────────────────────────────────────

describe('normalizePhoneForAnchor — United States', () => {
  it('normalizes a US number in parenthetical format with defaultCountry US', () => {
    const result = normalizePhoneForAnchor('(415) 555-2671', 'US');
    expect(result?.e164).toBe('+14155552671');
    expect(result?.country).toBe('US');
  });

  it('normalizes a US number with international prefix, no defaultCountry needed', () => {
    const result = normalizePhoneForAnchor('+1 415 555 2671');
    expect(result?.e164).toBe('+14155552671');
    expect(result?.country).toBe('US');
  });
});

// ── CH ───────────────────────────────────────────────────────────────────────

describe('normalizePhoneForAnchor — Switzerland', () => {
  it('normalizes a CH local mobile number with defaultCountry CH', () => {
    const result = normalizePhoneForAnchor('079 123 45 67', 'CH');
    expect(result?.e164).toBe('+41791234567');
    expect(result?.country).toBe('CH');
  });
});

// ── UK ───────────────────────────────────────────────────────────────────────

describe('normalizePhoneForAnchor — United Kingdom', () => {
  // Territorial nuance: libphonenumber assigns some +44 ranges to British
  // Crown Dependencies (GG=Guernsey, JE=Jersey, IM=Isle of Man) rather than GB.
  // For pending_phone_anchor purposes, the key is e164, not the country code.
  // We assert on e164 only; country is returned as-is from the ITU metadata.
  it('normalizes a +44 number to correct E.164 form', () => {
    const result = normalizePhoneForAnchor('+44 7911 123456');
    expect(result?.e164).toBe('+447911123456');
    expect(result).not.toBeNull();
  });

  it('normalizes a UK-context local number to correct E.164 form', () => {
    const result = normalizePhoneForAnchor('07911 123456', 'GB');
    expect(result?.e164).toBe('+447911123456');
    expect(result).not.toBeNull();
  });
});

// ── Invalid / null cases ─────────────────────────────────────────────────────

describe('normalizePhoneForAnchor — invalid / null cases', () => {
  it('returns null for an empty string', () => {
    expect(normalizePhoneForAnchor('')).toBeNull();
  });

  it('returns null for a whitespace-only string', () => {
    expect(normalizePhoneForAnchor('   ')).toBeNull();
  });

  it('returns null for a number that is too short', () => {
    expect(normalizePhoneForAnchor('123', 'FR')).toBeNull();
  });

  it('returns null for a clearly invalid number', () => {
    expect(normalizePhoneForAnchor('not-a-number', 'FR')).toBeNull();
  });

  it('returns null for a number with no country context and no international prefix', () => {
    // Without a country hint, a bare "06..." is unresolvable.
    expect(normalizePhoneForAnchor('0612345678')).toBeNull();
  });

  it('returns null when defaultCountry is absent and number is ambiguous', () => {
    expect(normalizePhoneForAnchor('12345')).toBeNull();
  });
});

// ── Identity / dedup contract ─────────────────────────────────────────────────

describe('normalizePhoneForAnchor — dedup contract', () => {
  it('produces the same E.164 for the same number regardless of input format', () => {
    const inputs: [string, string | undefined][] = [
      ['+33612345678', undefined],
      ['+33 6 12 34 56 78', undefined],
      ['06 12 34 56 78', 'FR'],
      ['06-12-34-56-78', 'FR'],
      ['0612345678', 'FR'],
    ];

    const results = inputs.map(([raw, country]) =>
      normalizePhoneForAnchor(raw, country)?.e164,
    );

    const unique = new Set(results.filter(Boolean));
    expect(unique.size).toBe(1);
    expect([...unique][0]).toBe('+33612345678');
  });
});
