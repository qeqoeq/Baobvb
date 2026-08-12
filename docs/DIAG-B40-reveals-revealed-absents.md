# DIAG-B40 — Pourquoi Révélations n'affiche pas un reveal `revealed` non ouvert

> **Lecture seule.** Aucun correctif. Chaque réponse porte `fichier:ligne`, sinon « NON PROUVÉ ».
> Faits établis (relation `c41ab40b…`, store : `status='revealed'`, `mutualScore=90`, `firstViewedAt=undefined`,
> updateId `019ff337`) tenus pour acquis.

---

## Verdict

Révélations ne liste **que** `reveal_ready` (compteur/hero) et `cooking_reveal`/`waiting_other_side`+lecture (en
attente). Un `revealed` **ne matche aucune** de ces conditions positives → il **disparaît silencieusement**. Et
comme le bootstrap matérialise directement `status='revealed'` (sans passer par `reveal_ready` côté client), la
fenêtre où Révélations l'aurait listé **n'a jamais eu lieu localement**. Enfin, le seul geste qui pose
`firstViewedAt` est le **CTA « révéler » de `relation/[id]`** ; il n'est pas déclenché par la simple ouverture de
la fiche, et il n'est montré que si le reveal est traité comme *pas encore ouvert*.

---

## 1. Le filtre exact de `reveals/index.tsx` (:53-76)

Deux ensembles, tous deux par **conditions POSITIVES** (aucune exclusion explicite de `revealed`) :
- **`readyEntries`** (`:54-59`) : `.filter((entry) => entry.relation.localState.revealSnapshot.status === 'reveal_ready')`
  (`:57`).
- **`waitingEntries`** (`:65-76`) : `.filter(...)` où (`:70-73`)
  `s === 'cooking_reveal' || (s === 'waiting_other_side' && entry.hasFoundationalReading)`.

⇒ Un `status === 'revealed'` **n'est pas exclu explicitement** : il **tombe hors** des trois conditions positives
(`'reveal_ready'`, `'cooking_reveal'`, `'waiting_other_side'`). Il n'apparaît donc dans **ni** l'une **ni** l'autre
liste. (Aucune section « revealed » n'existe dans cet écran.)

## 2. Le compteur « 0 PRÊT »

- Valeur : **`readyEntries.length`** (`app/reveals/index.tsx:147`), libellé `PRÊT` (`:148`).
- Ensemble compté : `readyEntries` → condition **`status === 'reveal_ready'`** (`:57`).
- Donc un `revealed` **n'est pas compté** → `0`. L'empty-state « Rien en attente » s'affiche quand
  **`readyEntries.length === 0 && waitingEntries.length === 0`** (`app/reveals/index.tsx:166`) — les deux sont
  vides pour une relation isolée `revealed`.

## 3. Où est posé `firstViewedAt` — tous les points d'appel

Le champ est **écrit** dans **`openMutualRevealInState`** (store) :
- branche « déjà revealed » : `if (!snapshot.firstViewedAt) { … revealSnapshot: { …, firstViewedAt: now } }`
  (`store/useRelationsStore.ts:1940-1948`) — *stampe le cas bootstrappé* (le commentaire `:1937-1938` décrit
  exactement notre relation) ;
- branche `reveal_ready → revealed` : `firstViewedAt: item.localState.revealSnapshot.firstViewedAt ?? now`
  (`:1970`).

Exposé : `openMutualReveal` (`:2092-2093`) → action `revealMutualRelationship` (`:3233`).

**TOUS les appelants** (`revealMutualRelationship`) sont dans **`relation/[id].tsx`**, fonction **`handleOpenReveal`**
(`:514`) :
- `:546` (branche serveur `reveal_ready` re-syncé),
- `:560` (branche locale, pas de `sharedReveal`),
- `:587` (« stamp firstViewedAt on every success path »).

Et `handleOpenReveal` n'est déclenché **qu'ici** : `if (nextAction.ctaKind === 'reveal') { void handleOpenReveal(); }`
(`app/relation/[id].tsx:716-718`). ⇒ **Le seul geste qui pose `firstViewedAt` = taper le CTA « révéler »**
(la cinématique) sur la fiche. Aucun `useEffect` de montage ne l'appelle (grep : `revealMutualRelationship`
n'existe qu'aux lignes ci-dessus). (L'hydratation restaure `firstViewedAt` depuis le persisté `:1485-1487` et le
merge le préserve `:2824`, mais **aucun** ne le *pose* à neuf.)

