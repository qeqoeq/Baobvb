# Rapport de diagnostic — B30 (one home, one name)

> Constat terrain (testeuse externe, build 31, 20/07) :
> « Garden renvoie pas aux mêmes pages en fonction des pages depuis lesquelles on clique dessus.
> Finalement on ne sait pas à quoi correspond vraiment le garden. »
> « Il faudrait un retour uniforme à la HomePage depuis toutes les pages. »
>
> **Diagnostic seul — aucune ligne de production modifiée.** Preuves `fichier:ligne`.
> STOP : aucun code, aucun OTA, aucun SQL. Attente d'arbitrage avant tout fix.

---

## VERDICT — l'hypothèse est confirmée : **deux surfaces, trois noms, un seul concept.**

L'app a bien deux écrans distincts pour ce qui, pour l'utilisatrice, est « la maison » :
- `app/(tabs)/index.tsx` — l'**ego graph** (atlas de nœuds), header **« Ton Bao »**, écran de lancement.
- `app/(tabs)/garden.tsx` — **recherche + liste + santé des liens**, header **« Jardin »**.

Le même écran d'accueil (ego graph) est nommé **trois** façons différentes selon d'où on le regarde :
« **Ton Bao** » (sur lui-même, `index.tsx:212`), « **Carte** » (pont depuis garden, `garden.tsx:661`), et le
bouton **« Jardin »** de la barre… mène à l'*autre* écran (`garden.tsx`). En parallèle, « **Jardin** » est aussi
le mot employé partout pour désigner *toute la collection de relations* (`relation/add.tsx:185`,
`invite/[relationId].tsx:459`, `reveals/index.tsx:138`…). Le mot « Jardin » porte donc **deux référents** :
un écran ET la métaphore globale. C'est la racine exacte du « on ne sait pas à quoi correspond le garden ».

À cela s'ajoutent deux défauts de routage (push vs replace, notion d'accueil incohérente) détaillés en §2.

---

## 1. Cartographie de routage

