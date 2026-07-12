# SESSION-STATE.md — Passation bugs B1→B21

> Règle d'or : le repo est la source de vérité. Ce document POINTE vers fichiers et commits.
> Il ne recopie JAMAIS de code déjà commité. Interdiction de régénérer du code de mémoire.
>
> ⚠️ Document généré hors-repo (claude.ai) à partir du transcript de session.
> Avant commit : vérifier les deux sections marquées ⚠️ À VÉRIFIER dans Claude Code.

## CONTEXTE (5 lignes max)

Projet Baobab (Expo/React Native + Supabase, local-first). Double rôle de l'assistant :
EXÉCUTANT (implémente les fixes) + AUDITEUR (refuse tout [DONE] sans preuve : dumps, sorties
de tests, résultats SQL collés). Session en cours : correction des bugs B1→B9 issus du smoke test du build 27
(commités, build 28 soumis). Nouvelle session : bugs B10→B16 issus du smoke test build 28 (B16 = suffixe null Hermes). Fichiers à lire en premier, dans cet ordre : CLAUDE.md,
docs/SESSION-STATE.md, docs/PHASE-0.md, docs/SUPABASE-REGISTRY.md, docs/SMOKE-TEST.md,
docs/PARKING.md, docs/baobab-design-bible.md si présent. NB : docs/PASSATION.md n'existe pas
encore dans le repo (le doc de passation stratégique vit hors-repo, à committer plus tard).

