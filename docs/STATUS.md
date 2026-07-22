# STATUS.md — point de situation

> Canal de lecture de l'auditeur. Le repo reste la source de vérité.

---

## B28/B29 — point de situation 22/07

> Rapport seul. **Aucun fix, aucun OTA, aucun deploy, aucun SQL** dans ce point.
> Établi à partir de l'état réel du working tree (git + tsc + vitest), pas de mémoire.

### État Git brut (22/07)

```
$ git status → branche main, up to date with origin/main
  35 fichiers MODIFIÉS non stagés (17 écrans + 5 composants + 8 libs + 5 tests — voir B28 ci-dessous)
  1 fichier non suivi : docs/DIAG-B29.md
$ git stash list → (vide)
$ git log --oneline -5
  bcca9bd docs: consign runner deploy (French fallbacks)   ← dernier push (21/07 18h27)
  7df31b1 docs: status point
  292f8e4 docs: tier words filled + completion micro-OTA (B27)
  bb20f64 feat(B27): fill TIER_DISPLAY_FR with validated branded tier words
  914e1bb docs: close B25-B27 (fixes + OTA + arbitrages), park invite-identity + tier words
```

**Rien n'a été commité ni pushé depuis `bcca9bd`.** Le travail B28 existe **uniquement dans le working tree,
non commité, non pushé, non OTA.** Ce point de situation (docs) est le seul commit ajouté.

### B28 — i18n complète : FAIT vs RESTANT

**Fait (dans le working tree, non commité).** Passe de traduction FR exécutée (glossaire B27 : lecture /
révélation / relation / lieu / monde, tutoiement). **tsc `--noEmit` = 0 erreur ; vitest = 40 fichiers /
1127 tests passés.**

- **Barre de navigation tranchée** (arbitrage) : `Garden·Places·Reveals·You` → **`Jardin·Lieux·Révélations·Toi`**
  (`lib/primary-nav.ts`). Le test `lib/primary-nav.test.ts` n'assert que `label.length > 0` — pas de couplage aux libellés.
- **Écrans traduits (17)** :
  `app/(tabs)/index.tsx`, `app/(tabs)/garden.tsx`,
  `app/place/index.tsx`, `app/place/add.tsx`, `app/place/edit/[id].tsx`, `app/place/[id].tsx`,
  `app/relation/add.tsx`, `app/relation/edit/[id].tsx`, `app/relation/archived.tsx`,
  `app/me/profile.tsx`, `app/me/qr.tsx`, `app/me/scan.tsx`, `app/me/settings.tsx`, `app/me/invite-by-number.tsx`,
  `app/identity/conflict.tsx`, `app/through/[id].tsx`, `app/world/[world].tsx`.
- **Composants (5)** : `components/ui/EgoGraph.tsx`, `components/place/PlacePassSheet.tsx` (**pass sheet**),
  `components/place/PlaceNewReadSheet.tsx`, `components/place/PlaceQuickSignalSheet.tsx`,
  `components/place/PlaceReceivedSheet.tsx`.
- **Libs de contenu (8)** : `lib/primary-nav.ts`, `lib/circle-node-state.ts`, `lib/relation-open-worlds.ts`,
  `lib/place-lived-traces.ts`, `lib/place-quick-signal.ts`, `lib/place-pass.ts`, `lib/places.ts`,
  `lib/relationship-reveal.ts`.
- **Tests mis à jour (assertions EN→FR uniquement, aucune logique touchée, 5 fichiers)** :
  `lib/circle-node-state.test.ts`, `lib/relation-open-worlds.test.ts`, `lib/place-lived-traces.test.ts`,
  `lib/place-pass.test.ts`, `lib/places.test.ts`.
- **Déjà FR depuis B27** (non re-touchés) : `me/edit`, `reveals/index`, `auth/sign-in`, `relation/lexicon`,
  `relation/[id]`, `relation/evaluate/[id]`, `invite/*`, + libs `foundational-reading`, `relation-detail-helpers`,
  `relationship-lexicon`, `progressive-criteria`, `tier-display`.

**Restant (vrai résidu EN visible identifié — NON corrigé, rapport seul).**
- ⚠️ **`app/_layout.tsx` — titres d'en-tête de navigation encore en anglais** (ce fichier n'était pas dans le
  périmètre de la passe) : `'Sign in'` (l.440), `'Edit profile'` (461), `'Settings'` (466), `'Invite by number'`
  (474), `'Edit relation'` (482), `'Save a place'` (489), `'Baobab'` (520, nom de marque — à garder),
  `'Create your card'` (523), `'Relationship lexicon'` (525), `'Foundational reading'` (529),
  `'Archived relationships'` (534). **10 titres visibles à traduire** pour boucler B28.
