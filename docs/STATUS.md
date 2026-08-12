# STATUS.md — point de situation

> Canal de lecture de l'auditeur. Le repo reste la source de vérité.

---

## B38→B41 — CLOS (12/08) — cérémonie de reveal restaurée pour le second participant

> **Fil unique.** B38 expose `mutual_score` au bootstrap → B39 instrumente pour vérifier on-device → B39-bis/B40
> diagnostiquent pourquoi Santé reste vide et pourquoi Révélations n'affiche pas un reveal → **cause racine
> serveur trouvée** → **B41 corrige côté client** (commit `124ec04`, **tsc 0, vitest 1131/1131**). DIAG :
> `docs/DIAG-B38.md`, `docs/DIAG-B39-sante-vide-apres-B38.md`, `docs/DIAG-B40-reveals-revealed-absents.md`,
> `docs/DIAG-B41-plan-reveal-ready-local.md`.

### B38 — validé terrain (12/08)
- `mutual_score` **arrive bien au bootstrap** — prouvé par le **tampon B39** lu on-device (updateId `019ff337`).
  La colonne `mutual_score` de `my_shared_relationships()` peuple le `revealSnapshot` du store comme prévu (commit
  client `c316aed`). Le vide de Santé n'était **pas** un défaut de B38 → l'enquête bascule sur la cérémonie.

### Cause racine (serveur) — `open_shared_reveal` marque `first_viewed_at` GLOBALEMENT, pas par côté
- Le RPC `open_shared_reveal` estampille `first_viewed_at` dans **le même `UPDATE`** que `revealed_at` — donc
  **une seule fois, pour le premier qui ouvre**, jamais par participant. Preuve : lecture du `prosrc` de la
  fonction **+ 4 lignes** de `shared_relationship_reveals` où `first_viewed_at` et `revealed_at` sont **identiques
  à la microseconde**.
- Conséquence : le **SECOND participant ne recevait jamais sa cérémonie** — sa fiche s'ouvrait déjà « révélée ».
  **Aucun reveal du produit n'avait été ouvert par les deux côtés.**

### B41 — correctif client (commit `124ec04`)
- Un `revealed` **serveur** sans `firstViewedAt` **LOCAL** est **tenu à `reveal_ready`** jusqu'à la cérémonie de
  ce côté — overlay (`getEffectiveRevealSnapshot`) **+** bootstrap (`mergeBootstrappedRevealSnapshot` downgrade
  ciblé + chemin de création `upsertBootstrappedSharedRelations`). La cérémonie jouée, `firstViewedAt` local est
  estampillé, persiste et se réhydrate → la garde ne s'applique plus, score/tier reviennent (backfill B38).
  **Anti-boucle vérifié** (persistance + réhydratation).
- **Corrige aussi une fuite préexistante** : la fiche affichait **tier + score sans cérémonie** à un participant
  qui n'avait jamais ouvert — un score/tier avant reveal est un **défaut critique** (doctrine Baobab).
- **100 % client** : aucune migration SQL, aucun changement de `open_shared_reveal`, aucun trigger, aucun nouvel
  appel serveur. Tests adaptés (**aucun masqué** ; détail dans le corps du commit).

### Vérifié terrain (12/08, sur @iphonebb)
- **Révélations affiche 3** → **cérémonie Sou jouée** → **Santé affiche enfin des données** → badge **3 → 2**.
  Boucle de reveal restaurée bout-en-bout pour le second participant.

### Instrumentation permanente (écran « Toi »)
- Tampon **`updateId` + `runtimeVersion`** (`Updates.updateId` / `Updates.runtimeVersion`) affiché en clair sur
  l'écran Toi → **tout OTA est désormais vérifiable on-device** (quel bundle tourne réellement). **Permanent.**
- ⚠️ Les logs **`[B39]`** (ring buffer module + panneau appui-long) restent **temporaires** → parkés pour retrait
  quand le chantier sera froid (`docs/PARKING.md`).

---

## B38 — CLOS (validé terrain 12/08 — cf. bloc B38→B41 ci-dessus) — `mutual_score` au bootstrap

