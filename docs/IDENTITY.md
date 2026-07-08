# Baobab — Identity & Keypair

## Scope

Phase 0 : identité locale lisible, aucun réseau, aucune blockchain, aucun token.
Le suffixe `·ab3x7k` aide deux utilisateurs à distinguer visuellement leurs handles.
Aucune vérification cryptographique n'est effectuée à ce stade.

---

## Génération de la paire Ed25519

| Champ | Valeur |
|---|---|
| Algorithme | Ed25519 (courbe de Bernstein, 128 bits de sécurité) |
| Lib | `@noble/ed25519` v1.7.3 (pure-JS, BigInt, Hermes-safe) |
| Entropie | `expo-crypto.getRandomBytesAsync(32)` — CSPRNG natif, indépendant de `globalThis.crypto` |
| Stockage privkey | `expo-secure-store` v15 — iOS Keychain (`WHEN_UNLOCKED`), Android Keystore |
| Clé SecureStore | `baobab.identity.ed25519.privkey` (hex, 64 chars) |
| Export privkey | **Jamais** — aucune API d'export exposée |

### Cycle de vie

- **Génération** : lazy, au premier `loadOrCreateIdentityKeyPair()` après hydration du store (`_layout.tsx`).
- **iOS** : la Keychain **survit à la réinstallation** (comportement Apple par défaut). La même paire est retrouvée. Nouvelle paire seulement si la Keychain a été explicitement purgée (factory reset, MDM enterprise wipe, ou effacement manuel).
- **Android** : Keystore lié à l'installation → nouvelle paire à chaque réinstallation.
- **Échec SecureStore** : capturé silencieusement, `identitySuffix = null` dans le store, handle affiché sans suffixe. Aucun blocage de l'utilisateur. Nouvelle tentative au prochain lancement.

---

## Dérivation du suffixe

```
suffixe = base32_lowercase(SHA-256(pubkey)[0..3], length=6)
```

- SHA-256 de la clé publique Ed25519 (32 bytes).
- Les 4 premiers bytes du hash = 32 bits.
- On extrait les 30 premiers bits (6 groupes de 5 bits).
- Alphabet : `abcdefghijklmnopqrstuvwxyz234567` (RFC 4648 base32, minuscules).
- **6 caractères = 30 bits = ~1 milliard de valeurs distinctes** (2³⁰ = 1 073 741 824).

Vecteur de test : `deriveIdentitySuffix(new Uint8Array(32))` → `'mzuhvl'`
(SHA-256 de 32 zéros = `66 68 7a ad ...` → groupes 5 bits : 01100,11001,10100,00111,10101,01101 → 12,25,20,7,21,13 → m,z,u,h,v,l)

---

## Format du handle

| Contexte | Forme | Exemple |
|---|---|---|
| Serveur (`upsert_user_handle`, QR payload, invite metadata) | Forme propre | `@alice` |
| Affichage profil (`me/profile.tsx`, `me/qr.tsx`) | Forme composée | `@alice·mzuhvl` |

**Le caractère `·` (U+00B7) n'est jamais envoyé au serveur.** La regex serveur `^@[a-z0-9._-]+$` reste inchangée. `me.handle` dans le store contient toujours la forme propre. `me.identitySuffix` est un champ runtime-only (exclus de `persist()`, recomputed at each boot).

---

## Fichiers concernés

| Fichier | Rôle |
|---|---|
| `lib/identity-keypair.ts` | Génération, dérivation, helpers base32/hex |
| `lib/identity-keypair.test.ts` | Tests purs (toBase32Prefix, deriveIdentitySuffix, setIdentitySuffix) |
| `store/useRelationsStore.ts` | `MeProfile.identitySuffix`, `hydrateIdentitySuffix`, `setIdentitySuffixForTest` |
| `app/_layout.tsx` | Appel `loadOrCreateIdentityKeyPair()` après `isHydrated` |
| `app/me/profile.tsx` | Affichage `@handle·suffix` |
| `app/me/qr.tsx` | Affichage `@handle·suffix` (pas dans le payload QR ni le share message) |

---

## FUTURE — Ne pas coder avant la porte Phase 0 (→ PARKING)

Ces usages sont prévus mais intentionnellement hors périmètre Phase 0.

### Signature des passes (CBOR)
Chaque `createPassDelivery` pourrait inclure une signature Ed25519 du payload canonique. Le receveur vérifie avec la pubkey de l'émetteur. Prérequis : registre pubkey serveur.

### Canal E2E Diffie-Hellman (X25519)
La clé Ed25519 peut être convertie en clé X25519 pour un échange Diffie-Hellman. Permet un canal chiffré entre deux appareils. Prérequis : échange de pubkeys via serveur ou QR.

### Attestation device
La pubkey peut être enregistrée sur le serveur comme preuve de possession d'appareil. Prérequis : endpoint `/device-keys`, politique de révocation.

### Rotation de clé
Si l'utilisateur change d'appareil (Android, ou iOS avec Keychain purgée), le suffixe change. Une politique de rotation notifierait les contacts. Prérequis : registre serveur des anciens suffixes.

### Vérification du suffixe affiché (QR v3)
Inclure la pubkey compressée dans le payload QR. Le scanner vérifie que `deriveIdentitySuffix(pubkey) === suffixe affiché`. Prérequis : accord protocole QR v3.
