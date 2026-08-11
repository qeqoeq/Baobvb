# DIAG-B39 — Santé vide après B38 (Rechercher) vs LECTURE PARTAGÉE peuplée (relation/[id])

> **Diagnostic en LECTURE SEULE.** Aucun fichier de code modifié, aucun SQL exécuté, aucun correctif proposé.
> Règle : chaque réponse porte `fichier:ligne`, sinon « NON PROUVÉ ». Contexte (OTA B38, commit c316aed,
> migration serveur 16 colonnes) tenu pour acquis.

---

## Réponse en une phrase

Les deux écrans **ne lisent pas le même objet**. Rechercher/Santé lit `revealSnapshot.mutualScore` (+`firstViewedAt`)
sur la relation **brute du store** ; `relation/[id]` lit le même champ sur une relation **fusionnée avec un fetch
serveur** (`get_my_reveal_state` → `sharedReveal`, propre à l'écran détail, **jamais réécrit dans le store**).
Le tier « ENRACINÉ » de `relation/[id]` provient donc du **fetch serveur de l'écran détail**, pas du champ store
peuplé par B38 — donc il **ne prouve pas** que B38 a rempli le store. Le store, lui, est vide pour ce champ (c'est
ce que Santé montre).

---

## 1. SÉLECTEUR SANTÉ

- **Rendu** : `app/(tabs)/garden.tsx:648-695`. L'empty-state observé (« La force des liens apparaîtra ici… »,
  `:682`) est la branche **`hasOverviewSharedLinks === true` ET `revealedScoredEntries.length === 0`** (`:656-657`
  → `:679-685`). *(L'autre empty-state, `:688` « Les liens partagés apparaîtront ici », serait la branche
  `!hasOverviewSharedLinks` — ce n'est PAS celle observée : il existe donc bien ≥1 relation `revealed` dans le store.)*
- **Champ exact lu** : `getRevealedLinkStrength` (`:76-87`) → **`relation.localState.revealSnapshot.mutualScore`**
  (`:86`), avec DEUX gardes préalables : `revealSnapshot.status === 'revealed'` (`:84`) **et**
  `revealSnapshot.firstViewedAt` truthy (`:85`). `normalizeMutualScore` renvoie `null` si le score n'est pas un
  nombre (`:30-32`). `revealedScoredEntries` = `revealedEntries` filtrées par `getRevealedLinkStrength !== null`
  (`:206-208`).
- **Condition exacte de l'empty-state observé** : il existe une relation `status==='revealed'` (`hasOverviewSharedLinks`,
  `:251` ← `revealedEntries`, `:198-201`) **mais** `getRevealedLinkStrength` renvoie `null` pour elle → donc, dans
  son snapshot **store**, **soit `firstViewedAt` est absent (`:85`), soit `mutualScore` est `null`/absent (`:86-87`)**.
  Lequel des deux → **NON PROUVÉ statiquement** (nécessite un dump du snapshot ; cf. Hypothèses).

## 2. SÉLECTEUR LIENS PARTAGÉS

**Même chemin que Santé, pas indépendant.**
- **Rendu** : `app/(tabs)/garden.tsx:698-728`. Les 4 buckets lisent `count = linkHealthSummary[label]` (`:706`).
- **Source** : `linkHealthSummary` (`:210-225`) est bâti **à partir de `revealedScoredEntries`** (`:218`), qui
  utilise **le même `getRevealedLinkStrength`** (donc le même champ `revealSnapshot.mutualScore` + gardes `:84-86`).
- **Condition de rendu vide** : quand `revealedScoredEntries` est vide, tous les `count = 0` → chaque bucket porte
  `styles.bucketDoorEmpty` (`:717`) et n'est pas cliquable (`:718`) = « grisés » (l'observation A).
- **Conclusion** : Santé et Liens partagés **partagent le sélecteur et le champ**. Ils tombent ensemble. Ce ne
  sont **pas** deux chemins indépendants.