> **Migration serveur appliquée** par Samo (`my_shared_relationships` renvoie 16 colonnes, `mutual_score numeric`
> en fin, 3 grants intacts, vérif anti-fuite = 0). **Code client appliqué** (commit `c316aed`) — **tsc 0,
> vitest 1129/1129**. **OTA publié et validé terrain le 12/08** (updateId on-device `019ff337` ; cf. bloc
> B38→B41 ci-dessus). Détail : `docs/DIAG-B38.md`.
>
> **Code client (`c316aed`)** : `SharedRelationBootstrapInput` +`mutual_score` ; `buildSharedRevealLocalState`
> mappe `mutualScore` (gardé `revealed`) ; **backfill non-destructif** dans `mergeBootstrappedRevealSnapshot`
> (une relation déjà révélée sans score adopte le score serveur à rang égal — cas de Sou et de tous les reveals
> pré-B38 ; n'écrase jamais un score local). `tier` non porté (re-dérivé du score au rendu, B36-2). Champ requis
> ⇒ `mutual_score: null` ajouté aux 2 constructeurs de claim (invite/claim-handoff, non révélé). Tests Y7/Y8
> couvrent le backfill (adopte si absent ; jamais d'écrasement). **Corrige buckets Santé/Liens partagés vides
> des DEUX côtés.**

> **Correction 11/08 : `tier` RETIRÉ** de l'exposition serveur — label legacy (B36-2), mort à l'arrivée (le client
> re-dérive le tier du score) ; on n'expose que `mutual_score`.

- **Problème** : `my_shared_relationships()` ne renvoie pas `mutual_score` → le score n'entre jamais dans le
  `revealSnapshot` du store → buckets **Santé/Liens partagés vides** — **des DEUX côtés** (correction de portée
  apportée à `docs/DIAG-B35.md` : ce n'était pas seulement côté invité ; ni A ni B ne peut calculer le score localement).
- **Migration** (à coller après audit Samo) : `DROP FUNCTION` + recréation avec **1 colonne** `mutual_score`
  **en fin** de `RETURNS TABLE` (16 colonnes ; **pas de `tier`**), **gardée `CASE WHEN status='revealed' … ELSE NULL`**
  (doctrine : aucun score avant le reveal ; la colonne est peuplée dès `reveal_ready`, donc le `CASE` est critique).
  `SECURITY DEFINER` + `search_path` préservés ; grants recréés pour **les 3 grantees réels** (`authenticated` +
  `postgres` + `service_role` EXECUTE — le relevé réel en compte 3, pas 1 ; **service_role = Edge Functions**, le
  DROP les casserait sinon ; **jamais anon/PUBLIC**) ; le tout en `BEGIN;…COMMIT;`.
- **Diff client** (proposé, non appliqué) : `SharedRelationBootstrapInput` (+`mutual_score`) +
  `buildSharedRevealLocalState` (mapper `mutualScore`, gardé `revealed` ; **tier non mappé**, re-dérivé du score au
  rendu cf. B36-2) + **⚠️ `mergeBootstrappedRevealSnapshot` backfill** (sinon les relations **déjà** révélées — le
  cas terrain — ne reçoivent jamais le score, car le merge ne fait rien à rang égal).
- **Ajout non cassant** : appelants (`bootstrap-shared-relations.ts:14-17` → `_layout:225`, `resync:53`) lisent
  par nom → colonnes en fin sans risque.
- **STOP** : attente audit + GO Samo avant application SQL et avant tout code client.

---

## B36-2 — CLOS (11/08, option A) — « Enraciné » à 90, pas « Légende »

> **Aucun code — comportement actuel assumé.** Diagnostic : `docs/DIAG-B36-2.md`.

- La carte affichait « ENRACINÉ » alors que la base porte `tier='Legend'`, `mutual_score=90`.
- **Cause** : le client **re-dérive toujours le tier du score** — `normalizePersistedRevealSnapshotTier`
  (`persisted-tier-normalization.ts:69`) → `getMutualTier(90)='Rooted'` (`evaluation.ts:137`) → FR « Enraciné »
  (`tier-display.ts:20`). Le label serveur legacy `'Legend'` est **écarté par `normalize()` comme prévu** (rawTier
  jamais lu quand un score existe). Pas un bug de traduction, ni de `sharedReveal` null, ni de gel.
- **Option A retenue** : le tier affiché **reste dérivé du score côté client** ; à 90 → **« Enraciné »**. Le
  **score est correct des deux côtés**, seul le **nom** diverge. Aucun code.
- **Parké** (`docs/PARKING.md`) : migration de la **taxonomie serveur** (Legend/Vibrant/Thrill/Spark/Ghost, pré-V1)
  vers l'échelle client — à traiter **avant toute exposition publique des tiers**.

---

## B36-1 — FAIT (10/08) — le tap d'un nœud du Jardin ouvre la fiche

> Commit code `d574160` (+ docs). **tsc 0 · vitest 1127/1127.** JS-only → **OTA-able, non publié** (en attente ;
> commande prête : `eas update --channel production --platform ios`). Diagnostic : `docs/DIAG-B36-1.md`.

- **Avant** : `handleNodeTap` routait par `gatewayAccessState` → une relation révélée « passerelle » (ex. iPhoneBB)
  ouvrait `through/[id]` (« Aucune connexion via… »), jamais la fiche.
- **Après** : tap sur **n'importe quel** nœud → `relation/[id]` (branches `open→through` et `locked→Alert`
  supprimées ; `through/[id]` garde ses accès existants ; long-press = tooltip inchangé ; import `Alert` retiré).
- **Helpers conservés** : `deriveGatewayAccessState`/`deriveGatewayPowerBand` **restent utilisés** (visuels de
  nœud + tooltip) → pas de code mort, rien à supprimer.
- **Question tranchée — côté B, la carte s'affiche ? OUI** : la carte lit le score/tier depuis `sharedReveal`
  (`get_my_reveal_state`) via `getEffectiveRevealSnapshot` (`relationship-reveal-precedence.ts:39,46`) →
  `effectiveRelation` (`relation/[id]:204,384,393-394`), **pas** depuis le store. Donc ouvrir la fiche suffit
  côté B (bref chargement puis score/tier). ⚠️ Les 3 écrans de synthèse (DIAG-B35) restent vides côté B (ils
  lisent le store) — **chantier distinct, non traité ici**.

---

## B34 — CLOS (05/08) — funnel d'activation (diagnostic + résultats terrain)

> **Diagnostic seul, aucun code, aucun OTA, aucun SQL exécuté par l'assistant.** Détail : `docs/DIAG-B34.md`.
> Question : sens de `waiting_other_side` + `side_b_user_id IS NULL` dans `shared_relationship_reveals`.

- **Réponse** : inviteur = `sideA`, invité = `sideB` (convention client). Donc `side_b_user_id` = compte de
  l'invité, renseigné **uniquement au claim** (ou submit sideB), jamais réassignable → `side_b NULL` = **l'invité
  n'a jamais réclamé**. Aucune trace serveur avant le claim (seuls `created_at`→`claimed_at` ; pas d'analytics) →
  **segment pré-claim aveugle**.
- **Résultats terrain (05/08, requêtes lecture seule par Samo)** :
  - convention `inviter_side='sideA'` **confirmée 19/19** ;
  - **expiration non causale** (les 5 invites réclamées l'ont été le jour même de leur création) ;
  - **9 relations bloquées** en `waiting_other_side`, toutes `lecture_a=true` / `lecture_b=false`, **0 anomalie**
    de transition ; `1a375332` = claim réussi mais évaluation invité jamais soumise.
- **Verdict acté (corrigé) : mur côté invité** — **8 pré-claim** (avant compte, invisibles serveur) **+ 1
  post-claim** (`1a375332`). **0 blocage inviteur, 0 anomalie serveur.** Le levier est l'**activation de l'invité**
  (surtout pré-claim), pas un défaut technique.
- **Correction du verdict f06f0a8** : `1a375332` n'est **pas** un « abandon devant l'écran d'évaluation ».
  L'invité est **Laure @lolo**, aussi inviteuse de `66fb0fbe` (même jour 24/07, `lecture_a=true`) → elle **a**
  rempli une évaluation ce jour-là. **Cause non tranchée** (non-saillance de la relation entrante ? filtrage par
  `my_shared_relationships()` ? choix utilisateur ?) — **terrain requis**.
- **Dénominateur organique** : `86aec1a5` et `34ed1c23` (mai) = appareils de test **PhoneA/iPhoneBB** → exclus.
  Réel = **8 relations organiques, 1 reveal complet**.
- **Composition du panel (05/08)** : les **8 relations bloquées sont toutes intra-familiales** (Isaiah → mère
  Laure / père / sœur ; Wouolha → 2 enfants) ; le seul reveal abouti (**Khadra ↔ Imane**) est **non familial**.
  **Hypothèse prioritaire, non tranchée : biais de recrutement** — les liens à certitude élevée n'offrent aucune
  incertitude à lever, donc **aucune récompense** au bout de l'évaluation. **Critère du prochain lot retenu :
  adultes, relations à incertitude réelle, hors famille.**

---

## B33 — CLOS (05/08) — barre fantôme = artefact de rendu natif

> **Verdict (preuve sonde, capture device update `019fd2c3`)** : DEUX textes rouges **identiques** à l'écran,
> tous deux **`#1/1 @/ u:019fd2c3 y883 h73`** (même instanceId, même y mesuré) → **une seule instance React
> montée**, dont le rendu peint est **dupliqué par la couche native**. Ce n'est **PAS** un double-montage ni un
> bug JSX : c'est un **artefact de composition natif** (copie visuelle figée d'un écran, piste react-native-
> screens). **Non corrigeable en OTA** — d'où l'échec de B30/B32 à le changer.
>
> Cosmétique, n'empêche aucun parcours. Parké (`docs/PARKING.md`) : à revérifier sur le build natif ; si
> persistant, investiguer react-native-screens / `enableScreens`.

- **Sonde retirée** : `revert(B33)` `8cd688b` → `PrimaryNavBar.tsx` **identique à `cfb6355`** (état B32), aucun
  résidu. tsc 0, vitest 1127/1127. Diagnostic complet : `docs/DIAG-B33.md`.
- **OTA de revert publié (05/08)** : la sonde n'est plus servie — les installs build-31 se nettoient au prochain
  cold start. branch `production`, runtime `1.0.0`, iOS, commit `d9f2fae` (code = état `8cd688b`, sans sonde).
  **Update group** `c6ea739c-1b1f-49a8-8cf0-4c3c2b7b4729` · **iOS update** `019fd34a-71ed-741e-bef2-560e85b8e40c`.

### Build natif 32 — LANCÉ (05/08)
- Commande : `eas build --platform ios --profile production --auto-submit` (auto-submit TestFlight programmé,
  clé ASC déjà configurée). **Aucun bump** : version `1.0.0`, runtime `1.0.0`, `app.json` inchangé ; build number
  **auto-incrémenté → 32** (`appVersionSource: remote`).
- **Build ID** `72266b36-dee0-442e-b3eb-f11552f3d590` · date 05/08 20:58 · App Version 1.0.0 / build 32.
  Suivi : https://expo.dev/accounts/qeqoeq/projects/baobab/builds/72266b36-dee0-442e-b3eb-f11552f3d590
  Soumission : https://expo.dev/accounts/qeqoeq/projects/baobab/submissions/0add2016-12ad-428a-9124-97e08b541600
- **Contenu embarqué** : HEAD `8cd688b` = **31 commits depuis le build 31 (`688f80ea`)** = tout **B22→B33**
  (pass B22, nav permanente B23, cascade nom B24, deep link B25, resync B26, **FR complet** B27/B28, photo
  local-only B29-a1, **one home Jardin + barre partagée** B30, navigate + conteneurs opaques B32 ; sonde B33
  annulée par le revert). Le bundle 31 était **antérieur à B22** (anglais, sans barre) — motif du build.
- **⚠️ RAPPEL — le build 32 devra REPASSER la beta review Apple** pour le groupe externe (BT) **avant** que les
  testeurs externes puissent l'installer. (Le groupe interne peut l'avoir sans review.)
