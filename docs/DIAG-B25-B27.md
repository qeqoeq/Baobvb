# Rapport de diagnostic — B25 / B26 / B27

> Post première session testeuse externe réelle (Sou, @sounj, 20/07). Serveur 100 % vert
> (relation `c41ab40b-6d3a-4003-8c81-15633391eb6e`, `revealed`, `mutual_score=90`, tier `Legend`,
> deux reading IDs présents, créée 13:21 UTC). Les trois défauts sont **client**.
> Diagnostic seul — aucune ligne de production modifiée. Preuves `fichier:ligne`.
>
> Ordre de fix prévu après validation : **B26 (racine) → B25 (dépend de B26) → B27**.

---

## STATUT — RÉSOLU (2026-07-21)

GO auditeur reçu, arbitrages tranchés, les trois exécutés dans l'ordre.

| Bug | Statut | Commit | Preuve |
|---|---|---|---|
| **B26** | ✅ Corrigé (OTA) | `b71a5e2` | `resyncSharedRelations()` (throttle 45s + in-flight, **sans** réconciliation — arbitrage A), AppState 'active' + RefreshControl (garden, reveals) + useFocusEffect (fiche). tsc 0, vitest +8. |
| **B25** | ✅ Corrigé (OTA) | `85b6696` | Résolution `id \|\| canonicalRelationId` (fiche + `getRelationSnapshotById`) + machine 3 états (resolving→found/unavailable, grâce 8s, force-resync B26). tsc 0, vitest +13. |
| **B27-app** | ✅ Corrigé (OTA) | `acbea07` + `bb20f64` | Traduction FR directe du parcours critique (arbitrage C, sans lib i18n). Enum `Tier` intact → `lib/tier-display.ts`. Mots de marque validés + remplis (`bb20f64`, micro-OTA). tsc 0, vitest 1127/1127. |
| **B27-notifs** | 🟠 Code prêt, **déploiement STOP** | `a191151` | Fallbacks FR `notification-dispatch-runner:37-38`. Sous-tâche serveur (arbitrage B) — **pas OTA**, deploy en attente validation Samo (cf. `verify_jwt`). |

**OTA publiés** (branch `production`, runtime `1.0.0`, iOS) :
- Fixes B25/B26/B27-app — group `ca43dd0b-2fd0-429b-9e67-61111ef50179`, iOS update `019f81ad-773d-7841-87e4-20ea2fd2df19`, commit `acbea07`.
- Complétion mots de tiers FR — group `ca5238ca-3969-4b21-97ea-5b27b5c4e7e5`, iOS update `019f81b4-d374-7822-87ea-ede00ab56663`, commit `bb20f64`.

Reste en attente Samo : validation de la commande `supabase functions deploy` pour B27-notifs (cf. `verify_jwt`). Mots de tiers : **faits**.

---

## B25 🔴 — Tap notif « Your link is ready » → « Relationship unavailable »

### Trace complète du deep link

| Étape | Fichier:ligne | Ce qui circule |
|---|---|---|
| 1. Enqueue serveur | `supabase/migrations/20260529174636_enforce_reveal_ready_score_contract.sql:243` et `:267` | `jsonb_build_object('type','reveal_ready','relationId', p_relationship_id)` → **`relationId` = UUID canonique de la relation** (`c41ab40b…`) |
| 2. Extraction client | `lib/push-notifications.ts:55-61` | `extractRelationIdFromNotificationData` lit `data.relationId` → renvoie l'UUID canonique tel quel |
| 3. Navigation (tap à chaud) | `app/_layout.tsx:313-315` | `router.push({ pathname:'/relation/[id]', params:{ id: relationId }})` |
| 3bis. Navigation (cold-start) | `app/_layout.tsx:334-337` | idem via `getLaunchRelationIdFromLastNotification()` |
| 4. Résolution écran | `app/relation/[id].tsx:96-99` | `relations.find((r) => r.id === id)` |
| 5. Échec | `app/relation/[id].tsx:296-308` | `if (!relation)` → écran sec « Relationship unavailable / This relationship could not be opened » |

### Diagnostic — deux fautes cumulées, pas une

**Faute 1 (structurelle, la vraie racine) : mismatch d'espace d'identifiants.**
Le deep link passe l'**UUID canonique** comme `id`, mais l'écran résout par l'**id local**. Or l'id local
n'est **jamais** l'UUID canonique, des deux côtés :

- Relation bootstrappée : `store/useRelationsStore.ts:2848` → `id: r-${Date.now()}-${rand}` ; l'UUID serveur
  va dans `canonicalRelationId` (`:2860`).
- Relation *claim* (cas Sou) : `store/useRelationsStore.ts:2468` → `id: r-${Date.now()}` ; UUID serveur dans
  `canonicalRelationId` (`:2486`).

Conséquence : `relations.find(r => r.id === canonicalUUID)` **ne matche jamais**, même quand la relation est
parfaitement présente dans le store. L'hypothèse « bootstrap pas repassé » est donc **incomplète** — ce chemin
de notif serait cassé même avec un store totalement à jour. Il n'existe aucun résolveur canonical→local
aujourd'hui (`getRelationSnapshotById` `store/useRelationsStore.ts:1156` matche lui aussi sur `r.id === id`).