- Les autres occurrences EN détectées (`in your Bao`, `Ready`, `Waiting`, `Profile`, `Cancel` dans index/garden/
  invite-by-number) sont **des commentaires ou des clés de style** (`mappingSignalWaiting`, `onReadyCardPress`…),
  **pas des strings visibles** — faux positifs vérifiés ligne à ligne.

**Décision en attente Samo pour B28** : (1) valider les libellés de nav `Jardin·Lieux·Révélations·Toi` ;
(2) GO pour compléter les 10 titres `_layout.tsx` ; puis commit unique + OTA (update ID à fournir).
Tant que non validé : **le working tree n'est ni commité ni pushé ni publié.**

### B29 — diagnostic (photo de profil de Sou invisible côté Samo) : **VERDICT = local-only**

Détail complet : `docs/DIAG-B29.md` (créé, non suivi jusqu'à ce commit). Preuves `fichier:ligne` :

- **Persistance à l'upload** : `app/me/edit.tsx:33-50` (`ImagePicker.launchImageLibraryAsync` → `assets[0].uri`,
  URI locale `file://`) → `updatePhotoUri` (`:48`) → champ `photoUri` (`store/useRelationsStore.ts:404`) →
  setter `setPhotoUri` (`:2578-2584`) = mute + `persist()` **AsyncStorage**. Commentaire du champ
  (`:401-403`) : « **Not synced to the backend.** » La photo n'est même pas dans `handleSave()` (`:52-116`).
- **Colonne avatar sur `user_public_profiles`** : **AUCUNE**. Colonnes = `user_id`, `public_profile_id`,
  `created_at` (`supabase/user_public_profiles.sql:16-20`) + `display_name`, `handle`
  (`docs/sql/b8_b4_counterpart_name.sql:36`). Le RPC d'écriture `upsert_user_handle` ne porte que handle + nom.
- **Chemin d'upload vers Supabase Storage** : **INEXISTANT**. Aucun `storage.from` / `.upload(` / bucket dans
  le code applicatif ; aucun bucket configuré dans `supabase/`. Rendu du counterpart = **initiale** en dur
  (`app/relation/[id].tsx:752-754`, `app/(tabs)/garden.tsx:500-502`) ; `my_shared_relationships()` ne renvoie
  aucun champ avatar counterpart.
- **Conclusion factuelle : (A) local-only, jamais uploadée.** Ce n'est PAS un bug de propagation — la sync
  d'avatar n'a jamais été construite côté serveur. Options chiffrées dans `docs/DIAG-B29.md`
  (a1 = libeller « visible par toi uniquement », OTA faible effort, recommandé ; b = vraie sync Storage,
  chantier serveur+client + questions privacy/modération, rompt la doctrine « no PII »). **Aucun code — attente arbitrage.**

### Prochaines actions (attente Samo)
1. **B28** : valider libellés nav + GO titres `_layout.tsx` → commit unique + OTA. Rien n'est publié tant que non validé.
2. **B29** : trancher (a1) vs (b). Rien codé.

---

## 1. Les commits du cycle B25→B27 (tous sur `main` = `origin/main`, working tree propre)