## 3. SÉLECTEUR RÉVÉLATIONS

**Autre chemin — ne lit PAS `mutualScore`.**
- `app/reveals/index.tsx` lit `entry.relation.localState.revealSnapshot.status` : `reveal_ready` (`:57`) et
  `cooking_reveal` / `waiting_other_side` + `entry.hasFoundationalReading` (`:69-72`). Source = même store
  (`activeRelations` → `getFoundationalReadings`, `:48/reveals`), **mais champ = `status`**, jamais `mutualScore`.
- Conséquence : une relation **`revealed`** n'apparaît **dans aucune** des deux sections de Révélations
  (ni `reveal_ready`, ni cooking/waiting). Révélations et Santé ne lisent donc **pas** le même champ.

## 4. BOOTSTRAP — REJOUE-T-IL ?

- **Appel** : `app/_layout.tsx:225` `fetchMySharedRelationships().then(bootstrapSharedRelations)` →
  `lib/bootstrap-shared-relations.ts:14-17` (`supabase.rpc('my_shared_relationships')`).
- **Événement** : `useEffect` avec dépendance **`[me.internalAuthUserId]`** (`app/_layout.tsx:261`). Se déclenche
  quand l'`internalAuthUserId` devient disponible (résolution d'auth), au montage de `RootLayout`.
- **Garde** : `bootstrappedForUserIdRef` (`:220`, `:223` `if (bootstrappedForUserIdRef.current === userId) return;`,
  posé `:224`). ⇒ **une fois par `userId` par montage de `RootLayout`**. `RootLayout` se monte une fois par
  lancement → **rejoue à chaque cold start** (donc à chacun des 2 relances). Réinitialisé si `userId` devient null
  (`:220`) ou sur échec (`:259`).
- **Second point d'entrée (même upsert)** : `lib/resync-shared-relations.ts:53` (re-sync foreground B26,
  throttle 45s + in-flight) appelle aussi `fetchMySharedRelationships` → `upsertBootstrappedSharedRelations`.

## 5. COMMIT c316aed — CONDITIONS D'ÉCRITURE

- **a) Écriture de `mutualScore`** : `buildSharedRevealLocalState` (`store/useRelationsStore.ts:2742`) —
  `mutualScore: revealed && typeof data.mutual_score === 'number' ? data.mutual_score : undefined`. Gardé sur
  `revealed`. Utilisé dans les deux chemins de l'upsert (création `:2869`, et comme `serverSnap` pour le merge `:2834`).
- **b) Branche de backfill** : `mergeBootstrappedRevealSnapshot` (`store/useRelationsStore.ts:2768-2780`) — se
  déclenche quand **`local.status === 'revealed'` ET `local.mutualScore === undefined` ET
  `typeof server.mutualScore === 'number'`**. ⇒ **elle se déclenche si `revealSnapshot` EXISTE DÉJÀ mais avec un
  score null/undefined** (rang égal `revealed→revealed`), pas seulement si le snapshot est absent. C'est bien la
  distinction critique demandée : **le cas « déjà révélé, sans score » est couvert**. L'upsert applique le patch
  via `snapshotAdvanced = mergedSnap !== existing.localState.revealSnapshot` (`:2839`, `:2856-2860`).
- **c) Écrase ou préserve ?** : **préserve — non destructif.** Le backfill ne remplit `mutualScore` que si
  `local.mutualScore === undefined` (`:2769` région) ; un score local existant n'est **jamais** écrasé (branche
  d'avancement : `mutualScore: local.mutualScore ?? server.mutualScore`, `:2774`). Le chemin de création (`:2869`)
  ne concerne qu'une relation absente.
- **⚠️ Pré-condition non évidente** : le backfill (b/c) exige que la relation **existe déjà dans `state.relations`**
  au moment de l'upsert (`existing = state.relations.find(... canonicalRelationId)`, `:2817`). Si l'upsert tourne
  **avant** l'hydratation, `existing` est introuvable → chemin **création** (`:2869`, score écrit) → **puis
  l'hydratation peut écraser** (cf. Q6).

