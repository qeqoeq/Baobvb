# Rapport de diagnostic — B29

> Photo de profil de Sou invisible pour Samo. Deuxième session testeuse (Sou, 21/07).
> **Diagnostic seul — aucune ligne de production modifiée.** Preuves `fichier:ligne`.
> STOP : attente de l'arbitrage Samo avant tout code.

---

## VERDICT — (A) photo **local-only, jamais uploadée**. Ce n'est PAS un bug de propagation.

La sync d'avatar n'a **jamais été construite côté serveur**. Il n'existe aucun chemin d'upload qui
« échouerait » : il n'y a pas de chemin du tout. La photo de Sou vit uniquement dans son AsyncStorage ;
Samo ne peut structurellement voir qu'un cercle coloré avec l'initiale dérivée du nom de Sou.

---

## Trace complète

### 1. La photo locale — où elle est stockée

| Étape | Fichier:ligne | Ce qui circule |
|---|---|---|
| Sélection | `app/me/edit.tsx:33-50` | `ImagePicker.launchImageLibraryAsync` → `result.assets[0].uri` = **URI locale** (`file://…`), pas du base64. `quality 0.8`, `allowsEditing`, `aspect [1,1]`. |
| Écriture store | `app/me/edit.tsx:48` | `updatePhotoUri(uri)` |
| Champ MeProfile | `store/useRelationsStore.ts:404` | `photoUri?: string \| null` |
| Setter | `store/useRelationsStore.ts:2578-2584` | `setPhotoUri` → mute `state.me.photoUri` puis `persist()` (AsyncStorage) |

**Le commentaire du champ tranche à lui seul** (`store/useRelationsStore.ts:401-403`) :
> « Local photo URI — set from the device photo library via expo-image-picker. **Persisted in AsyncStorage. Not synced to the backend.** »

Fait notable : la photo n'est même **pas incluse dans `handleSave()`** (`app/me/edit.tsx:52-116`). La sauvegarde
n'envoie que `displayName` / `handle` / `avatarSeed` (via `updateMe` + `upsertUserHandle`). `photoUri` est écrit
localement au moment du pick et ne transite par **aucun** appel serveur.

### 2. Envoi serveur — inexistant