| # | Commit | Sujet | Type | État |
|---|---|---|---|---|
| 1 | `b71a5e2` | **B26** — re-sync foreground (`resyncSharedRelations`, throttle 45s + in-flight, **sans** réconciliation d'orphelins — arbitrage A) | app / OTA | ✅ publié |
| 2 | `85b6696` | **B25** — deep link résolu par `id \|\| canonicalRelationId` + machine 3 états (resolving→found/unavailable, grâce 8s) | app / OTA | ✅ publié |
| 3 | `acbea07` | **B27-app** — traduction FR directe du parcours critique (sans lib i18n), enum `Tier` intact → `lib/tier-display.ts` | app / OTA | ✅ publié |
| 4 | `a191151` | **B27-notifs** — fallbacks push FR (`notification-dispatch-runner:37-38` : « Ton lien est prêt » / « Ouvre Baobab pour le révéler ») | **serveur / Edge Function** | ✅ **déployé en prod (21/07)** |
| 5 | `914e1bb` | docs — clôture B25-B27, arbitrages A/B/C, PARKING invite-identity + tier words | docs | ✅ |
| 6 | `bb20f64` | **B27-tiers** — `TIER_DISPLAY_FR` rempli avec les mots de marque validés | app / OTA | ✅ publié |
| 7 | `292f8e4` | docs — tier words filled + completion micro-OTA | docs | ✅ |

---

## 2. OTA publiés (branch `production`, runtime `1.0.0`, iOS)

| Contenu | Update group | iOS update | Commit |
|---|---|---|---|
| Fixes B25 / B26 / B27-app | `ca43dd0b-2fd0-429b-9e67-61111ef50179` | `019f81ad-773d-7841-87e4-20ea2fd2df19` | `acbea07` |
| Complétion mots de tiers FR | `ca5238ca-3969-4b21-97ea-5b27b5c4e7e5` | `019f81b4-d374-7822-87ea-ede00ab56663` | `bb20f64` |

tsc 0 · vitest 1127/1127 aux deux publications.

---

## 3. Mots de tiers FR — **FAIT**

`lib/tier-display.ts` (vérifié ce jour) — mapping à la couche d'affichage uniquement, enum inchangé :

```
Rooted → Enraciné   Anchor → Pilier   Steady → Stable   Active → Vivant
Forming → Naissant  Distant → Distant  Legend → Légende
```

Surfaces de rendu de tier vérifiées exhaustives : carte de reveal (`relation/[id]`) + lexique, toutes deux
routées par `getTierDisplayLabel`. `badgeLabel`/`getVisibleTierLabel` non consommés ; EgoGraph = géométrie
d'orbite ; garden = readingStatus + micro-signaux. Aucun test ne matche les libellés FR. Commit `bb20f64`,
micro-OTA `019f81b4-d374-7822-87ea-ede00ab56663`. **Rien à refaire.**

---

## 4. Deploy runner B27-notifs — ✅ **FAIT ET VÉRIFIÉ (2026-07-21)**

Le texte push FR vit dans l'Edge Function (hors bundle → **inatteignable par `eas update`**). Déployé en prod
côté Samo, commit `a191151`. Commande exécutée :

```
supabase functions deploy notification-dispatch-runner --no-verify-jwt
```

**Preuve :**
- Verify JWT confirmé **OFF** au dashboard **avant** le deploy.
- Deploy avec `--no-verify-jwt` **réussi**.
- Smoke test `curl` → `{"ok":true}`.
- Cron en **200 sur 3 cycles consécutifs** (18:23–18:25 UTC).

**Règle consignée** (`docs/SUPABASE-REGISTRY.md`, section « Edge Functions — règles de deploy » + Journal 21/07) :
`--no-verify-jwt` est **obligatoire pour tout futur deploy** de cette fonction. La fonction est appelée par le
cron via `x-dispatch-secret` (pas de JWT) ; aucune section `[functions.notification-dispatch-runner]` dans
`config.toml` n'épingle `verify_jwt = false` → un deploy nu reprendrait le défaut `true` et casserait le cron
en 401 (organe déjà réparé 2×). Vérification dashboard Verify JWT = OFF à refaire à chaque deploy.

---

## 5. Prochaines actions

Cycle B25→B27 **clos** — plus aucune tâche technique en attente sur ce cycle.

1. **Terrain** : Sou relance l'app (FR + premier reveal « Légende » l'attend dans les Reveals) → recueillir sa
   réaction verbatim (premier reveal d'une vraie utilisatrice, dans sa langue, avec un mot de marque = la donnée
   produit la plus précieuse générée à ce jour). Ses 3 autres invitations WhatsApp restent à partir.
2. E2E notif FR à confirmer opportunément quand une vraie `reveal_ready` retombe sur les fallbacks (texte FR).
3. Rappels permanents : latence notif 1–4 min = cron minute, **normale, ne pas fixer** ; tout SQL reste STOP.
4. Suite produit : onboarding testeurs externes (3–5). Invite-identity et picker/pass-signal restent **parkés**
   (`docs/PARKING.md`), hors périmètre Phase 0.

---

_Cycle B25→B27 clos 2026-07-21 : 3 fixes app OTA en prod, mots de tiers FR livrés, deploy serveur B27-notifs
fait et vérifié (curl ok + cron 200×3). Rien en attente Samo sur ce cycle._