## 6. ORDRE D'EXÉCUTION — hydratation vs bootstrap

- **Hydratation ASYNC** : `loadPersistedState<PersistedState>().then((p) => applyHydratedState(p) …)`
  (`store/useRelationsStore.ts:1722-1727`). `applyHydratedState` **remplace en bloc** `state.relations =
  persisted.relations.map(...)` (`:1570`) puis pose `hydrated = true` (`:1719`).
- **`persist()` est gardé** : `if (!hydrated) return;` (`:1511`) → toute écriture d'avant-hydratation n'est pas
  persistée tant que l'hydratation n'a pas eu lieu.
- **Race DOCUMENTÉE dans le code** : `store/useRelationsStore.ts:1562-1563` — « Preserve any value already set from
  onAuthStateChange firing before this hydration completes (**race condition: auth can resolve before AsyncStorage**) ».
  Donc `me.internalAuthUserId` (qui déclenche le bootstrap, Q4) **peut être posé avant** la fin de l'hydratation.
- **Séquence exacte hydratation ↔ upsert bootstrap = NON PROUVÉ statiquement.** Elle dépend d'une course runtime
  entre une lecture AsyncStorage (`loadPersistedState`) et un RPC réseau (`fetchMySharedRelationships`). Deux issues :
  - hydratation **avant** l'upsert → `existing` = relation persistée (révélée, sans score) → backfill écrit le
    score (OK) ;
  - hydratation **après** l'upsert → `applyHydratedState` (`:1570`, remplacement en bloc) **écrase** la relation
    fraîchement écrite par l'état persisté périmé (sans score) → **score perdu**.
- Peut-elle écraser des données fraîches ? **OUI, structurellement possible** (`:1570` est un remplacement total,
  pas un merge), si l'hydratation arrive après l'upsert. **Test** : logs horodatés de `applyHydratedState` vs
  `upsertBootstrappedSharedRelations` au démarrage.

## 7. INSTRUMENTATION

**Aucun.** Aucun affichage de `Updates.updateId` / `Updates.runtimeVersion` / version de bundle dans `app/` ni
`components/` (grep `Updates.updateId|runtimeVersion|expo-updates` = 0 résultat applicatif ; la sonde B33 a été
retirée par `revert 8cd688b`).

## 8. ÉCRAN RELATION vs ÉCRAN RECHERCHER — LA CONTRADICTION

- **a) D'où vient le tier affiché ?** `revealedTier` (`app/relation/[id].tsx:400-402`) =
  `nameRevealed ? (frozenMutualTier ?? null) : (reading?.linkTier ?? null)`. `frozenMutualTier` (`:394`) =
  `relationForDisplay.localState.revealSnapshot.tier` ; `relationForDisplay = effectiveRelation ?? relation`
  (`:384`) ; `effectiveRelation = applyEffectiveRevealToRelation(relation, sharedReveal)` (`:204`) →
  `getEffectiveRevealSnapshot` (`lib/relationship-reveal-precedence.ts:31-49`) → **`tier = normalizePersistedRevealSnapshotTier(sharedReveal.tier, sharedReveal.mutual_score)`** (`:46`) = `getMutualTier(sharedReveal.mutual_score)`
  (cf. DIAG-B36-2). `sharedReveal` = fetch `get_my_reveal_state` (`app/relation/[id].tsx:123-135`,
  `setSharedReveal(record)` `:134`).
