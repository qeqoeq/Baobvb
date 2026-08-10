# Rapport de diagnostic — B35

> Deux volets. **Diagnostic seul — aucune ligne de production modifiée, aucun correctif, aucun SQL.** Preuves `fichier:ligne`.

---

## Volet (a) — reveal `revealed` (score 90, Legend) invisible sur 3 écrans côté invité (@sounj)

### Verdict

Sou est **side B** (invitée). **Le score mutuel n'entre jamais dans son snapshot de store** :
1. le bootstrap `my_shared_relationships()` **ne renvoie ni `mutual_score` ni `tier`** ;
2. le **seul writer du score dans le store est un calcul LOCAL** qui exige **les deux lectures** — or side B
   n'a jamais la lecture de side A ;
3. le score serveur **existe** et est renvoyé par `get_my_reveal_state`, mais `refreshSharedReveal` le garde en
   **état local du composant détail** et **ne le persiste jamais dans le `revealSnapshot`**.

Les 3 écrans lisent le **snapshot du store** (`mutualScore` / `status`) → `mutualScore` **undefined** côté B →
toutes les vues indexées sur le score sont vides.

### Chemin de lecture, preuves

**1. Bootstrap serveur — pas de score.** `my_shared_relationships()` (`docs/sql/b8_b4_counterpart_name.sql:128-145`)
retourne `status, my_side, side_a/b_present, side_a/b_reading_id (IDs, pas payloads), *_at, counterpart_*` —
**aucune colonne `mutual_score` ni `tier`** (`:130-144`). Donc le snapshot bootstrappé porte au mieux
`status='revealed'`, jamais le score. Merge : `mergeBootstrappedRevealSnapshot` (`store/useRelationsStore.ts:2753-2764`)
= `mutualScore: local.mutualScore ?? server.mutualScore` — `server.mutualScore` est **absent** ⇒ reste `local`.

**2. Le seul writer store du score = calcul LOCAL, impossible côté B.** `store/useRelationsStore.ts:1837-1845` :
```
const readingA = state.evaluations.find(id === readingAId);
const readingB = state.evaluations.find(id === readingBId);
if (!readingA || !readingB) return false;                 // :1839
const mutual = computeMutualRelationshipScore(readingA.ratings, readingB.ratings); // :1845
```
puis écrit `mutualScore: mutual.finalScore, tier: mutual.tier` (`:1867-1868`). **Le calcul exige que les DEUX
lectures existent dans `state.evaluations` local.** Side B (Sou) possède sa lecture (side B) mais **pas** celle de
side A (iPhoneBB) : `my_shared_relationships()` n'expose que `side_a_reading_id` (un ID), **jamais le payload/ratings
de A**. Donc `readingA` est introuvable → `return false` (`:1839`) → **le score n'est jamais calculé chez B**.

**3. Le score serveur existe mais n'est pas persisté.** `get_my_reveal_state` **renvoie** `mutual_score` + `tier`
(`docs/sql/reveal_state_rpc.sql:49-50` et `:79-80`, type `SharedRevealStateResult` `lib/reveal-shared-types.ts:41-`).
Il est appelé par `refreshSharedReveal` (`app/relation/[id].tsx:123-135`) via
`getSharedRevealRecordForCurrentUser` (`lib/reveal-shared-repo.ts:15-30`), mais le résultat n'est mis **que** dans
l'état local du composant : `setSharedReveal(record)` (`app/relation/[id].tsx:134`). **Aucune écriture dans le store.**
La fiche détail affiche donc le score via ce record local en **fallback** (`app/relation/[id].tsx:875`
`{revealedTier ? … : sharedRevealDisplay.tier}`), pendant que le store, lui, garde `mutualScore` = `undefined`
(`:393-394` lisent `relationForDisplay.localState.revealSnapshot.mutualScore/.tier`). → **C'est ici que la donnée est perdue :
à la frontière `refreshSharedReveal` → store, le score serveur n'est jamais reversé dans le `revealSnapshot`.**

### Pourquoi chacun des 3 écrans affiche « aucune donnée »

- **Révélations** (`app/reveals/index.tsx`) : ne liste **que** `reveal_ready` (`:53-59`) et `cooking`/`waiting`
  (`:64-76`). **Aucune section `revealed`.** Une relation `revealed` **n'y apparaît jamais**, score ou pas → écran
  « Rien en attente » (`:166-175`). *(Point distinct du score : Révélations ne surface pas les relations révélées.)*
- **Rechercher / Santé** (`app/(tabs)/garden.tsx:652-687`) : `revealedScoredEntries` = `revealedEntries` filtrées
  par `getRevealedLinkStrength(...) !== null` (`:206-208`) ; or `getRevealedLinkStrength` exige
  `status==='revealed'` **et** `normalizeMutualScore(mutualScore)` (`:84-86`). `mutualScore` undefined → `null` →
  **exclue**. `revealedScoredEntries.length === 0` → carte vide (`:680-681`).
- **Rechercher / Liens partagés** (`app/(tabs)/garden.tsx:698-726`) : rend 4 buckets dont
  `count = linkHealthSummary[label]`, et `linkHealthSummary` est bâti **à partir de `revealedScoredEntries`**
  (`:210-225`, vide) → tous les `count = 0` → 4 portes `bucketDoorEmpty`, non cliquables (`:718-721`) = « aucune donnée ».

