import { sha256 } from '@noble/hashes/sha256';
import { sha512 } from '@noble/hashes/sha512';
import * as ed from '@noble/ed25519';
// expo-crypto and expo-secure-store are imported lazily inside
// loadOrCreateIdentityKeyPair so this module is importable in Vitest (which
// cannot parse react-native/index.js Flow syntax at the top-level).

// Hermes-safe SHA-512 wiring (B16). @noble/ed25519 v1.7.3's getPublicKey needs
// SHA-512, and its default utils.sha512 requires WebCrypto (self.crypto.subtle)
// or Node's crypto — neither exists on Hermes, so on-device getPublicKey threw
// systematically and identitySuffix stayed null in production (the failure was
// swallowed by the catch below). Wire a pure-JS SHA-512 from @noble/hashes so
// getPublicKey works in every environment. Unconditional: the override is used
// in Node/Vitest too, so tests exercise the exact on-device code path.
//
// Exported so a test can assert it is actually installed — if the assignment
// below is ever removed, Node's crypto would silently keep getPublicKey working
// and the regression would go unnoticed (the exact false-assurance trap of B16).
export const hermesSafeSha512 = (...m: Uint8Array[]): Promise<Uint8Array> =>
  Promise.resolve(sha512(ed.utils.concatBytes(...m)));
ed.utils.sha512 = hermesSafeSha512;

const STORE_KEY = 'baobab.identity.ed25519.privkey';
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const SUFFIX_CHARS = 6; // 30 bits from SHA-256(pubkey)

function uint8ToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToUint8(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

export function toBase32Prefix(bytes: Uint8Array, length: number): string {
  let result = '';
  let bits = 0;
  let buffer = 0;
  for (let i = 0; i < bytes.length && result.length < length; i++) {
    buffer = (buffer << 8) | bytes[i];
    bits += 8;
    while (bits >= 5 && result.length < length) {
      bits -= 5;
      result += BASE32_ALPHABET[(buffer >> bits) & 0x1f];
    }
  }
  return result;
}

export function deriveIdentitySuffix(pubkey: Uint8Array): string {
  return toBase32Prefix(sha256(pubkey), SUFFIX_CHARS);
}

/**
 * Loads the Ed25519 keypair from SecureStore, or generates a new one.
 *
 * Private key bytes come from expo-crypto — no dependency on globalThis.crypto.
 * The private key is stored as hex and never exported beyond this module.
 *
 * iOS: SecureStore survives reinstall (Keychain persists). New keypair only
 * if the Keychain was explicitly purged (factory reset, enterprise wipe, or
 * manual Keychain clear). Android: Keystore tied to the app install — wiped
 * on uninstall.
 *
 * Returns { suffix } on success, null on SecureStore failure (graceful
 * degradation — handle displays without suffix, no user-visible error).
 */
export async function loadOrCreateIdentityKeyPair(): Promise<{ suffix: string } | null> {
  try {
    // Lazy imports keep the module parseable by Vitest (react-native uses Flow
    // which rolldown cannot parse at the top level of a test import chain).
    const [Crypto, SecureStore] = await Promise.all([
      import('expo-crypto'),
      import('expo-secure-store'),
    ]);

    let privHex = await SecureStore.getItemAsync(STORE_KEY);
    if (!privHex) {
      // expo-crypto guarantees CSPRNG regardless of globalThis.crypto availability.
      const randomBytes = await Crypto.getRandomBytesAsync(32);
      privHex = uint8ToHex(randomBytes);
      await SecureStore.setItemAsync(STORE_KEY, privHex, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED,
      });
    }
    const privBytes = hexToUint8(privHex);
    const pubkey = await ed.getPublicKey(privBytes);
    const suffix = deriveIdentitySuffix(pubkey);
    return { suffix };
  } catch (err) {
    // Unconditional (B16): logged in production too so a device-attached
    // Xcode/Console.app session surfaces the real error instead of a silent
    // null suffix. Message only — no stack, no PII, no key material.
    console.error(
      '[identity] loadOrCreateIdentityKeyPair failed:',
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