**Faute 2 (celle qu'annonçait l'auditeur) : conclusion sans fetch.**
Même en corrigeant la faute 1, si la relation n'est pas encore dans le store (bootstrap pas repassé depuis le
reveal — voir B26), l'écran affiche directement l'erreur sèche au lieu de tenter un chargement. C'est
exactement « un écran d'erreur au moment où l'utilisateur répond à l'appel ».

### Plan de fix (OTA, dépend de B26)

1. **Résolution élargie** dans `app/relation/[id].tsx:96-99` : matcher `r.id === id || r.canonicalRelationId === id`.
   Corrige la faute 1 seule → suffit dès que la relation est en store.
2. **Fetch-avant-conclure** : remplacer le retour sec `:296` par une machine à 3 états :
   - `resolving` (indicateur « Ouverture… ») tant qu'un lookup local échoue **et** qu'un re-sync ciblé n'a pas
     encore répondu ;
   - déclencher le primitive de re-sync de B26 (`fetchMySharedRelationships → bootstrapSharedRelations`),
     idéalement un fetch mono-relation par UUID ;
   - n'afficher « unavailable » **qu'après** résolution du fetch et absence confirmée.
3. Le point 1 est OTA-able et indépendant ; le point 2 réutilise le primitive B26 → **fixer B26 d'abord**.

---

## B26 🔴 — État local figé jusqu'au relaunch complet (la racine)

### Preuves : un seul point d'entrée, gardé une fois par session

- **Unique bootstrap** : `app/_layout.tsx:223` `fetchMySharedRelationships().then(bootstrapSharedRelations)`,
  gardé par `bootstrappedForUserIdRef.current === userId` (`:221`, ref déclaré `:33`). `RootLayout` se monte
  **une fois** ; la ref ne se réinitialise qu'à un kill+relaunch complet. Un utilisateur qui ne tue jamais
  l'app **ne re-bootstrappe jamais**.
- **Aucun re-sync AppState** : le seul usage d'`AppState` du projet est le gating haptique du countdown dans
  `app/relation/[id].tsx:233-234` — pas de rafraîchissement de données.
- **Aucun pull-to-refresh** : `RefreshControl`/`onRefresh` absents de tout `app/`.
- **Fiche relation** : `app/relation/[id].tsx:145` ne rafraîchit que **le record de reveal unique** au montage
  (`refreshSharedReveal`), pas la liste, pas au retour au premier plan.

→ Samo et Sou ont vu « WAITING » pendant que le serveur était `revealed/Legend` : exactement ce comportement.

### La sécurité de précédence est déjà en place (dé-risque le fix)

Un re-bootstrap répété est **idempotent et non destructeur par construction** :

- `mergeBootstrappedRevealSnapshot` `store/useRelationsStore.ts:2748-2762` : n'adopte le serveur **que s'il est
  strictement plus avancé** (`REVEAL_STATUS_RANK`), donc **jamais de downgrade** d'un `revealed` local
  (B10 Fix A), et **préserve** `firstViewedAt`, `mutualScore`, `tier`, `finalizedVersion`.
- Upsert dédupliqué par `canonicalRelationId` uniquement (`store/useRelationsStore.ts:2784`), jamais par
  nom/heuristique.
- Le pass reste éligible car le statut re-synchronise `waiting → revealed` (B22,
  `store/useRelationsStore.ts:2797-2806`).

Re-jouer bootstrap au premier plan **respecte B10/B22 sans travail supplémentaire**.

### Plan de fix (OTA — stratégie Phase 0 pragmatique)

1. **Re-sync au retour au premier plan** — listener `AppState 'active'` dans `app/_layout.tsx`, appelant un
   nouveau `resyncSharedRelations()` qui **ne passe pas** par `bootstrappedForUserIdRef` (sinon bloqué).
   Gardes anti-spam :
   - throttle par timestamp `lastSyncedAt` (min 30–60 s entre syncs) ;
   - flag « in-flight » pour éviter les appels concurrents.
   Coût réseau : 2 RPC (`my_shared_relationships` + `fetchPassDeliveries`) par réveil throttlé — négligeable.
2. **Pull-to-refresh** (`RefreshControl`) sur `app/(tabs)/garden.tsx` et `app/reveals/index.tsx`, appelant le
   même `resyncSharedRelations()`.