- **À revérifier sur ce build** : l'artefact fantôme natif B33 (parké) — si persistant → investiguer `enableScreens`.

---

## B32 — CLOS (05/08) — barre fantôme (écrans empilés)

> Correctif OTA du symptôme signalé après B30 : après un aller-retour Jardin→Rechercher→Jardin, la barre d'un
> écran resté monté SOUS l'écran courant apparaissait en haut du cadre de l'atlas. La source JSX était propre
> (DIAG-B31, 1 seule barre montée) — le défaut venait de la **pile** + de **conteneurs transparents**.
> **Aucun SQL, aucun deploy Edge Function, aucun build EAS.** B25/B26 non touchés. Doublon de relations **non
> touché** (sujet séparé B33).

### Commit & OTA
```
$ git log --oneline -2
  cfb6355 fix(B32): nav bar uses navigate + opaque screen containers (ghost bar)
  629424d docs: diagnostic B31 (double nav bar, duplicate node)
```
- **Preuves avant OTA** : `tsc --noEmit` → **0 erreur** ; `vitest run` → **40 fichiers / 1127 tests passés**.
- **OTA** : branch `production`, runtime `1.0.0`, iOS, commit `cfb6355`.
  **Update group** `26bd84de-a02f-4b7e-8108-29664d287ac7` · **iOS update** `019fd298-1c58-76d1-a9a1-976688f71b5a`.

