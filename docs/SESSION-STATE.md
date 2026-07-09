# SESSION-STATE.md — Passation bugs B1→B15

> Règle d'or : le repo est la source de vérité. Ce document POINTE vers fichiers et commits.
> Il ne recopie JAMAIS de code déjà commité. Interdiction de régénérer du code de mémoire.
>
> ⚠️ Document généré hors-repo (claude.ai) à partir du transcript de session.
> Avant commit : vérifier les deux sections marquées ⚠️ À VÉRIFIER dans Claude Code.

## CONTEXTE (5 lignes max)

Projet Baobab (Expo/React Native + Supabase, local-first). Double rôle de l'assistant :
EXÉCUTANT (implémente les fixes) + AUDITEUR (refuse tout [DONE] sans preuve : dumps, sorties
de tests, résultats SQL collés). Session en cours : correction des bugs B1→B9 issus du smoke test du build 27
(commités, build 28 soumis). Nouvelle session : bugs B10→B15 issus du smoke test build 28. Fichiers à lire en premier, dans cet ordre : CLAUDE.md,
docs/SESSION-STATE.md, docs/PHASE-0.md, docs/SUPABASE-REGISTRY.md, docs/SMOKE-TEST.md,
docs/PARKING.md, docs/baobab-design-bible.md si présent. NB : docs/PASSATION.md n'existe pas
encore dans le repo (le doc de passation stratégique vit hors-repo, à committer plus tard).

## ÉTAT ACTUEL — B1→B15

