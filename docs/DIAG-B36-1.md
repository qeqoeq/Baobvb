# Rapport de diagnostic — B36-1 (tap sur un nœud du Jardin)

> Symptôme (capture) : depuis l'accueil Jardin, taper le nœud « iPhoneBB » ouvre `through/[id]`
> (« Aucune connexion via iPhoneBB pour l'instant », bouton retour intitulé « (tabs) »). La fiche de relation
> — celle qui porte la carte de lecture partagée — n'est atteignable par aucun geste naturel depuis le Jardin.
>
> **Diagnostic seul — aucune ligne de production modifiée, aucun SQL.** Preuves `fichier:ligne`.
> Décision (déjà tranchée, à appliquer **après GO**) rappelée en fin.

---

## Verdict

Le tap d'un nœud est routé **selon `gatewayAccessState`**. Une relation **`revealed` dont le nœud a une
« puissance de passerelle » ≥ modérée devient une passerelle « open »**, et son tap est **détourné vers
`through/[id]`** — jamais vers la fiche. La fiche (`relation/[id]`) n'est atteinte par un tap **que** pour les
nœuds **non-passerelle**. iPhoneBB est `revealed` + passerelle → `open` → `through`. **Aucun geste** (ni tap, ni
appui long) n'ouvre la fiche pour un tel nœud.

## 1. Handler câblé sur le tap d'un nœud

- **Zone de tap** : `components/ui/EgoGraph.tsx:427-443` — chaque nœud a un `Pressable` avec
  `onPress={() => onNodeTap(member)}` (`:431`) **et** `onLongPress={() => handleLongPress(member, node)}` (`:433`).
- **`onNodeTap` = `handleNodeTap`** (`app/(tabs)/index.tsx:242` le câble ; défini `:170-184`) :
```
if (member.gatewayAccessState === 'open')  router.push(`../through/${member.id}`);   // :173
else if (member.gatewayAccessState === 'locked')  Alert.alert('Pas encore ouvert', …); // :176-179
else  router.push(`../relation/${member.id}`);                                        // :182
```
⇒ **`through/[id]` quand `gatewayAccessState==='open'`** ; la fiche `relation/[id]` seulement dans la branche
`else` (ni open ni locked).

## 2. Pourquoi `through/[id]` plutôt que la fiche (pour iPhoneBB)

`gatewayAccessState` vient de `deriveGatewayAccessState` (`lib/circle-node-state.ts`) :
```
if (band === 'low') return 'none';                       // → branche else → relation/[id]
const isRevealed = revealSnapshot.status === 'revealed';
return isRevealed ? 'open' : 'locked';                    // revealed → 'open' → through/[id]
```
et `band` vient de `deriveGatewayPowerBand` (même fichier) : `sharedNetwork ≥ 5 → 'strong'`, `≥ 3 → 'moderate'`,
sinon `'low'` ; garde de confiance `trust ≤ 2 → 'low'`.

⇒ Un nœud part vers `through` dès que **`revealed` ET `sharedNetwork ≥ 3` ET `trust ≥ 3`**. iPhoneBB
(relation révélée, réseau partagé suffisant) tombe dans `open` → `through/[id]`. **Le tap n'atteint la fiche que
pour les nœuds `band==='low'`** (réseau partagé faible / trust ≤ 2 / non noté) — c'est-à-dire les liens les
**moins** aboutis, l'inverse de l'intention.

`through/[id]` affiche bien le texte de la capture : `emptyText={`Aucune connexion via ${gatewayTitle} pour
l'instant.`}` (`app/through/[id].tsx:160`).

## 3. Existe-t-il un geste distinct censé ouvrir la fiche ? — Non

- **Appui long sur un nœud** (`EgoGraph.tsx:433` → `handleLongPress` `:144-153`) : n'ouvre **pas** la fiche, il
  affiche un **tooltip** éphémère (`setTooltip({ name, label, … })`, label type « via X » ou « … · Passage ouvert »).
- **Tap centre** (`index.tsx:192-195` `handleCenterTap`) → `/me/profile` ; **appui long centre** (`:197-200`) →
  `/me/qr`. Rien vers une fiche de relation.

⇒ Depuis le Jardin, **pour un nœud passerelle il n'existe aucun geste** (tap, long-press, zone) qui mène à la
fiche. Pour un nœud non-passerelle, seul le **tap** y mène.

## 4. Quel écran porte la carte de lecture partagée, et par où on y arrive

**C'est `app/relation/[id].tsx`.** Il rend la carte : `readingCard` (`:865`) avec kicker
`'BAOBAB · LECTURE PARTAGÉE'` (`:872`). **Réconciliation de l'écart signalé dans DIAG-B35** : cet écran rend un
**bouton « ‹ Retour » custom en corps de page** (`:749` `<Text style={styles.backRowText}>‹ Retour</Text>`),
**en plus** du back natif minimal déclaré dans `app/_layout.tsx` (`relation/[id]` : `title:''`,
`headerBackButtonDisplayMode:'minimal'`). DIAG-B35 n'avait mentionné que le back natif ; le « ‹ Retour » de la
capture côté A **est bien celui de `relation/[id]`** (`:749`). Il n'y a pas d'autre écran « carte de lecture ».

**Chemins qui atteignent `relation/[id]` aujourd'hui** (tous sauf le tap d'un nœud passerelle du Jardin) :
- liste **Rechercher** : `app/(tabs)/garden.tsx:508` (`router.push(`/relation/${entry.relation.id}`)`) ;
- **Révélations** (cartes moment) : `app/reveals/index.tsx:96` ;
- **through/[id]** via le **tap au centre** (le nœud passerelle lui-même) : `app/through/[id].tsx:117-119`
  (`router.push(`../relation/${id}`)`) — chemin indirect et non évident ;