3. **Re-fetch au focus de la fiche** : `useFocusEffect` dans `app/relation/[id].tsx` déclenchant le resync liste
   (aujourd'hui seul le record unique est rafraîchi au montage).
4. **⚠️ Réserve honnête** : `reconcileOrphanedSharedRelations` (`app/_layout.tsx:230`) **archive** les relations
   absentes du retour serveur. Il ne doit être appelé **que** sur un retour RÉSOLU et `rows.length > 0`
   (déjà le cas `:229`). `resyncSharedRelations()` doit **conserver ce garde** — sinon un resync sur réseau
   instable pourrait archiver à tort. À trancher avec l'auditeur avant de câbler la réconciliation dans le
   chemin foreground (proposition : re-sync foreground **sans** réconciliation d'orphelins ; garder la
   réconciliation au seul cold-start).

**OTA-able** : oui, 100 % JS.

---

## B27 🟠 — i18n français jamais construit (public 100 % FR)

### Inventaire

- **Aucune lib i18n** : `package.json` ne contient ni `i18n`, `i18next`, `expo-localization`, `lingui`, ni
  `react-intl`. Tout est **hardcodé en anglais**.
- **Surface UI** : 25 écrans avec `<Text>`/`Alert` en dur ; 17 `Alert.alert`. Densité sur le parcours critique :
  - `app/relation/[id].tsx` ~31 littéraux + 5 Alerts ; `app/(tabs)/garden.tsx` ~27 ;
    `lib/relation-detail-helpers.ts` **~84** (labels d'état, CTA, notes) ; `lib/foundational-reading.ts` ~29 ;
    `lib/relationship-reveal.ts` ~21 ; `lib/relationship-lexicon.ts` ~18 (définitions de tiers).
  - Volume brut app+lib : **~1340 littéraux** (inclut faux positifs, mais donne l'ordre de grandeur d'une
    passe complète).
- **Texte des notifications push** — nuance critique :
  - Le payload `reveal_ready` **ne porte pas** de `pushTitle`/`pushBody`
    (`supabase/migrations/20260529174636_enforce_reveal_ready_score_contract.sql:243,267`).
  - L'Edge Function tombe donc sur ses **fallbacks anglais en dur** :
    `supabase/functions/notification-dispatch-runner/index.ts:37-38` → `'Your link is ready'` /
    `'Open Baobab to reveal it'`.
  - **Ce texte n'est PAS dans le bundle app → PAS atteignable par `eas update` (OTA).** Le franciser = soit
    redéployer l'Edge Function (`supabase functions deploy`), soit enqueue de `pushTitle`/`pushBody` FR dans le
    SQL (**STOP → Samo**). **B27-notifs casse l'hypothèse « tout en OTA »** : à isoler comme sous-tâche serveur.

### Approche minimale viable Phase 0 (recommandée)

Le public est **100 % FR, sans toggle de langue nécessaire**. Le plus rapide n'est pas d'introduire une lib
i18n mais :

1. **Traduction FR en place du parcours critique uniquement** (app-side, OTA) : onboarding/`me/edit`, claim
   `invite/[relationId]` + `invite/identity/[relationId]`, lecture `relation/evaluate/[id]`, reveal/fiche
   `relation/[id]` + les copies de `lib/relation-detail-helpers.ts` / `foundational-reading.ts` /
   `relationship-lexicon.ts`, liste `reveals/index.tsx`, CTA home. ~8–12 fichiers, ~120–180 chaînes utiles.
   **Effort : moyen (≈ 1 session focalisée).**
2. **Notifs push** (server-side, hors OTA) : franciser les 2 fallbacks
   `supabase/functions/notification-dispatch-runner/index.ts:37-38` **ou** enqueue FR — sous-tâche séparée, à
   cadrer (redeploy Edge Function vs SQL STOP).
3. **Reste (passe complète)** : les ~15 écrans secondaires + narratifs générés → **parking**, post-retours
   testeurs.

**Recommandation** : traduction directe en dur (pas de couche d'abstraction i18n en Phase 0 — une lib serait du
sur-coût pour un mono-langue). Un mince `lib/strings.fr.ts` reste possible mais optionnel.

---

## Synthèse & ordre proposé

| Bug | Racine | OTA ? | Dépendance |
|---|---|---|---|
| **B26** | Aucun re-sync hors relaunch ; primitive de refresh à créer | ✅ 100 % JS | — (à faire en 1er, fournit le primitive) |
| **B25** | Mismatch id canonique↔local **+** conclusion sans fetch | ✅ JS (résolution) | Réutilise le primitive B26 pour le fetch-avant-conclure |
| **B27** | Zéro i18n, public FR | ✅ app-side / ⚠️ **notifs = server, hors OTA** | — |

### Points nécessitant arbitrage avant GO

- **B26 §4** : re-sync foreground **avec ou sans** `reconcileOrphanedSharedRelations` (risque d'archivage à tort
  sur réseau instable). Proposition : sans ; réconciliation au seul cold-start.
- **B27 §2** : les notifs push ne sont pas OTA — accepter une sous-tâche serveur (Edge Function redeploy ou SQL
  STOP) ou parker le FR des notifs.

### Observations à NE PAS « fixer »

- **Latence notification 1–4 min** : c'est le cron minute. Normal, ne pas toucher.
- **Claim sans vérification d'identité** : constat Sou 20/07 → parké (`docs/PARKING.md`), décision produit
  post-retours testeurs, hors périmètre de ces trois bugs.

---

_Diagnostic seul. Aucune modification de code de production. STOP — attente du GO de l'auditeur avant tout fix._