| Bug | Statut | Cause racine | Fix | Preuve | Commit |
|---|---|---|---|---|---|
| B1 — Seed "me" en prod | **DONE prouvé** | `state.me = SEED_ME` à l'init + `...SEED_ME` dans `applyHydratedState` non guardés par `__DEV__` ; `purgeSeedData()` ne couvrait pas `me` | `BLANK_ME` en prod (init + hydratation), purge boot du handle seed `@yasmine.baobab`, `getMeSnapshot` exporté pour tests | Tests M1/M2 ajoutés, 1006/1006 verts (`store/useRelationsStore.ts`, `store/useRelationsStore.test.ts`) | `9788cb0` |
| B2 — Bouton Start silencieux | **DONE prouvé** | `finally { setIsSaving(false) }` réactivait le bouton pendant la nav ; `router.back()` échouait en setup mode (pas d'historique) | `setIsSaving(false)` uniquement sur erreur ; en setup mode succès → `router.replace('/(tabs)')` (`app/me/edit.tsx`) | tsc + 1006/1006 verts | `d3d3bf6` |
| B3 — Clavier non dismissible | **DONE prouvé** | Écrans à `TextInput` sans pattern dismiss complet | Pattern global : `KeyboardAvoidingView` + `keyboardShouldPersistTaps="handled"` + `onScrollBeginDrag={Keyboard.dismiss}` (ScrollView) ou wrapper `Pressable onPress={Keyboard.dismiss}` (View). Écrans couverts : me/edit, place/add, place/edit/[id], relation/add, relation/edit/[id], invite/identity/[relationId], (tabs)/garden, me/invite-by-number | tsc + 1006/1006 verts, 2 commits | `aa6c580` + `eb4ee6d` |
| B4 — Counterpart name absent | **DONE prouvé** | (1) `user_public_profiles` sans colonnes `display_name`/`handle` ; (2) `my_shared_relationships()` ne retournait pas `counterpart_display_name`/`counterpart_handle` | SQL : `docs/sql/b8_b4_counterpart_name.sql` (4 blocs, 5/5 vérifications) + client : `SharedRelationBootstrapInput` + `upsertBootstrappedSharedRelations` + `upsertUserHandle(handle, displayName?)` + `me/edit.tsx` | tsc + 1010/1010 verts | `d0d2b54` (SQL) + `d6c689e` (client) |
| B5 — Tier visible avant reveal | **DONE prouvé** | Bootstrap copie `status='revealed'` depuis le serveur sans `firstViewedAt` → `nameRevealed=true` immédiatement → tier affiché avant ouverture locale | Gate `firstViewedAt !== undefined` ajouté à `nameRevealed` + à toutes les dérives indirectes (garden, EgoGraph, lexique). `openMutualRevealInState` patch `firstViewedAt` au lieu de bail-early. `handleOpenReveal` appelle `revealMutualRelationship` sur tous les paths de succès. CTA "Open reveal" conservé pour `status='revealed'` sans `firstViewedAt` (gate B5 fermé mais path UI ouvert). | tsc + 1018/1018 verts, 8 nouveaux tests | `e7b212f` |
| B6 — Picker de pass filtré | **DONE prouvé** | Nom `'(shared)'` dans le picker rendait le counterpart non identifiable (cascade B4) + filtre manquait `canonicalRelationId` → envoi silencieux possible pour relations sans canonical | Fix B4 résout le nom. Fix B6 : ajout `&&!!r.canonicalRelationId` au filtre `eligibleRelations` (line 202) — une relation sans canonical ne peut pas livrer de pass cross-device (`createPassDelivery` gated dessus). À confirmer sur device au smoke test build 28. | tsc + vitest verts | `301078a` |
| B7 — Back incorrect post-claim | **DONE prouvé** | `invite/identity/[relationId]` présenté en modal → Expo Router empilait une 2e instance de `invite` ; back retombait dessus | Param `fromClaim: '1'` passé de `invite/[relationId]` vers evaluate (3 points de nav, `push` → `replace`) ; dans `evaluate/[id]`, les 4 navigations succès vont vers `/(tabs)` si `isFromClaim` | tsc + 1006/1006 verts | `3a87c94` |
| B8 — Doublons de claim | **DONE prouvé + device** | Diagnostic 2026-07-08 : 0 doublon (110/110 distinct) — base saine. Faux positif ou transient client. Fix préventif : `UNIQUE(relationship_id)` appliqué. Smoke test build 28 : 111/111 distinct ✓ — aucun doublon observé, bouton disabled pendant claim. | `docs/sql/b8_b4_counterpart_name.sql` BLOC 1. | SQL count=111 distinct_ids=111 ; smoke test device validé 2026-07-09 | `d0d2b54` (SQL) |
| B9 — Identité | **DONE prouvé** | Pas de clé d'identité on-device → aucun suffixe distinctif sur le handle | Ed25519 keypair via `@noble/ed25519` v1.7.3 + entropie `expo-crypto.getRandomBytesAsync(32)` (zéro dépendance `globalThis.crypto`) + stockage `expo-secure-store` (`WHEN_UNLOCKED`). Suffixe : SHA-256(pubkey)[0..3] → 30 bits → 6 chars base32 lowercase. Display-only : `@{handle}·{suffix}` dans `me/profile.tsx` et `me/qr.tsx` uniquement — jamais envoyé au serveur, `me.handle` reste propre. `identitySuffix` runtime-only (exclu de `persist()`). iOS Keychain survit à la réinstallation. Spec complète : `docs/IDENTITY.md`. | tsc 0 erreur + 1029/1029 verts, vecteur `deriveIdentitySuffix(Uint8Array(32))` = `'mzuhvl'` | `a19506f` |
| B10 — Reveal not ready (legacy) | **DONE prouvé (client)** — device en validation Samo | Serveur bloqué à `reveal_ready` avec `mutual_score IS NULL` (Guard B migration `20260529`) ; `getEffectiveRevealSnapshot` écrasait le local `revealed` avec le statut serveur moins avancé. | Fix A merge (`lib/relationship-reveal-precedence.ts`) + `syncLocalSnapshotToRevealReady` + Fix B relu-snapshot (`app/relation/[id].tsx`) + correction 3 (pending au lieu de score privé). Pas de SQL. | tsc + 1044/1044 | `402503a` |
| B11 — Nom absent / '(shared)' + propagation (racine : identités auth orphelines) | **DONE (client) — device en validation Samo** | Diagnostic Volet C : la vraie racine est le découplage session Supabase (AsyncStorage, purgée au reinstall) ↔ MeProfile ↔ privkey Keychain (survit) → claims sous identité fantôme, invisibles cross-device. Sous-symptômes : condition `existing.name==='(shared)'` verrouillait le patch ; `invite/identity` n'envoyait jamais `display_name` au serveur. | **Volet A** : `publishHandleBestEffort` depuis `invite/identity` (`28d8d35`). **Volet B** : `counterpartDisplayName` server-owned + cascade `privateLabel ?? counterpartDisplayName ?? name` + nettoyage legacy des `privateLabel` auto-posés à l'hydratation (`4643337`). **Volet C R1+R2** : `reconcileHandleOwnership` au bootstrap + écran `/identity/conflict` (jamais de logout silencieux) (`3228ac4`). Purge SQL 142 comptes de test (voir SUPABASE-REGISTRY, `219522b`). | tsc + 1060/1060 | `28d8d35` `4643337` `3228ac4` |
| B12 — Double écran/sheet sur lien invite | **OPEN — diagnostic à faire** | Ouverture d'un lien invite depuis un état app déjà ouvert empile un deuxième écran ou sheet par-dessus l'existant. | — | — | — |
| B13 — Countdown disparu + scroll fold leak | **OPEN — diagnostic à faire** | Effet de bord du fix B5 sur le layout : le countdown `cooking_reveal` a disparu et un espace vide apparaît au scroll. | — | — | — |
| B14 — Push token non ré-enregistré à la réinstallation | **PROBABLEMENT DISSOUS par la purge 2026-07-09** — à confirmer | Le "No active push token" concernait le compte fantôme `1eadf1cc` (supprimé). Les deux comptes légitimes ont des tokens actifs frais d'aujourd'hui. **Résidu à diagnostiquer plus tard (ne pas traiter maintenant)** : 3 tokens actifs par compte (enregistrements successifs jamais désactivés) → risque de notifications en double ou d'envois vers tokens morts. Lien avec B11 Volet C : les tokens se rattachent à la session auth active, pas au profil affiché. | — | — | — |
| B15 — Handle modifiable après setup | **OPEN — décision D2 figée, à implémenter** | L'utilisateur peut changer son handle en re-entrant dans `me/edit`. D2 : le handle doit être gelé après le setup initial (non modifiable). | — | — | — |

### git status / push — VÉRIFIÉ 2026-07-09

Build 27 : `9788cb0` (B1) → `d3d3bf6` (B2) → `aa6c580` (B3 pt.1) → `eb4ee6d` (B3 pt.2) → `3a87c94` (B7) → `4ee8871` (runner) → `d0d2b54` (B4+B8 SQL) → `d6c689e` (B4 client) → `301078a` (B6) → `e7b212f` (B5) → `a19506f` (B9) → `5bbb39e` (docs session close, build 28).
Build 28 soumis et validé smoke test. Branche main, working tree propre.

## DÉCISIONS FIGÉES DE CETTE SESSION (non renégociables)

- **B9** : identité = paire Ed25519 générée on-device, clé privée en SecureStore jamais
  exportée, handle affiché `@{name}·{6 chars base32 du SHA-256 de la pubkey}`, AUCUNE
  blockchain/token/dépendance réseau, usages futurs documentés dans docs/IDENTITY.md uniquement.
- **B5** : le tier n'apparaît NULLE PART tant que CE côté n'a pas ouvert son reveal ;
  cinématique à la première ouverture, par side.
- **B6** : le picker de pass liste toutes les relations revealed avec `canonicalRelationId`,
  aucun filtre de score/tier.
- **B1** : en production, `me` s'initialise sur `BLANK_ME` (`isProfileSetup: false` →
  redirect `/me/edit?setup=1`) ; la purge boot détecte le seed par le handle
  `@yasmine.baobab` et préserve `internalAuthUserId`.
