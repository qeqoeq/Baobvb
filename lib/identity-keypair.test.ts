import { describe, it, expect, beforeEach } from 'vitest';
import { toBase32Prefix, deriveIdentitySuffix } from './identity-keypair';
import { getMeSnapshot, setIdentitySuffixForTest } from '../store/useRelationsStore';

// loadOrCreateIdentityKeyPair depends on expo-crypto and expo-secure-store
// (native modules); its integration is smoke-tested on device. Tests here
// cover the pure derivation logic that runs in any JS environment.

describe('toBase32Prefix', () => {
  it('all-zero bytes → aaaaaa (each 5-bit group = 0 → "a")', () => {
    // 4 bytes = 32 bits → 6 complete 5-bit groups (30 bits used)
    expect(toBase32Prefix(new Uint8Array([0x00, 0x00, 0x00, 0x00]), 6)).toBe('aaaaaa');
  });

  it('all-0xff bytes → 777777 (each 5-bit group = 31 → "7")', () => {
    expect(toBase32Prefix(new Uint8Array([0xff, 0xff, 0xff, 0xff]), 6)).toBe('777777');
  });

  it('respects requested length', () => {
    expect(toBase32Prefix(new Uint8Array([0x00, 0x00, 0x00, 0x00]), 3)).toBe('aaa');
    expect(toBase32Prefix(new Uint8Array([0xff, 0xff, 0xff, 0xff]), 1)).toBe('7');
  });

  it('only produces lowercase base32 chars', () => {
    const arbitrary = new Uint8Array([0x4b, 0xa3, 0xf2, 0x91, 0xe0]);
    const result = toBase32Prefix(arbitrary, 8);
    expect(result).toMatch(/^[a-z2-7]+$/);
  });
});

describe('deriveIdentitySuffix', () => {
  it('deterministic — same pubkey always yields same suffix', () => {
    const pubkey = new Uint8Array(32);
    expect(deriveIdentitySuffix(pubkey)).toBe(deriveIdentitySuffix(pubkey));
  });

  it('always 6 chars', () => {
    expect(deriveIdentitySuffix(new Uint8Array(32))).toHaveLength(6);
    expect(deriveIdentitySuffix(new Uint8Array(32).fill(0xff))).toHaveLength(6);
  });

  it('only lowercase base32 chars a-z 2-7', () => {
    expect(deriveIdentitySuffix(new Uint8Array(32))).toMatch(/^[a-z2-7]{6}$/);
  });

  it('known vector — 32-zero pubkey → mzuhvl (SHA-256 first 30 bits)', () => {
    // sha256(Uint8Array(32)) = 66 68 7a ad ... (first 4 bytes)
    // 01100110 01101000 01111010 10101101 → groups of 5:
    // 01100 11001 10100 00111 10101 01101 → 12,25,20,7,21,13 → m,z,u,h,v,l
    expect(deriveIdentitySuffix(new Uint8Array(32))).toBe('mzuhvl');
  });

  it('different pubkeys yield different suffixes', () => {
    const a = new Uint8Array(32);
    const b = new Uint8Array(32).fill(1);
    expect(deriveIdentitySuffix(a)).not.toBe(deriveIdentitySuffix(b));
  });
});

describe('setIdentitySuffix store action', () => {
  beforeEach(() => {
    // Reset suffix between tests to avoid cross-test pollution.
    setIdentitySuffixForTest(null);
  });

  it('sets identitySuffix on MeProfile', () => {
    setIdentitySuffixForTest('ab3x7k');
    expect(getMeSnapshot().identitySuffix).toBe('ab3x7k');
  });

  it('null clears the suffix', () => {
    setIdentitySuffixForTest('ab3x7k');
    setIdentitySuffixForTest(null);
    expect(getMeSnapshot().identitySuffix).toBeNull();
  });
});