### Racine — `app/_layout.tsx` (Stack)
Écran de lancement : après auth-routing (`app/_layout.tsx:23,89` `resolvePostAuthDestination`), la destination
est le groupe `(tabs)` → route par défaut `index` = **`app/(tabs)/index.tsx`** (l'ego graph). Confirmé par
`app/(tabs)/circle.tsx` : « World is now the default home at /(tabs). »

Routes déclarées (l.437-544) — `(tabs)` a `headerShown:false` (l.442) ; toutes les autres sont des écrans
empilés avec header natif : `auth/sign-in`, `identity/conflict`, `me/qr|scan|profile|edit|settings|invite-by-number`,
`relation/add|edit/[id]|[id]|lexicon|evaluate/[id]|archived`, `place/add|index|[id]|edit/[id]`,
`invite/[relationId]|identity/[relationId]`, `through/[id]`.

### Onglets — `app/(tabs)/_layout.tsx`
- Barre d'onglets **native masquée** : `tabBarStyle: { display: 'none' }` (l.10).
- 3 écrans enregistrés seulement : `index` (title `'Bao'`, l.15), `garden` (`href: null` → masqué, l.16-21),
  `circle` (`href: null`, redirect, l.23).
- **`garden` n'est PAS un onglet visible** : il n'existe aucune barre d'onglets. La seule chrome de navigation
  est une **barre custom rendue uniquement dans `index.tsx`** (voir ci-dessous).

### La barre « permanente » (B23) n'est permanente que sur l'accueil
- `getPrimaryNavItems` (`lib/primary-nav.ts`) → 4 entrées : **Jardin / Lieux / Révélations / Toi**
  (clés `garden/places/reveals/profile`).
- Rendue **exclusivement** dans `app/(tabs)/index.tsx:384-409`. Mapping des routes `index.tsx:386-391` :
  `garden→'/garden'`, `places→'/place'`, `reveals→'/reveals'`, `profile→'/me/profile'`.
- **Aucune de ces 4 cibles n'est l'accueil (`index.tsx`).** Il n'y a donc **pas d'entrée « accueil » dans la
  barre**, et la barre **n'existe pas** sur garden / place / reveals / profile.

### L'ego graph (accueil) est-il atteignable depuis la barre ? **NON.**
Depuis l'accueil la barre t'emmène ailleurs ; depuis les 4 destinations, il n'y a **aucune** barre. Le retour
à l'ego graph dépend de mécanismes ad hoc, tous différents (§2). Cas le plus dur : **depuis Révélations, on ne
peut PAS revenir à l'ego graph** — le repli mène à *garden* (`reveals/index.tsx:134,172`), pas à l'accueil.

---

## 2. Tous les points de navigation vers « garden » (et retours accueil)

### Vers `garden.tsx`
| Depuis | Ligne | Appel | Destination | Méthode |
|---|---|---|---|---|
| `index.tsx` (overflow atlas « +N ») | `app/(tabs)/index.tsx:188` | `router.push({pathname:'/garden'})` | `/garden` | **push** |
| `index.tsx` (chip « N ready ») | `:268` | `router.push({pathname:'/garden', params:{filter:'ready'}})` | `/garden?filter=ready` | **push** |
| `index.tsx` (chip « N en formation ») | `:282` | `router.push({pathname:'/garden', params:{filter:'forming'}})` | `/garden?filter=forming` | **push** |
| `index.tsx` (barre, bouton **« Jardin »**) | `:387` + `:397` | `router.push(routeByKey['garden'])` = `/garden` | `/garden` | **push** |
| `reveals/index.tsx` (repli « retour ») | `:133-134` | `if canGoBack back() else router.replace('/(tabs)/garden')` | `/(tabs)/garden` | **replace** |
| `reveals/index.tsx` (CTA vide « Jardin ») | `:172` | `router.replace('/(tabs)/garden')` | `/(tabs)/garden` | **replace** |

### Retour vers l'ego graph (accueil)
| Depuis | Ligne | Appel | Cible réelle |
|---|---|---|---|
| `garden.tsx` (pont **« Carte »**) | `app/(tabs)/garden.tsx:657` | `router.push('/(tabs)')` | ego graph (**push → empile**) |
| `me/profile.tsx` (back, label **« Bao »**) | `app/me/profile.tsx:38-39` | `router.back()` | dépend de la pile |
| `place/index.tsx` | header natif | chevron back (`_layout`) | dépend de la pile |
| `reveals/index.tsx` | `:134,172` | `router.replace('/(tabs)/garden')` | **garden, PAS l'ego graph** |

### Divergences qui produisent le constat de Sou
1. **push vs replace.** L'accueil atteint garden en **push** (garden s'empile ; « retour » revient à l'accueil).
   Révélations atteint garden en **replace** (garden *remplace* Révélations ; pas de retour, et garden y est
   traité comme l'accueil). → « Garden renvoie pas aux mêmes pages selon d'où on clique. » **Exact.**
2. **Notion d'« accueil » incohérente.** Pont de garden → `/(tabs)` (ego graph) ; repli de Révélations →
   `/(tabs)/garden` (garden) ; back de Profil → `router.back()` étiqueté « Bao ». Trois cibles « maison » différentes.
3. **Pas de chrome uniforme.** La barre n'existe que sur l'accueil ; chaque écran secondaire réinvente son
   retour (chevron natif, « ‹ Jardin » `garden.tsx:808,823`, label « Bao » `profile:39`, replace-vers-garden).
4. **Le bouton « Jardin » n'est pas l'accueil.** L'utilisatrice lance l'app sur « Ton Bao », voit une barre dont
   la **1re** entrée est « Jardin », tape — et arrive sur un **autre** écran (recherche/liste) qui se dit aussi
   « Jardin ». Deux maisons concurrentes.

---

## 3. Inventaire de duplication (`index.tsx` vs `garden.tsx`)

### Source de données — **identique** (même store, même dérivation)
- `index.tsx:47` `getFoundationalReadings(relations, evaluations)`
- `garden.tsx:167-172` `getFoundationalReadings(activeRelations, evaluations)` + `archivedRelations`
- Les deux dérivent des **mêmes** `useRelationsStore` + `lib/foundational-reading` + `lib/relation-detail-helpers`
  (`getRelationSheetIdentity`). Les compteurs (`formingCount`, `readyCount`/`readyEntries`, `waitingCount`) sont
  **recalculés des deux côtés** à partir des mêmes readings (`index.tsx:97-131`, `garden.tsx:176-234`).

### Propre à `index.tsx` (ego graph / accueil)
- `EgoGraph` (`components/ui/EgoGraph.tsx`, import `index.tsx:10`) — l'atlas visuel de nœuds (map ego-centrée).
- La **barre permanente** (`getPrimaryNavItems`, `:384-409`).
- Bande « Mondes ouverts » (`:292-333`), feuille objet reçu (`PlaceReceivedSheet`), menu d'action « + ».

### Propre à `garden.tsx` (consultation)
- **Recherche** (`TextInput`, `searchResults` `:342`, `searchResultsView` `:371`, `filteredEntries` `:270`).
- **Filtres/buckets** (ready/forming/waiting/revealed, `filterLabel` `:388`, back « ‹ Jardin » `:808,823`).
- **Santé des liens** (`linkHealthSummary` `:217`, `needsAttentionEntries` `:234`), archivés (`:171`).
- Pont **« Carte »** vers l'ego graph (`:655-666`).
- Câblage **B26** propre : `RefreshControl` + `resyncSharedRelations` + AppState.

### Réutilisable tel quel pour une fusion
- `EgoGraph` (composant autonome, prend `members`/`me`/`size`), `getPrimaryNavItems`, `getFoundationalReadings`,
  `getRelationSheetIdentity`, `PlaceReceivedSheet`, toute la logique de compteurs. **Aucune logique métier n'est à
  réécrire** : la fusion est surtout un travail de *présentation* (un écran hôte qui monte l'atlas ET la
  liste/recherche), pas d'algorithme.

---

## 4. Occurrences des termes de marque visibles (coût d'unification du vocabulaire)

| Terme | Fichier:ligne | Contexte |
|---|---|---|
| « Ton Bao » | `app/(tabs)/index.tsx:212` | header de l'accueil |
| « dans ton Bao » | `app/(tabs)/index.tsx:218` | badge réseau |
| « Signaux privés de ton Bao. » | `app/(tabs)/index.tsx:311` | légende mondes |
| title `'Bao'` | `app/(tabs)/_layout.tsx:15` | titre d'onglet (masqué mais déclaré) |
| « Bao » (back label) | `app/me/profile.tsx:39` | retour vers accueil |
| « Préparation de ton Bao… » | `app/me/profile.tsx:117` | loader QR |
| **« Jardin »** (header écran) | `app/(tabs)/garden.tsx:565` | header de garden |
| « Rechercher dans ton Jardin » | `app/(tabs)/garden.tsx:574` | placeholder recherche |
| « ‹ Jardin » (x2) | `app/(tabs)/garden.tsx:808,823` | retours internes garden |
| **« Jardin »** (label barre) | `lib/primary-nav.ts:21` | entrée de nav (→ `/garden`) |
| « Carte » (pont) | `app/(tabs)/garden.tsx:661` | pont garden→ego graph |
| « ton Jardin » (collection) | `relation/add.tsx:185`, `relation/edit/[id].tsx:83`, `invite/[relationId].tsx:459` | métaphore globale |
| « Jardin » (retour) | `reveals/index.tsx:138,173` | bouton retour |
| `'BAOBAB'` kicker | index/garden/reveals/place/profile/qr/add/through/invite… | marque, **à conserver** |

**Coût vocabulaire** : faible en volume (~14 chaînes « Bao »/« Jardin »/« Carte » à arbitrer). La difficulté
n'est pas le nombre mais la **décision** : « Jardin » = l'accueil (ego graph) **et** la collection ; il faut
alors renommer l'accueil « Ton Bao » → « Jardin », neutraliser « Carte » comme *mode* de l'accueil, et laisser
« Bao » uniquement comme nom de marque (ou le retirer de l'UI de navigation).

---

## 5. Chiffrage des deux options

### Option A — fusion complète (garden absorbé dans l'accueil ; liste/carte en toggle)
**Cible** : un seul écran-maison « Jardin » (1er onglet) = l'ego graph, avec un **mode consultation**
(recherche/liste/santé) accessible en toggle, pas un onglet distinct.

- **Fichiers touchés** :
  `app/(tabs)/index.tsx` (écran hôte : monter atlas + mode liste/recherche + toggle + réception du param
  `filter`), `app/(tabs)/garden.tsx` (extraire recherche/liste/santé en composant monté par l'accueil, puis
  route → **redirect** à la `circle.tsx`), `lib/primary-nav.ts` (entrée « Jardin » → accueil, ou toggle interne),
  `app/reveals/index.tsx:134,172` (cible accueil, pas garden), `app/me/profile.tsx:39,117` (label),
  `app/(tabs)/_layout.tsx:15` (titre), éventuellement `app/(tabs)/circle.tsx` (précédent de redirect).
  → **~6-8 fichiers**, dont le plus lourd (`index.tsx`, écran de lancement) et l'extraction de garden (~1470 lignes).
- **Risque de régression** : **ÉLEVÉ.** `index.tsx` est l'écran de lancement le plus load-bearing (atterrissage
  deep-link B25, resync B26, atlas, pass, compteurs). Fusionner la logique d'un écran de ~1470 lignes + un toggle
  + la réception de `filter` en param change le comportement d'ouverture de l'accueil. Reflow de layout (l'atlas
  occupe tout le viewport ; la liste est un ScrollView) — voir §6.
- **Tests impactés** : logique surtout **inchangée** (on réutilise `foundational-reading`, `circle-node-state`,
  `places`, `relation-open-worlds` → suites lib intactes). Impact = tests de navigation/`primary-nav` +
  probables **nouveaux** tests pour l'état de toggle et le param `filter`.
- **OTA-able** : **OUI** (100 % JS, aucun natif) — mais OTA à **haut risque** (écran de lancement).

### Option B — minimal (accueil atteignable + routage déterministe, sans fusion)
**Cible** : garder deux écrans, mais rendre l'accueil **toujours atteignable** et le routage **déterministe**,
et lever l'ambiguïté de nom.

- **Fichiers touchés** :
  `app/reveals/index.tsx:134,172` (repli → accueil `/(tabs)` au lieu de `/(tabs)/garden`) ;
  homogénéiser push/replace vers garden (choisir **une** méthode) ; `lib/primary-nav.ts` + `index.tsx:386`
  (clarifier ce que fait « Jardin » et/ou ajouter un retour accueil uniforme) ; renommage vocabulaire
  (`index.tsx:212,218,311`, `_layout.tsx:15`, `profile.tsx:39,117`) pour distinguer accueil vs collection ;
  option : rendre la barre permanente présente aussi sur garden/place/reveals/profile (extraire le bloc
  `primaryNav` de `index.tsx:384-409` en composant partagé).
  → **~4-6 fichiers**, changements surgicaux (cibles de route + chaînes + éventuel composant barre partagé).
- **Risque de régression** : **FAIBLE à MOYEN** (surtout des cibles de `router.*` et des libellés ; si on extrait
  la barre en composant partagé, un peu plus de surface mais mécanique).
- **Tests impactés** : **minimaux** (`primary-nav.test` n'assert que `label.length>0`). Éventuel test de cible de route.
- **OTA-able** : **OUI**, faible risque.

**Recommandation de séquencement** : B d'abord (stoppe la confusion et le piège Révélations→garden en un OTA sûr),
puis A comme chantier UX cadré (design Jardin de Nuit) une fois les libellés et le routage stabilisés. A et B
partagent la même cible de nommage (« Jardin » = accueil) — B ne crée pas de dette à défaire pour A.

---

## 6. Obstacles techniques à la fusion (non évidents a priori)

1. **Param `filter` d'entrée.** `garden.tsx` lit `useLocalSearchParams().filter` (chips `index.tsx:268,282`
   passent `ready`/`forming`). Fusionné, l'accueil doit accepter un `filter` sur `/(tabs)` et **s'ouvrir en mode
   liste** dans ce cas — donc le mode d'ouverture de l'accueil devient conditionnel (ne peut plus toujours ouvrir
   l'atlas). À spécifier.
2. **L'atlas s'approprie le viewport.** `EgoGraph` est dimensionné `atlasSize = screenWidth`, centré verticalement,
   avec la barre en `position:absolute` bas (`index.tsx:422`). `garden.tsx` est un `ScrollView` long. Les
   concaténer naïvement casse la mise en page : il faut un **switch de mode** (atlas *ou* liste), pas un empilement.
3. **Double câblage resync (B26).** `garden.tsx` porte `RefreshControl` + `resyncSharedRelations` + AppState ;
   `index.tsx` a déjà son resync foreground. La fusion doit **ne pas dédoubler** le resync (respect du throttle 45s
   + in-flight de B26) ni réintroduire de réconciliation d'orphelins hors cold-start (arbitrage A du cycle B25-B27).
4. **Sélecteurs de store différents.** `index` lit `relations` (puis filtre `isRevealedNetworkMember`) ; `garden`
   lit `activeRelations`/`archivedRelations`. L'écran hôte doit réconcilier « qui alimente l'atlas » vs « qui
   alimente la liste (dont archivés) » sans recompter deux fois.
5. **Sémantique de pile / deep links.** Garden est aujourd'hui un écran *poussé* ; `reveals` fait un `replace`
   vers `/(tabs)/garden`, et l'atterrissage deep-link B25 vise `relation/[id]`. Retirer garden comme route
   impose de **garder `/(tabs)/garden` résolvable** (redirect, à la `circle.tsx:1-6`) ou de corriger **tous** les
   pointeurs (reveals, chips) en même temps — sinon lien mort.
6. **« Carte » est déjà un pont inverse.** `garden.tsx:657` (« Carte » → `/(tabs)`) montre que le modèle mental
   des auteurs est déjà « atlas = Carte, liste = Jardin » — l'inverse de la cible visée (« accueil = Jardin »).
   La fusion doit **retourner** ce vocabulaire (atlas = un mode du Jardin, pas une « Carte » séparée), sinon on
   ré-introduit deux noms.

---

## Synthèse

| Point | Constat |
|---|---|
| Racine | Deux écrans (`index`=ego graph, `garden`=liste) pour un concept ; trois noms (Ton Bao / Carte / Jardin) |
| Accueil atteignable depuis la barre ? | **Non** — barre présente sur l'accueil seul ; Révélations ne revient jamais à l'ego graph |
| Divergence de routage | **push** (index→garden) vs **replace** (reveals→garden) ; cible « accueil » incohérente (3 valeurs) |
| Duplication | Données **identiques** (même store/dérivation) ; présentation propre à chacun ; **atlas et liste réutilisables tels quels** |
| Coût vocabulaire | ~14 chaînes à arbitrer ; décision = « Jardin » = accueil, « Bao » → marque seule |
| Option A (fusion) | ~6-8 fichiers, risque **élevé** (écran de lancement), OTA-able, 6 obstacles §6 |
| Option B (minimal) | ~4-6 fichiers, risque **faible**, OTA-able, pas de dette pour A |

_Diagnostic seul. Aucune modification de code de production. STOP — attente d'arbitrage avant tout fix._