- **Aucun code d'upload d'image.** `grep` sur `storage.from`, `.upload(`, `uploadAsync`, `createBucket`,
  bucket avatars → zéro résultat applicatif. (Le seul `base64`/`writeAsStringAsync` est `app/me/qr.tsx:55-58`,
  qui sauve l'image du **QR**, sans rapport.)
- **Aucun bucket Storage** configuré dans `supabase/`.
- **Table `user_public_profiles`** (`supabase/user_public_profiles.sql:16-20` + `docs/sql/b8_b4_counterpart_name.sql:36`) :
  colonnes = `user_id`, `public_profile_id`, `created_at`, `display_name`, `handle`. **Aucune colonne
  avatar / photo / image_url / avatar_url.**
- **Écriture serveur réelle** (`lib/public-profile.ts:38-50`) : RPC `upsert_user_handle(p_handle, p_display_name)`
  → sync `handle` + `display_name` seulement. Pas de photo dans la signature.

→ La photo n'atteint jamais le réseau.

### 3. Rendu de l'avatar du counterpart — toujours une initiale

- `app/relation/[id].tsx:752-754` : `<Text>{(relation.avatarSeed || privateLabel.charAt(0) || '?').toUpperCase()}</Text>`
- `app/(tabs)/garden.tsx:500-502` : idem, couleur dérivée du nom via `getAvatarPersonalColor`.
- `my_shared_relationships()` ne renvoie **aucune** photo : colonnes counterpart = `counterpart_display_name`,
  `counterpart_handle` (`docs/sql/b8_b4_counterpart_name.sql:143`). `grep counterpart_avatar` = zéro.

### 4. avatarSeed — c'est une initiale, pas un vrai seed d'avatar

- `lib/identity-format.ts:8-11` `deriveAvatarSeed(displayName)` = **première lettre du nom en majuscule** (`|| '?'`).
  Ce n'est pas un seed DiceBear/boring-avatars.
- Propagation serveur uniquement dans le flux d'invitation :
  `supabase/migrations/20260607000000_invite_inviter_identity_snapshot.sql` — colonne
  `relationship_invites.inviter_avatar_seed`, commentaire explicite (l.55-57) :
  > « Never a phone, email, or PII fragment — **only an opaque seed used to derive an abstract avatar.** »

→ Le counterpart ne reçoit, au mieux, que l'initiale/seed abstrait — jamais la photo réelle.

---

## Les 6 faits qui tranchent le verdict (A)

1. `photoUri` documenté « **Not synced to the backend** », persiste en AsyncStorage seul.
2. **Aucun code d'upload** n'existe → pas de « chemin qui échoue ».
3. `user_public_profiles` **sans colonne photo/avatar**.
4. `my_shared_relationships()` ne renvoie **aucun** champ photo counterpart.
5. Rendu du counterpart **câblé en dur sur une initiale**.
6. La seule donnée « avatar » serveur→counterpart est `inviter_avatar_seed` (texte = initiale, « no PII »).

---

## Options pour arbitrage (aucune codée — décision Samo)

### Option (a) — Assumer le local-only, clarifier l'UI. **Effort : faible (≈ ½ session, OTA).**

La photo reste un confort strictement personnel (elle personnalise les écrans de Sou : `me/profile`, `me/qr`,
centre de l'`EgoGraph`). On arrête juste de laisser croire qu'elle est partagée.

- Deux sous-variantes :
  - **a1 — libeller** : sous le picker de photo dans `me/edit.tsx`, ajouter un texte discret
    « Visible par toi uniquement » (tutoiement). Honnête, zéro régression, garde la perso locale.
  - **a2 — masquer** : retirer le picker de photo tant que la sync n'existe pas. Plus radical, supprime une
    fonctionnalité que Sou apprécie déjà → **non recommandé** (contredit « on n'enlève pas ce qui marche localement »).
- **Recommandation : a1.** OTA-able, aucun risque, aucun chantier serveur, aucune question privacy.
- Limite : ne répond pas au désir réel de Sou (« que Samo me voie »). C'est un pansement honnête, pas la feature.

### Option (b) — Sync réelle via Supabase Storage. **Effort : élevé (chantier serveur + client + privacy).**

Construire la fonctionnalité qui n'existe pas. Décomposition :

1. **Serveur (STOP → Samo)** :
   - Bucket Storage `avatars` (privé), politiques RLS d'accès (qui peut lire l'avatar de qui — seulement un
     counterpart avec une relation `revealed` ? ou tout profil public ?).
   - Colonne `user_public_profiles.avatar_url` (ou `avatar_path`) + extension de `upsert_user_handle` (ou nouveau RPC).
   - Extension de `my_shared_relationships()` : renvoyer `counterpart_avatar_url`.
2. **Client (OTA)** :
   - Upload dans `handlePickPhoto`/`handleSave` (redimensionnement, compression, format), gestion d'échec réseau,
     état de chargement.
   - Rendu : `<Image>` counterpart quand `avatar_url` présent, fallback initiale sinon (garder la cascade actuelle).
3. **Questions à trancher AVANT de coder** :
   - **Privacy** : la photo est de la PII visible. Aujourd'hui l'app est explicitement « no PII, abstract avatar »
     (cf. commentaire `inviter_avatar_seed`). Introduire des vraies photos **rompt cette doctrine** — décision produit.
     Visible par qui exactement : counterpart révélé seulement, ou tout porteur du handle via `lookup_public_profile` ?
   - **Modération** : photos uploadées = risque de contenu inapproprié. Aucun outil de modération n'existe. En Phase 0
     (TestFlight, cercle restreint) le risque est faible, mais à documenter avant l'App Store review.
   - **Coût/rétention** : stockage, purge à la suppression de compte (la purge cascade actuelle devrait inclure le bucket).
   - **Cohérence identité** : l'avatar déterministe (initiale colorée) est actuellement un choix esthétique assumé
     (Jardin de Nuit). Mélanger photos réelles + initiales fragmente l'esthétique — à valider avec le chantier design.

**Synthèse recommandée** : (a1) maintenant en OTA pour arrêter le malentendu, et **parker (b)** comme décision
produit post-Phase 0 (elle touche à la doctrine « no PII » et au chantier design Jardin de Nuit — hors périmètre
Phase 0). À trancher par Samo.

---

_Diagnostic seul. Aucune modification de code de production. STOP — attente de l'arbitrage avant tout fix._