- **B2** : jamais de `finally` sur `setIsSaving` ; désactivation uniquement sur les branches
  d'erreur ; succès en setup mode → `router.replace('/(tabs)')`.
- **B3** : pattern clavier standard du projet — ScrollView : `keyboardShouldPersistTaps="handled"`
  + `onScrollBeginDrag={Keyboard.dismiss}` + `KeyboardAvoidingView` (behavior padding iOS /
  height Android) ; View simple : wrapper `Pressable onPress={Keyboard.dismiss}` + style `kav`.
- **B7** : le flux claim utilise `router.replace` (jamais `push`) et propage `fromClaim: '1'`
  jusqu'à evaluate ; toute sortie succès d'un flux claim atterrit sur `/(tabs)`.
- **B4** : le fix passera par des colonnes `display_name`/`handle` sur `user_public_profiles`
  synchronisées dans `upsert_user_handle`, exposées par `my_shared_relationships()` — pas de
  lecture directe côté client.

VÉRIFIÉ 2026-07-08 : aucune décision supplémentaire prise sur B5/B6/B8/B9 après la fin du
transcript. Les décisions ci-dessus sont complètes. app.json bloqué : expo-font ajouté en plugin
mais aucun import dans le code — attente de confirmation avant commit.

**Nouvelles décisions figées — smoke test build 28 (2026-07-09)**