### Les deux causes traitées (3 fichiers)
1. **Croissance de la pile** — `components/ui/PrimaryNavBar.tsx` : `router.push` → **`router.navigate`**.
   Vérifié dans la source expo-router que `navigate` **dédupe avec cette config** : `navigate` émet l'event
   `NAVIGATE` (`node_modules/expo-router/build/global-state/routing.js:97-98`) ; `getNavigateAction` cible le
   navigateur divergent (`:226`) → `JUMP_TO` pour l'`expo-tab` (`:235-237`, switch d'onglet, aucun empilement)
   et `NAVIGATE` pop-vers-l'existant pour le root stack. `push` empile toujours sur un stack (`:232`). Jamais
   `replace` ; taper l'entrée active = no-op.
2. **Racine (pourquoi l'écran du dessous était visible)** — conteneurs d'écran **non opaques** : le root
   `<Stack>` (`app/_layout.tsx:437`) n'avait **aucun `contentStyle`** et `<Tabs>` (`app/(tabs)/_layout.tsx`)
   **aucun `sceneStyle`** → fond par défaut du thème (non opaque), l'écran monté dessous transparaissait.
   Ajout de fonds **opaques** : `Stack screenOptions.contentStyle` + `Tabs screenOptions.sceneStyle` =
   `colors.background.primary`. **C'est la vraie garantie** ; `navigate` seul n'aurait fait que masquer le symptôme.
   (Props confirmés pour ces versions : native-stack `contentStyle`, bottom-tabs v7 `sceneStyle`.)

---

## B30 — CLOS (05/08) — one home named Jardin, barre partagée, routage déterministe

> Option B livrée (fusion atlas/liste = option A **parkée**, `docs/PARKING.md`). Constat Sou 20/07 :
> deux surfaces / trois noms + pas de retour uniforme. **Aucun SQL, aucun deploy Edge Function, aucun build EAS.**
> B26 (resync) et B25 (atterrissage deep-link) **non touchés**.

### Commit & OTA
```
$ git log --oneline -3
  461674d feat(B30): one home named Jardin, shared nav bar, deterministic routing
  7171b5c docs: diagnostic B30 (one home, one name)
  4ce797d docs: close B28 + B29-a1 (OTA published), park B29-b avatar sync
```
- **Preuves avant OTA** : `tsc --noEmit` → **0 erreur** ; `vitest run` → **40 fichiers / 1127 tests passés**.
- **OTA** (un seul) : branch `production`, runtime `1.0.0`, iOS, commit `461674d`.
  **Update group** `5eb96cb8-a6bf-45a1-b062-806ccba60a3f` · **iOS update** `019fd148-5034-72c3-b7e5-64d0fb0bce8a`.

### Ce qui est livré
- **Nommage** : « Jardin » = l'**accueil** (ego graph, `index.tsx`) ; « Bao » = marque seule (retiré de la chrome de
  nav) ; « Carte » supprimé comme nom d'écran ; `garden.tsx` = mode de consultation « **Rechercher** ».