- **b) Le score passé à `getMutualTier` vient d'où ?** De **`sharedReveal.mutual_score` (serveur, `get_my_reveal_state`)**,
  via `effectiveRelation` — **PAS** d'un calcul local dérivé de la seule lecture de l'utilisateur (ce chemin,
  `reading.linkTier`, n'est emprunté que si `!nameRevealed`, `:402`). **Preuve par élimination** : le champ store
  brut (`revealSnapshot.mutualScore` et `.tier`) est **vide** pour @sounj (c'est ce que Santé démontre, Q1 ; et
  `buildSharedRevealLocalState` ne pose **jamais** `tier` — B38 ne mappe que `mutualScore` ; le calcul local du
  score n'a jamais tourné faute de la lecture de la contrepartie, cf. DIAG-B35). Donc `frozenMutualTier`/`frozenMutualScore`
  non-vides **ne peuvent venir que du overlay `sharedReveal`**. Le titre « LECTURE PARTAGÉE » exige d'ailleurs
  `kind==='score'` (donc un score présent, cf. d) → le tier vient bien du fetch serveur de l'écran détail.
- **c) Est-ce le MÊME champ que Santé (Q1) ?** **Même nom de champ, objet différent.**
  - Santé lit `relation.localState.revealSnapshot.mutualScore` sur la relation **brute du store** (`garden.tsx:86`).
  - `relation/[id]` lit `relationForDisplay.localState.revealSnapshot.mutualScore/.tier` où `relationForDisplay`
    = **relation du store + overlay `sharedReveal`** (`:384`, `:204`).
  - **Ce que `relation/[id]` a et que Santé n'a pas** : l'overlay `sharedReveal` (fetch `get_my_reveal_state`),
    propre à l'écran détail, qui porte `mutual_score` (=90) et `tier` du serveur — et qui **n'est jamais réécrit
    dans le store** (`refreshSharedReveal` fait `setSharedReveal`, état local du composant, `:134` ; aucune
    écriture store). Santé lit le store nu → champ vide.
- **d) Condition du titre « BAOBAB · LECTURE PARTAGÉE »** : `readingVariant === 'revealed'`
  (`app/relation/[id].tsx:866`) **ET** `sharedRevealDisplay.kind === 'score'` (`:867`) → le kicker `:872`. Or
  `getSharedRevealDisplayState` (`lib/relation-detail-helpers.ts:428-432`) : `kind='score'` **ssi**
  `nameRevealed === true` **ET** `visibleScore !== null`. Sinon `kind='pending'` → carte « On amène ta lecture
  partagée… » (`:950`). Donc voir le titre **prouve** qu'un score était présent au rendu (donc via `sharedReveal`).

## 9. LA LECTURE DE LA CONTREPARTIE EST-ELLE RENDUE ?

- **a) Composant pour la lecture de la contrepartie ?** **NON.** Le seul bloc de lecture rendu est
  « **Ta lecture** » (`app/relation/[id].tsx:912-937`), qui affiche `reading?.pillarDots` — la lecture de
  **l'utilisateur courant**. Aucun composant n'affiche les ratings/la lecture de la contrepartie. Contrainte
  architecturale explicite : « **The other side's ratings are never exposed to the client (privacy by design).** »
  (`lib/relation-detail-helpers.ts:448`). Le `:869` est un commentaire sur le **nom** du counterpart (B18), pas
  sa lecture.
- **b) « D'après ta lecture privée. »** — **conditionnel** : rendu uniquement dans le bloc « Une lecture plus
  profonde » gardé par `deeperSignal` (`app/relation/[id].tsx:938` `{deeperSignal ? (…)}`), texte `:944`. Quand
  affiché, il est **toujours** « D'après ta lecture privée. » — **aucune variante** pour une lecture partagée/de la
  contrepartie (le « deeper signal » est toujours dérivé de la lecture privée de l'utilisateur, `:446-449`).
- **c) Le chemin partagé (tier + titre) est-il gardé par le statut de reveal ?** **OUI.** Il exige
  `readingVariant === 'revealed'` (`:866`) et `kind === 'score'` → `nameRevealed` (statut `revealed` +
  `isRelationshipNameRevealed` + `firstViewedAt !== undefined`, `:387-390`). Il **ne s'affiche pas** dès qu'une
  lecture privée existe : sans reveal, `readingSectionLabel` vaut « Lecture privée » (`:434`) et le titre « LECTURE
  PARTAGÉE » n'apparaît pas.