## 4. Un `revealed` + `firstViewedAt` undefined est-il atteignable par un chemin qui poserait le champ ?

**Chemins vers `relation/[id]`** (tous mènent à la fiche, aucun ne stampe *au montage*) :
- **Jardin, tap d'un nœud** → `relation/[id]` (B36-1, `app/(tabs)/index.tsx:182` `router.push('../relation/'+id)`).
- **Notification / deep link** → `relation/[id]` (B25, `app/_layout.tsx` handlers).
- **Révélations, carte moment** → `relation/[id]` (`app/reveals/index.tsx:96`) — **mais** cette relation n'est
  pas listée là (Q1), donc ce chemin ne s'applique pas.

**Aucun de ces chemins ne pose `firstViewedAt` par la simple navigation** : `revealMutualRelationship` n'est
appelé que par `handleOpenReveal`, gardé par `nextAction.ctaKind === 'reveal'` (`:716-718`). Le stamp exige donc
que le **CTA « révéler » soit affiché puis tapé**.

Or l'affichage du CTA dépend de `getRelationNextAction({ …, nameRevealed, revealStatus })` (`relation/[id]:427-433`),
et `nameRevealed` (`:387-390`) se calcule sur `relationForDisplay = effectiveRelation` (store **+ overlay
`sharedReveal`**, `:384`, `:204`) — où `firstViewedAt` peut venir de `sharedReveal.first_viewed_at`
(`lib/relationship-reveal-precedence.ts:37`). Deux cas :
- si le serveur a `first_viewed_at` non nul (reveal déjà ouvert côté serveur) → `nameRevealed = true` → la fiche
  rend le reveal **déjà ouvert** → `ctaKind` **≠ 'reveal'** → **pas de CTA → `firstViewedAt` du STORE jamais posé** ;
- si le serveur a `first_viewed_at` nul aussi → `nameRevealed = false` → `ctaKind` peut valoir `'reveal'` → taper
  le CTA **poserait** le champ dans le store (`:587`).

⇒ **Réponse** : il n'existe **aucun chemin qui pose `firstViewedAt` par la seule navigation**. Le seul mécanisme
est le **CTA « révéler »** de la fiche, et il n'apparaît que si le reveal est considéré *non encore ouvert*
(`nameRevealed=false`). **Savoir si ce CTA s'affiche pour CETTE relation dépend de `sharedReveal.first_viewed_at`
(valeur serveur, runtime) → NON PROUVÉ statiquement.** Test : `SELECT first_viewed_at FROM shared_relationship_reveals
WHERE relationship_id='c41ab40b…';` (ou lire `get_my_reveal_state`). Si non-null → la fiche s'ouvre en mode
« déjà révélé » et **rien n'atteint le stamp** ; si null → le CTA « révéler » est le chemin.

## 5. `firstViewedAt` lu ailleurs que par `getRevealedLinkStrength` ?

Oui — **surface large** (important pour l'impact d'un changement) :

| # | Lecture | Rôle |
|---|---|---|
| 1 | `app/relation/[id].tsx:390` | `nameRevealed` — **gate d'affichage de la carte reveal** (tier/score) |
| 2 | `app/relation/[id].tsx:550` | contrôle post-reveal (`notReady`) |
| 3 | `app/(tabs)/garden.tsx:85` | `getRevealedLinkStrength` → **Santé + Liens partagés** (le cas connu) |
| 4 | `app/(tabs)/garden.tsx:432` | flag `isRevealed` du rendu d'une **ligne de relation** (Rechercher) |
| 5 | `lib/circle-node-state.ts:227` | `deriveLinkQualityBand` : `!firstViewedAt` → **`'faint'`** — le **nœud du Jardin reste éteint** tant que non ouvert (**anti-fuite du score privé sur la carte**) |
| 6 | `lib/relation-visibility.ts:36` | `isLexiconDiscoverable` : revealed **+ firstViewedAt** + !archived → **contribue un tier au lexique** |
| 7 | `lib/relationship-reveal-precedence.ts:37` | overlay : mappe `sharedReveal.first_viewed_at` → `firstViewedAt` (pose, ne *gate* pas) |
| — | store `:1485-1487` (hydratation), `:1885` (remise à `undefined`), `:1940/1948/1970` (stamp), `:2824` (merge) | écritures internes |
| — | `app/me/profile.tsx:186` | panneau B39 (temporaire) |