- **Barre permanente partagée** : bloc extrait de `index.tsx` → `components/ui/PrimaryNavBar.tsx`, montée sur les
  **5 surfaces** (accueil, garden, place, reveals, profile). 5 entrées, accueil en 1er :
  **Jardin(/(tabs)) · Rechercher(/garden) · Lieux · Révélations · Toi**. Entrée active distinguée (libellé accent
  or + soulignement, `accessibilityState.selected`). **Sans troncature par construction** : items `flex:1`, badge
  **positionné en absolu** (ne dispute jamais la largeur au libellé le plus long « Révélations »),
  `adjustsFontSizeToFit`. Invariant B23 préservé (chaque entrée rend toujours ; le compteur n'est qu'un badge).
  _Vérification visuelle sur device recommandée au prochain coup d'œil testeur — la robustesse est structurelle._
- **Routage déterministe** : la barre navigue en `router.push` (jamais `replace`) ; taper l'entrée active = no-op.
  `reveals/index.tsx` → cible l'**accueil** `/(tabs)` (push), **plus jamais** `/(tabs)/garden` (:134, :172).
  `me/profile.tsx` back → `/(tabs)` explicite (plus `router.back()`). Pont « Carte » de garden **supprimé**
  (la barre le remplace). `/(tabs)/garden` **reste résolvable** (route conservée, `href:null`) → aucun lien mort.