> Note : `revealedEntries` (statut `revealed`, `:198-201`) contient bien la relation de Sou → `hasOverviewSharedLinks=true`
> (`:251`), donc ce n'est **pas** l'état « les liens partagés apparaîtront ici » (`:688`) qui s'affiche, mais les
> buckets **à zéro** — cohérent avec « aucune donnée ». La constante commune des 3 écrans : **`mutualScore` absent du store côté B.**

### Où corriger (pour mémoire — NON appliqué)
Reverser le résultat de `get_my_reveal_state` (`mutual_score`/`tier`) dans le `revealSnapshot` du store lors de
`refreshSharedReveal` (ou exposer `mutual_score`/`tier` dans `my_shared_relationships()` pour le bootstrap). Le
calcul local (`:1845`) ne pourra jamais servir side B (pas d'accès à la lecture de A) : la source de vérité du
score, pour l'affichage, doit être le serveur.

---

## Volet (b) — 3 routages contredisant B30

### (b1) Puce « Jardin » sur Révélations → écran précédent (Lieux), pas l'accueil
`app/reveals/index.tsx:131-139` — la puce d'en-tête libellée **« Jardin »** (`:138`) exécute :
```
onPress={() => { if (router.canGoBack()) router.back(); else router.push('/(tabs)'); }}  // :133-134
```
`router.back()` renvoie à **l'écran précédent de la pile**. Si Sou est arrivée sur Révélations **depuis Lieux**,
`back()` → **Lieux**. La puce dit « Jardin » (= accueil, doctrine B30) mais **agit comme un bouton retour**.
*(Distinct de la barre partagée : l'entrée « Jardin » de `PrimaryNavBar` vise `/(tabs)` via `navigate` — ici c'est
la puce d'en-tête propre à Révélations qui contredit B30.)*

### (b2) « Retour » dans Lieux → Rechercher, puis inactif
`Lieux` (`app/place/index.tsx`) est un écran du **root Stack** avec **en-tête natif** (chevron retour :
`app/_layout.tsx:498-508`, `title:''`, `headerBackButtonDisplayMode:'minimal'`) **et** la `PrimaryNavBar` (B30).
Le chevron natif suit la pile. Chemin typique via la barre : accueil → « Rechercher » (`/garden`, **un onglet** du
navigateur `(tabs)`) → « Lieux » (`/place`, écran root Stack). Le retour natif de Lieux dépile vers `(tabs)` avec
l'onglet **garden (Rechercher)** focalisé → **« Rechercher »**. Or `(tabs)/_layout.tsx:8-9` force
**`headerShown:false`** : l'onglet Rechercher **n'a aucun en-tête ni chevron** → le retour **disparaît / devient
inactif**. Cause : **hiérarchie mixte** — Lieux = écran root Stack *avec* en-tête natif ; Rechercher = *onglet* *sans*
en-tête. La navigation n'est donc pas uniforme (contredit B30).

### (b3) « me/profile » sur Réglages → aucune action
`Réglages` = `app/me/settings.tsx` : le fichier **ne rend PAS la `PrimaryNavBar`** (seuls les 5 écrans B30 la
montent : accueil, garden, place, reveals, profile) et **ne contient aucun lien vers `me/profile`** (contenu
vérifié : toggle confidentialité, info sécurité, `handleSignOut` `:71` — rien d'autre). Le **seul** retour est le
chevron natif de l'en-tête (`app/_layout.tsx`, `me/settings` `title:'Réglages'`). Donc sur Réglages, **il n'existe
aucune affordance « Toi » / accueil** : l'action attendue (rejoindre `me/profile` via la nav) **n'existe pas** →
« aucune action ». Réglages est un écran **secondaire** hors du périmètre des 5 écrans à barre → **angle mort de B30**
(la barre n'est pas réellement « partout »).

### Racine commune (b)
B30 a posé une barre partagée sur **5** surfaces et un routage `navigate`, **mais** : (b1) Révélations conserve une
**puce d'en-tête « Jardin » historique qui fait `back()`** ; (b2) le mélange **onglets `(tabs)` (sans en-tête)** vs
**écrans root Stack (avec en-tête natif)** rend le « retour » non déterministe ; (b3) les écrans **secondaires**
(Réglages, et par extension me/edit, qr, scan, invite-by-number) **n'ont pas la barre** → pas de retour uniforme.
La promesse B30 « retour uniforme depuis toutes les pages » **n'est pas tenue hors des 5 écrans**.

---

## Synthèse

| # | Symptôme | Cause (fichier:ligne) |
|---|---|---|
| a | reveal `revealed` invisible (Révélations, Santé, Liens partagés) | `mutualScore` jamais dans le store côté B : bootstrap sans score (`b8_b4:130-144`), calcul local impossible (`store:1839,1845`), score serveur non persisté (`relation/[id]:134` vs store) ; écrans indexés sur le score (`garden:84-86,206-208,210-225`) ; Révélations n'affiche pas `revealed` (`reveals/index:53-76`) |
| b1 | puce « Jardin » (Révélations) → Lieux | `reveals/index.tsx:133-138` : `router.back()` déguisé en « Jardin » |
| b2 | retour Lieux → Rechercher puis inactif | hiérarchie mixte : `place`=root Stack + en-tête natif (`_layout:498-508`) ; `garden`=onglet sans en-tête (`(tabs)/_layout:8-9 headerShown:false`) |
| b3 | « me/profile » sur Réglages → rien | `me/settings.tsx` sans `PrimaryNavBar` ni lien profil ; retour = chevron natif seul → angle mort B30 |

_Diagnostic seul. Aucune modification de code de production, aucun correctif, aucun SQL. STOP — attente d'arbitrage._