**Impact d'un changement** : `firstViewedAt` est le **gate « ouverture cinématique B5 »**, lu par au moins 6
surfaces. Le poser au bootstrap (ou relâcher la garde) ferait basculer d'un coup : l'affichage de la carte reveal
sans cinématique, Santé/Liens, l'état de la ligne Rechercher, **et surtout la couleur du nœud sur le Jardin**
(`'faint'` → coloré = **le score/tier deviendrait visible sur la carte avant toute ouverture** — c'est la fuite
que `circle-node-state:224-227` ferme volontairement) ainsi que la découvrabilité au lexique. Ce n'est donc pas un
champ « cosmétique » local à Santé.

## 6. État intermédiaire court-circuité ?

**Oui.** Cycle : `waiting_other_side → cooking_reveal → reveal_ready → revealed`. **`reveal_ready` est précisément
l'état que Révélations liste** (`readyEntries`, `:57`).

- **Le bootstrap matérialise `status` en direct** : `buildSharedRevealLocalState`
  (`store/useRelationsStore.ts:2723-2725`) → `normalizedStatus = isRevealStatus(data.status) ? data.status :
  'waiting_other_side'`. Une ligne RPC `status='revealed'` devient donc **directement** un snapshot local
  `'revealed'`, **sans jamais passer par `reveal_ready`**.
- Les **seules** entrées locales dans `reveal_ready` sont `markRevealReadyIfUnlockedInState` (transition
  cooking→ready, exige un `unlockAt` local écoulé, `store:~1906-1928`) et `syncSharedRevealToReady` (record
  serveur `reveal_ready`). **Aucune** ne se déclenche pour une relation bootstrappée en `revealed`.

⇒ Le serveur, lui, est bien passé par `reveal_ready` (sa timeline), mais **le client a bootstrappé droit sur
`revealed`**. La fenêtre « PRÊT » (le seul moment où Révélations l'aurait affiché) **n'a jamais existé côté
client**. Le passage direct à `revealed` **court-circuite l'écran Révélations**.

---

## Synthèse

| Q | Réponse (fichier:ligne) |
|---|---|
| 1 | Filtre positif ; `revealed` tombe hors de `reveal_ready` (`reveals:57`) / cooking/waiting (`:68-73`) — jamais exclu explicitement, jamais matché |
| 2 | Compteur = `readyEntries.length` (`reveals:147`), condition `status==='reveal_ready'` (`:57`) → 0 |
| 3 | `firstViewedAt` posé par `openMutualRevealInState` (`store:1940-1948`, `:1970`) ← `revealMutualRelationship` ← `handleOpenReveal` (`relation/[id]:514,546,560,587`), déclenché **uniquement** par CTA `ctaKind==='reveal'` (`:716-718`) |
| 4 | Aucun chemin ne pose le champ **par la navigation** ; seul le CTA « révéler » le fait, et il n'apparaît que si `nameRevealed=false`. Son affichage pour cette relation dépend de `sharedReveal.first_viewed_at` (serveur) → **NON PROUVÉ** (test SQL fourni) |
| 5 | Lu par `nameRevealed` (`relation/[id]:390`), Santé/Liens (`garden:85`), ligne Rechercher (`garden:432`), **nœud Jardin `'faint'`** (`circle-node-state:227`), **lexique** (`relation-visibility:36`), overlay (`precedence:37`). Changement = impact large (anti-fuite carte incluse) |
| 6 | **Oui, court-circuit** : bootstrap mappe `status` en direct (`store:2723-2725`) → `revealed` sans passer par `reveal_ready` ; aucune transition locale vers `reveal_ready` ne s'applique → fenêtre « PRÊT » jamais surfacée |

_Diagnostic seul. Aucun code modifié, aucun SQL exécuté, aucun correctif proposé._