- **Vocabulaire** (exactement les chaînes listées) : index `Ton Bao`→`Ton Jardin`, `dans ton Bao`→`dans ton Jardin`,
  `Signaux privés de ton Bao.`→`…Jardin.` ; `(tabs)/_layout` title `Bao`→`Jardin` ; profile back `Bao`→`Jardin`,
  `Préparation de ton Bao…`→`…de ton profil…` ; garden header `Jardin`→`Rechercher`, `‹ Jardin`→`‹ Rechercher` (x2).
  Kickers `BAOBAB` inchangés (marque). `primary-nav.test` mis à jour pour le jeu à 5 entrées.

### ⚠️ Tradeoff signalé (auditeur)
La barre navigue en **push** partout (mandat « jamais replace »), avec no-op sur l'entrée active. La pile peut donc
croître en alternant les onglets (A→B→A…) puisque ce ne sont pas de vrais onglets natifs. Suffisant et sûr en
Phase 0 ; si l'on veut une pile bornée à la « vrai onglet », passer la barre à `router.navigate` (dedup, toujours
≠ replace) — à décider hors périmètre B30.

### Fichiers (9) : `components/ui/PrimaryNavBar.tsx` (nouveau) · `lib/primary-nav.ts` + `.test.ts` ·
`app/(tabs)/index.tsx` · `app/(tabs)/_layout.tsx` · `app/(tabs)/garden.tsx` · `app/reveals/index.tsx` ·
`app/place/index.tsx` · `app/me/profile.tsx`.

---

## B28/B29-a1 — CLOS (22/07)

> Livrés et publiés. Preuves ci-dessous. **Aucun SQL, aucun deploy d'Edge Function, aucun build EAS** — 100 % JS → OTA.

### Commits (poussés sur `origin/main`)

```
$ git log --oneline -3
  7748324 fix(B29): honest local-only label under profile photo picker
  9957a65 feat(B28): full French UI (all screens, nav bar, header titles)
  f381df1 docs: status B28-B29
```

- **B28** `9957a65` — 36 fichiers : 18 écrans (dont `app/_layout.tsx` + les 17 de la passe), 5 composants
  (dont `PlacePassSheet`), 13 libs (dont 5 tests, assertions EN→FR uniquement). Working tree propre après commit.
- **B29-a1** `7748324` — `app/me/edit.tsx` seul : texte discret « Visible par toi uniquement » sous le picker de photo.

### Preuves avant publication
- `tsc --noEmit` → **0 erreur**.
- `vitest run` → **40 fichiers / 1127 tests passés**.

### OTA (un seul, couvrant les deux commits)
- branch `production`, runtime `1.0.0`, iOS, commit `7748324`.
- **Update group** `e15621c7-2ab8-4282-a3b7-5b1c07089a04` · **iOS update** `019f8a70-3229-74bf-97c9-8b6f08d373e3`.