## ÉTAT ACTUEL — B1→B21

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
| B12 — Double écran/sheet sur lien invite | **DONE (client)** — à vérifier device build 29 | En production, le linking natif d'expo-router route l'URL vers `/invite/[relationId]` ET le handler manuel (fallback dev-client, `_layout.tsx`) le faisait aussi via `router.push` → deux instances empilées. | Guard `pathname` (via `pathnameRef` live) : skip si un écran invite est déjà actif ; marquage de l'URL **avant** navigation (intention, pas complétion) pour fermer la course avec le linking natif ; `push`→`replace`. `devLogLinking` conservés pour la vérif device. | tsc + 1062/1062 | `53767df` |
| B13 — Countdown disparu + scroll fold leak | **Scroll leak DONE ; countdown = à observer build 29** | (1) Fuite scroll : l'overlay cinématique était en absolute-fill **dans la carte d'action** → le rebond d'overscroll du ScrollView laissait voir le contenu dessous. (2) Countdown : suspecté effet de bord du remap B5 `revealed→reveal_ready`. | (1) Overlay déplacé à l'**échelle écran** (sibling du ScrollView, `styles.screen`), bounce conservé (`841be6d`). (2) **PREUVE** : test pipeline `getEffectiveRevealSnapshot` (C1-C4) → `status`/`unlockAt` **survivent** pour tous les états bien formés (C1 serveur ok, C2 serveur null) ; le countdown ne disparaît légitimement que si le serveur est déjà `reveal_ready` (C3) ou via une ligne serveur malformée sans `unlock_at` (C4, jamais produite — le serveur pose `unlock_at` atomiquement). **Pas de bug de précédence, aucun changement prod** (`0b162d6`). Hypothèse smoke test : cooking 15s écoulé, les deux côtés `in` → countdown correctement absent. | tsc + 1066/1066 | `841be6d` (scroll) · `0b162d6` (preuve countdown) |
| B14 — Push token non ré-enregistré à la réinstallation | **PROBABLEMENT DISSOUS par la purge 2026-07-09** — à confirmer | Le "No active push token" concernait le compte fantôme `1eadf1cc` (supprimé). Les deux comptes légitimes ont des tokens actifs frais d'aujourd'hui. **Résidu à diagnostiquer plus tard (ne pas traiter maintenant)** : 3 tokens actifs par compte (enregistrements successifs jamais désactivés) → risque de notifications en double ou d'envois vers tokens morts. Lien avec B11 Volet C : les tokens se rattachent à la session auth active, pas au profil affiché. | — | — | — |
| B15 — Handle modifiable après setup | **DONE (client)** — à vérifier device build 29 | L'utilisateur pouvait changer son handle en re-entrant dans `me/edit`. D2 : handle gelé après le setup initial. | `handleLocked = me.isProfileSetup && !!me.handle` : champ Username en **read-only** `@handle·suffixe` (suffixe fiable depuis B16), seul `displayName` éditable ; `handleSave` envoie **toujours** `me.handle` existant (jamais la valeur d'un champ) → `reconcileHandleOwnership` intact. Guard SQL optionnel laissé en STOP (rejeter `handle != existant` post-setup, autoriser l'idempotence). Client seul. | tsc + 1066/1066 | `5cdeaf8` |
| B16 — Suffixe d'identité null en production (Hermes) | **DONE prouvé (client)** — à vérifier device build 29 | `@noble/ed25519` v1.7.3 `getPublicKey` a besoin de SHA-512 ; son `utils.sha512` par défaut exige WebCrypto ou crypto Node — **absents sur Hermes** → throw systématique → `catch` silencieux (`if __DEV__`) → `identitySuffix` null. Tests verts par fausse assurance (Node a crypto, et ne touchait jamais `getPublicKey`). | SHA-512 pur-JS `@noble/hashes/sha512` câblé sur `ed.utils.sha512` (inconditionnel) ; `hermesSafeSha512` exporté + assert d'installation (W1) ; known-answer W2 (priv 0..31 → suffixe `kzdvvj`) ; `console.error` inconditionnel dans le catch (lisible Xcode/Console.app) ; IDENTITY.md corrigé (entropie vs hash, fonction par fonction). | tsc + 1062/1062, vecteur `kzdvvj` | `ac9cb7e` |
| B17 — Fantômes locaux "(shared)" (relations purgées côté serveur) | **DONE (client)** — à vérifier device build 30 | Diagnostic D-A : les relations shared-backed dont le `canonicalRelationId` n'est plus retourné par `my_shared_relationships()` (lignes purgées) survivent en AsyncStorage avec `name='(shared)'` — le bootstrap ne les visite jamais (n'itère que sur `rows`). D'où 14 "(shared)" PhoneA vs 3 reveals serveur. Collision de scan « already exists » = handle du fantôme ; add-via-scan "(shared)" = ouverture du fantôme, pas un bug d'écriture. | `reconcileOrphanedSharedRelations(serverCanonicalIds)` : **archive** (réversible, jamais delete) les relations `bootstrap`/`claim` avec `canonicalRelationId` absent du set serveur ; appelée **uniquement** sur réponse RPC résolue (le fetch throw sur erreur → `.catch`) **et** si `rows.length > 0` (option b — un `[]` transitoire ne wipe pas tout) ; jamais `manual`/`scan`/`invite_number`. Log du compte. Bonus scan-prefill parké. Tests A1-A6. | tsc + 1072/1072 | `e770e51` |
| B18 — Nom du counterpart absent de l'écran de reveal | **DONE (client)** — à vérifier device build 30 | Diagnostic D-B : la carte de reveal menait avec le tier (32pt), le nom n'apparaissait que dans le petit header. « Private link » = fallback claim sans nom (résorbé par la cascade B11 + nettoyage legacy `privateLabel===name`). Résidu = layout. | Pur layout `app/relation/[id].tsx` : `relationIdentity.primaryTitle` en 34pt en tête de la carte revealed, tier démoté en sous-titre 16pt. Cascade inchangée. | tsc + 1072/1072 | `cb499e8` |
| B19 — Atterrissage post-save incohérent + espace reveal/en-attente perdu | **DONE (client)** — à vérifier device build 30 | Diagnostic D-C : `/reveals` ne montrait que `reveal_ready` et son entrée garden disparaissait sans ready ; post-save claim atterrissait sur `/(tabs)` (ego-graph abstrait). | `/reveals` à deux sections **Ready** + **Waiting** (`cooking_reveal` + `waiting_other_side` avec lecture) ; post-save **claim** → `/reveals` (Stack normal, pas de modal → compatible B7), non-claim → fiche relation ; capsule garden visible dès `pendingRevealCount = ready + waiting > 0`. | tsc + 1072/1072 | `7ca17ff` |
| B20 — EgoGraph home compte/affiche les archivés | **DONE prouvé (client)** — build 31 | Le home `graphMembers` (`app/(tabs)/index.tsx:62`) filtrait `status==='revealed'` **sans** `!archived` → les 14 fantômes archivés (B17) restaient sur le canvas + gonflaient « N in your Bao » (`networkCount = graphMembers.length`). Même trou dans Through (gateway members) et Lexique. | Prédicats testés `lib/relation-visibility.ts` : `isRevealedNetworkMember` (revealed && !archived) + `isLexiconDiscoverable` (name opened && !archived), appliqués à `index.tsx`, `through/[id].tsx`, `lexicon.tsx`. Garden + `/reveals` déjà OK. Tests N1-N5 (dont comptage) + L1-L3. | tsc + 1080/1080 | `1f96296` |
| B21 — Entrée "(shared) / No reading yet / WAITING" persistante | **DONE (client, affichage)** — cause serveur à confirmer | Une relation bootstrap en `waiting_other_side`, sans lecture locale, dont le `counterpartDisplayName` reste vide → cascade retombe sur `name='(shared)'`. Hypothèse écartée par Samo (Q0 purge : seuls 2 profils, pas de `display_name=''`). **Contre-hypothèse (à confirmer par SQL)** : `side_b_user_id IS NULL` (invitation de mai jamais claimée) → LEFT JOIN sans counterpart → NULL légitime. Vise 34ed1c23 / 86aec1a5. Les deux "iPhoneBB" = 2 reveals distincts (51ed8b2b + 08ae6e54), pas un doublon. | **Affichage robuste aux deux hypothèses** : `getNormalizedPrivateLabel` ne surface plus jamais `'(shared)'` — fallback `counterpartHandle` sinon libellé explicite « Invitation pending » (anglicisé pour cohérence UI ; dire si FR souhaité). SQL de confirmation counterpart = STOP Samo. Tests B21-1..4. | tsc + 1087/1087 | `5e1705d` |

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