- **deep link** notification (`app/_layout.tsx` handlers B25).

→ La fiche existe et est jointe par plusieurs surfaces, **mais pas par le geste le plus naturel** (taper la
personne sur le Jardin), qui pour une relation révélée aboutie file vers `through`.

## Observation secondaire (cosmétique)
Le bouton retour de `through/[id]` intitulé **« (tabs) »** = **libellé natif de la route précédente** (le groupe
`(tabs)`) : `through/[id]` est déclaré `headerTransparent:true, headerTitle:()=>null, headerBackTitle:''`
(`app/_layout.tsx`), et iOS retombe sur le nom de la route précédente faute de titre. Cosmétique, distinct de B36-1.

---

## Synthèse

| Question | Réponse (fichier:ligne) |
|---|---|
| Handler du tap | `EgoGraph.tsx:431` `onPress→onNodeTap` = `handleNodeTap` `index.tsx:170-184` |
| Route du tap | `open→through/[id]` (`:173`), `locked→Alert` (`:176`), sinon `relation/[id]` (`:182`) |
| Pourquoi `through` pour iPhoneBB | `deriveGatewayAccessState` : `revealed` + `band≠low` → `'open'` ; `band` via `deriveGatewayPowerBand` (sharedNetwork≥3, trust≥3) |
| Geste distinct vers la fiche ? | **Non** — long-press = tooltip (`EgoGraph:144-153`) ; centre = `/me/profile` |
| Écran de la carte de lecture | `relation/[id].tsx` (carte `:865-872`, « ‹ Retour » custom `:749`) — c'est bien l'écran de la capture |
| Chemins actuels vers la fiche | garden `:508`, reveals `:96`, through centre `:117-119`, deep link — **jamais** le tap d'un nœud passerelle du Jardin |

## Décision (tranchée — À APPLIQUER APRÈS GO, non faite ici)
**Un tap simple sur un nœud ouvre la fiche de relation de ce lien.** `through/[id]` **reste accessible** mais
**plus comme destination par défaut du tap**. Point d'application prévu : `handleNodeTap` (`index.tsx:170-184`)
— le tap route vers `relation/[id]` pour tous les nœuds ; l'accès à `through` passe à une autre affordance
(à préciser au GO). Aucun code n'est modifié dans ce diagnostic.

_Diagnostic seul. Aucune modification de code de production, aucun SQL. STOP — attente du GO._