### B28 — ce qui est livré
- **Barre de nav** (arbitrage validé Samo) : `Garden·Places·Reveals·You` → **`Jardin · Lieux · Révélations · Toi`**
  (`lib/primary-nav.ts` ; test = `label.length > 0`, aucun couplage).
- **Titres d'en-tête `app/_layout.tsx`** (10) : Sign in→**Connexion**, Edit profile→**Modifier le profil**,
  Settings→**Réglages**, Invite by number→**Inviter par numéro**, Edit relation→**Modifier la relation**,
  Save a place→**Enregistrer un lieu**, Create your card→**Créer ta carte**, Foundational reading→**Lecture fondatrice**,
  Archived relationships→**Relations archivées**. `Baobab` (l.520) inchangé (marque).
- **⚠️ Écart de terme signalé (contrainte anti-doublon)** : le titre imposé « Relationship lexicon → Lexique
  relationnel » a été **aligné sur l'écran**, qui affiche déjà « Ton lexique des relations »
  (`app/relation/lexicon.tsx:33`). Titre d'en-tête retenu : **« Lexique des relations »** (pas « Lexique relationnel »),
  pour ne pas créer deux termes pour la même notion.
- **Nuances validées** : `getLinkStrengthDisplayLabel` local à `garden.tsx` (Strong/Good/Fragile/Needs care →
  Solide/Bon/Fragile/À soigner, aux points de rendu ; clés `SharedLinkStrengthLabel` intactes) + infobulle
  `EgoGraph` « Open gateway » → « Passage ouvert ».
- **Laissé volontairement** : marque `Bao/BAOBAB/Baobab` ; labels identiques en FR (`Restaurant, Bar, Service,
  Sport, Culture, Stable`).

### B29-a1 — ce qui est livré
Verdict **local-only** confirmé (détail `docs/DIAG-B29.md`) : `photoUri` persiste en AsyncStorage, commenté
« Not synced to the backend » (`store/useRelationsStore.ts:401-404`) ; aucune colonne avatar sur
`user_public_profiles` ; aucun chemin d'upload Storage ; counterpart rendu en initiale. **Option a1 livrée** :
libellé « Visible par toi uniquement ». La vraie sync (option b) est **parkée** (voir `docs/PARKING.md`).

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
| B28 UI FR complète + B29-a1 (label local-only) | `e15621c7-2ab8-4282-a3b7-5b1c07089a04` | `019f8a70-3229-74bf-97c9-8b6f08d373e3` | `7748324` |
| B30 one home Jardin + barre partagée + routage déterministe | `5eb96cb8-a6bf-45a1-b062-806ccba60a3f` | `019fd148-5034-72c3-b7e5-64d0fb0bce8a` | `461674d` |
| B32 barre fantôme : navigate dedup + conteneurs opaques | `26bd84de-a02f-4b7e-8108-29664d287ac7` | `019fd298-1c58-76d1-a9a1-976688f71b5a` | `cfb6355` |
| ~~B33 sonde temporaire~~ (remplacée par le revert ci-dessous) | `e9be94e2-283b-404e-a11f-e944fb44b13d` | `019fd2c3-b9b3-72e8-8f12-1acaba261e38` | `fd48942` |
| B33 **revert sonde** (état propre, sans sonde) | `c6ea739c-1b1f-49a8-8cf0-4c3c2b7b4729` | `019fd34a-71ed-741e-bef2-560e85b8e40c` | `d9f2fae` |
| B38 (`mutual_score` au bootstrap) + instrumentation B39 (tampon updateId/runtime + logs) | groupe au registre EAS | `019ff337-…` (updateId relevé on-device) | `c316aed` |
| **B41** — restaure la cérémonie du 2ᵉ participant (publié par Samo, validé terrain 12/08) | groupe au registre EAS | au registre EAS | `124ec04` |

tsc 0 à chaque publication ; vitest **1127/1127** (B25→B33), **1129/1129** (B38), **1131/1131** (B41). La sonde
`019fd2c3` a été remplacée par le revert `019fd34a`. Dernier OTA production servi = l'OTA **B41** (`124ec04`,
publié par Samo le 12/08 ; groupe/update **au registre EAS**, non recopié ici pour ne pas inventer d'UUID).

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