---

## SCHÉMA DES CHEMINS DE DONNÉES

| Écran | Source | Store | Sélecteur | Champ affiché |
|---|---|---|---|---|
| **Rechercher / SANTÉ** | RPC `my_shared_relationships` (bootstrap/resync) | `state.relations` **brut** | `revealedScoredEntries` → `getRevealedLinkStrength` (`garden.tsx:76-87`, `206-225`) | `revealSnapshot.mutualScore` **+ `firstViewedAt` + `status==='revealed'`** |
| **Rechercher / LIENS PARTAGÉS** | idem | `state.relations` **brut** | `linkHealthSummary` ← `revealedScoredEntries` (`garden.tsx:210-225`, `698-728`) | **même champ** que Santé |
| **Révélations** | idem | `state.relations` **brut** | `readyEntries` / `waitingEntries` (`reveals/index.tsx:53-76`) | `revealSnapshot.status` (+ `hasFoundationalReading`) — **jamais** `mutualScore` |
| **relation/[id]** | store **+ fetch `get_my_reveal_state`** (`sharedReveal`, état composant) | `state.relations` **+ overlay `sharedReveal`** (non réécrit dans le store) | `effectiveRelation` → `getEffectiveRevealSnapshot` → `frozenMutualTier/Score` (`relation/[id]:204,384,393-394`; `relationship-reveal-precedence.ts:31-49`) | `revealSnapshot.mutualScore/.tier` **du overlay serveur** |

**Le nœud de la contradiction** : les 3 écrans « Rechercher/Révélations » lisent le **store nu** ; `relation/[id]`
lit le **store + un fetch serveur** que lui seul effectue et qu'il **ne persiste pas**. D'où : tier affiché sur la
fiche (via le fetch), champ vide partout ailleurs (store non peuplé).

---

## HYPOTHÈSES (classées par vraisemblance ; chacune avec son test)

### H1 — Le champ `revealSnapshot.mutualScore` (et/ou `firstViewedAt`) est absent du store pour @sounj (le plus probable)
Santé vide (Q1) prouve que `getRevealedLinkStrength` renvoie `null` → dans le **snapshot store** de @sounj, il
manque `mutualScore` **ou** `firstViewedAt`. `relation/[id]` masque le trou via son overlay serveur (Q8). Deux
sous-causes, à départager :

- **H1a — `mutualScore` jamais écrit dans le store** (B38 n'a pas pris effet pour cette relation).
  - **Test SQL (Samo)** : `SELECT status, mutual_score FROM my_shared_relationships();` connecté comme Samo (ou,
    hors session, sur la table : `SELECT relationship_id, status, mutual_score FROM shared_relationship_reveals
    WHERE relationship_id = '<canon @sounj>';`). Attendu si serveur OK : `revealed`, `90`. Si `90` → le serveur
    fournit bien le score → le trou est **client**.
  - **Test client (device)** : dumper `revealSnapshot` de @sounj depuis AsyncStorage / un log temporaire :
    `mutualScore` est-il `undefined` ? Si oui malgré le serveur à 90 → écriture non appliquée (voir H2).
- **H1b — `firstViewedAt` absent du store** (garden `:85` échoue même avec un score).
  `firstViewedAt` n'est **jamais** posé par le bootstrap (`buildSharedRevealLocalState` ne le mappe pas ; la RPC
  ne renvoie pas `first_viewed_at`) — il n'est écrit que par l'action locale d'ouverture du reveal
  (`store/useRelationsStore.ts:1918-1928`). Sur la fiche, `nameRevealed` peut être vrai via
  `sharedReveal.first_viewed_at` (`relationship-reveal-precedence.ts:37`) alors que le **store** n'a pas
  `firstViewedAt`.
  - **Test client** : dump du `revealSnapshot` de @sounj → `firstViewedAt` est-il défini ? S'il est `undefined`
    mais `mutualScore` défini → c'est **H1b** (Santé restera vide même après B38 tant que la fiche n'a pas stampé
    `firstViewedAt` dans le store).