**Session B20–B21 : close côté client. BUILD 31 = dernière base OTA obligatoire.**

Issus du smoke test build 30. Corrigés client (tsc + 1087/1087, poussés) : B20 (archivés exclus du graph/compteur/gateways/lexique), B21 (plus jamais "(shared)" en affichage → handle sinon « Invitation pending »).

**EAS Update configuré (`d77f941`)** : `expo-updates` installé, `app.json` (`updates.url` + `runtimeVersion.policy=appVersion`), `eas.json` (`channel=production`). **Build 31 embarque le runtime OTA → dernier build obligatoire.** Ensuite, tout fix **JS/asset-only** → `eas update --branch production`, **zéro build**. Limite : un changement natif (module, plugin, SDK, ou l'ajout d'expo-updates lui-même) exige un build + bump runtimeVersion.

**Vérifications device build 31** (Update TestFlight, pas de réinstall) :
- B20 : home « in your Bao » ne compte/affiche plus les archivés ; Through + Lexique idem.
- B21 : l'entrée ex-"(shared) WAITING" affiche maintenant un handle ou « Invitation pending », jamais "(shared)".
- Re-vérifier B17/B18/B19 + B10-B16 non régressés.
- **OTA smoke** : après build 31 installé, pousser un `eas update` trivial et confirmer réception au relaunch.

**SQL en attente (STOP — Samo applique)** :
- B21 confirmation : identifier 34ed1c23 / 86aec1a5 — `side_b_user_id IS NULL` (invitation jamais claimée) ? ou counterpart display_name réel ? (requête dans le rapport de session).
- (optionnel) critère de purge élargi `display_name IS NULL OR btrim(display_name)=''`.

**Note V8 (build 29-30)** : push envoyées 17h54 — réception observée, **suppression probable en foreground**. **À confirmer device verrouillé / background**. Lien résidu 3-tokens B14 (doublons/tokens morts).

**Résidus ouverts** : B13-countdown (observation) ; B14 (dissous ? + 3-tokens) ; bonus scan-prefill (PARKING) ; libellé « Invitation pending » (FR/EN à trancher).

---
Sessions B1–B9 (build 28), B10–B16 (build 29), B17–B19 (build 30), B20–B21 (build 31 — 1ère base OTA). Toutes close côté client.