- **D1** : le nom du counterpart est affiché partout (fiche relation, picker, garden) **avant**
  le reveal — pas seulement après. Le reveal expose le score, pas le nom.
- **D2** : le handle est gelé après le setup initial (`me/edit?setup=1`). L'utilisateur ne peut
  plus modifier son handle une fois le profil créé. L'UI doit supprimer le champ ou le rendre
  read-only dans les sessions post-setup.

## SQL EN ATTENTE (verbatim)

**B8 — diagnostic doublons. STOP : Samo applique dans le SQL Editor et colle le résultat.**

```sql
-- B8 : détecter les doublons de claim
select
  relationship_id,
  count(*)                  as row_count,
  array_agg(status)         as statuses,
  min(created_at)::date     as first,
  max(created_at)::date     as last
from public.shared_relationship_reveals
group by relationship_id
having count(*) > 1
order by row_count desc;

-- Total global
select count(*), count(distinct relationship_id) as distinct_ids
from public.shared_relationship_reveals;
```

Vérification post-apply : lecture seule, aucune vérification de grant nécessaire.
Interprétation : `row_count > 1` sur un même `relationship_id` → doublon confirmé →
contrainte `UNIQUE(relationship_id)` absente → fix = contrainte SQL + client (bouton
disabled pendant claim). Le SQL du fix B4 (ALTER TABLE `user_public_profiles` +
CREATE OR REPLACE `upsert_user_handle` + `my_shared_relationships()`) sera écrit en une
seule passe après ce résultat — il n'est PAS encore rédigé, ne pas le régénérer de mémoire.

## PIÈGES CONNUS

Rencontrés dans cette session :
- Claude Code : `Update()` refuse d'éditer un fichier non lu ("File must be read first") —
  toujours `Read` avant `Update` sur un fichier pas encore ouvert dans la session.
- zsh : les chemins avec crochets (`app/place/edit/[id].tsx`) déclenchent le globbing
  ("no matches found") — toujours quoter les chemins dans les commandes bash.
- B7 : présenter un écran en modal puis `router.replace` depuis ce modal empile une nouvelle
  instance dans le stack principal au lieu de réutiliser l'existante.

Rappels permanents :
- Révoquer `anon` explicitement sur toute fonction recréée (3 incidents à ce jour).
- Le dequeue retente les `failed` — ne JAMAIS purger en marquant `failed` : `DELETE`.
- STOP avant tout SQL : Samo applique dans le SQL Editor, jamais l'assistant.
- Un prompt = une tâche.
- Preuve avant [DONE] (tests verts, sortie de commande, résultat SQL collé).
- Jamais de push sans demande explicite (exception : le push de ce handover est autorisé).
- Consigner tout changement SQL appliqué dans docs/SUPABASE-REGISTRY.md avec vérification
  de grants pre/post.

## PROCHAINE ACTION

**Session B10–B15** — corriger dans l'ordre, un commit par bug, preuve avant [DONE] :

1. **B10** — Implémenter le fix (deux fichiers, aucun SQL) après validation du diagnostic :
   - `lib/relationship-reveal-precedence.ts` : guard "ne pas downgrader local `revealed`"
   - `app/relation/[id].tsx:462` : fallback local si Guard B bloque le serveur
2. **B11** — Diagnostic : propagation du nom B4 aux relations existantes + implémentation D1
3. **B12** — Diagnostic : double écran/sheet sur lien invite
4. **B13** — Diagnostic : countdown disparu + scroll fold leak (effet de bord B5)
5. **B14** — Diagnostic : push token non ré-enregistré à la réinstallation
6. **B15** — Implémenter D2 : handle gelé après setup

---
Session B1–B9 close (build 28 soumis). Session B10–B15 en cours.