### H2 — Course hydratation → bootstrap : l'upsert frais est écrasé par l'état persisté périmé (Q6)
`applyHydratedState` remplace `state.relations` en bloc (`:1570`) et peut résoudre **après** l'upsert bootstrap
(race documentée `:1562-1563`). Dans ce cas le score fraîchement écrit est écrasé par le snapshot persisté sans
score, et le bootstrap ne rejoue pas (garde `bootstrappedForUserIdRef`). Le resync foreground (Q4) **devrait**
rattraper (il tourne après hydratation) — sauf s'il est throttlé/non déclenché, ou si `firstViewedAt` manque (H1b).
- **Test** : logs horodatés de `applyHydratedState` (`:1541`) et `upsertBootstrappedSharedRelations` (`:2806`) sur
  un cold start → lequel s'exécute en dernier ? Si l'hydratation est postérieure à l'upsert → écrasement confirmé.
- **Test complémentaire** : forcer un pull-to-refresh (déclenche `resyncSharedRelations`, `resync-shared-relations.ts:53`)
  puis re-regarder Santé. Si Santé se peuple après refresh → la cause était l'ordre au démarrage (H2), pas H1a.

### H3 — Le tier de `relation/[id]` viendrait de la lecture privée (REFUTÉE par le code, listée pour clore le débat)
Le titre « LECTURE PARTAGÉE » + le tier passent par `kind==='score'` → `nameRevealed` → `frozenMutualTier`
(overlay serveur), **pas** `reading.linkTier` (chemin `!nameRevealed`, `relation/[id]:402`). Donc le tier **ne
vient pas** de la seule lecture privée ; il vient du **fetch serveur `get_my_reveal_state`** de l'écran détail.
- **Conséquence importante** : l'affichage « ENRACINÉ » sur la fiche **ne valide pas** B38 (il emprunte un chemin
  indépendant du champ store). Ne pas s'en servir comme preuve que le bootstrap a rempli le store.
- **Test de réfutation définitive** : couper le réseau, tuer/relancer l'app, ouvrir `relation/[id]` de @sounj.
  Si le fetch `get_my_reveal_state` échoue et que le tier **disparaît** (carte « On amène ta lecture partagée… »)
  → confirme que le tier venait du serveur, pas du store ni de la lecture privée.

### H4 — B38 non exécuté sur le device (peu probable, mais non auto-vérifiable)
Le contexte affirme l'OTA appliqué ; et la fiche montre un tier (chemin indépendant). Mais **aucun affichage de
`updateId`** n'existe (Q7) → impossible de confirmer à l'écran quel bundle tourne.
- **Test** : (diagnostic, non appliqué) réintroduire un affichage temporaire de `Updates.updateId`, ou lire les
  logs Metro sur un build dev. Sans cela : NON VÉRIFIABLE on-device.

---

## Ce qui est PROUVÉ vs NON PROUVÉ

- **Prouvé** : Santé/Liens partagés/Révélations lisent le **store nu** ; `relation/[id]` lit le **store + overlay
  serveur non persisté** ; le tier de la fiche vient du fetch serveur (pas de la lecture privée, pas du champ
  store) ; le backfill B38 couvre le cas « déjà révélé sans score » **si** la relation existe au moment de l'upsert ;
  l'hydratation est un **remplacement en bloc** susceptible d'écraser l'upsert selon l'ordre.
- **NON PROUVÉ (runtime, tests fournis)** : si le trou est `mutualScore` (H1a) ou `firstViewedAt` (H1b) ; l'ordre
  hydratation↔upsert au démarrage (H2) ; quel bundle tourne réellement (H4). Ces quatre points se tranchent par le
  dump du snapshot store de @sounj + la requête SQL `mutual_score` + les logs horodatés.

_Diagnostic seul. Aucun code modifié, aucun SQL exécuté, aucun correctif. Le GO viendra après audit._
