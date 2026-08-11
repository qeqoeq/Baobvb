# Rapport de diagnostic — B36-2 (« ENRACINÉ » au lieu de « Légende »)

> Terrain (OTA `019fece5`, double relaunch) : `relation/[id]`, côté A, la carte de lecture partagée affiche
> **« ENRACINÉ »**. La base porte `tier='Legend'`, `mutual_score=90`. DIAG-B36-1 disait que la carte lit
> `sharedReveal.tier` via `applyEffectiveRevealToRelation` → **partiellement faux** : il manquait l'étape `normalize()`.
>
> **Diagnostic seul — aucune ligne de production modifiée, aucun SQL.** Preuves `fichier:ligne`.

---

## VERDICT

Ce **n'est ni un bug de traduction, ni un problème de `sharedReveal` null/timing, ni un gel de valeur.** C'est une
**divergence de taxonomie serveur↔client**, absorbée volontairement par le client :

- Le **client re-dérive TOUJOURS le tier depuis le score** : `normalizePersistedRevealSnapshotTier` donne
  **priorité au `mutualScore`** et **ignore le `rawTier` serveur** quand un score est présent
  (`lib/persisted-tier-normalization.ts:66-75`).
- `getMutualTier(90)` = **`'Rooted'`** (`lib/evaluation.ts:137`). Le type `Tier` client **ne contient pas
  `'Legend'`** (`lib/evaluation.ts:3`).
- `'Rooted'` → FR **« Enraciné »** (`lib/tier-display.ts:20`) → affiché en capitales « ENRACINÉ ».

Le `'Legend'` serveur est un **label de l'ancienne taxonomie** que `normalize()` a précisément pour rôle
d'écarter. La carte affiche donc **le libellé de tier maximal du client pour un score de 90** — correct côté
client ; c'est le **serveur qui parle encore une autre langue de tiers**.

**Correction de DIAG-B36-1** : la carte lit bien `sharedReveal` (via `getEffectiveRevealSnapshot`), mais à la
ligne `relationship-reveal-precedence.ts:46` la valeur passe par `normalizePersistedRevealSnapshotTier(...)` qui
**remplace `'Legend'` par `getMutualTier(90)='Rooted'`**. DIAG-B36-1 avait sauté cette conversion.

---

## Les trois pistes, tranchées

### (2) `normalize()` et la valeur `Legend` — **C'EST LA CAUSE**
`lib/relationship-reveal-precedence.ts:46` :
```
tier: normalizePersistedRevealSnapshotTier(sharedReveal.tier /* 'Legend' */, sharedReveal.mutual_score /* 90 */)
```
`lib/persisted-tier-normalization.ts:66-74` :
```
if (typeof mutualScore === 'number' && Number.isFinite(mutualScore)) {
  return getMutualTier(mutualScore);   // :69  ← PRIORITÉ 1 : le score gagne, rawTier jamais lu
}
return isCurrentTier(rawTier) ? rawTier : undefined;  // :72 (chemin non emprunté ici)
```
- **Priorité 1** (`:68-70`) : `mutualScore=90` est fini → renvoie `getMutualTier(90)` = **`'Rooted'`**
  (`evaluation.ts:137`). Le `rawTier='Legend'` **n'est jamais consulté**.
- Nuance importante : ce n'est **pas** « Legend non mappé → retombe sur Rooted ». Le `'Rooted'` vient
  **directement de `getMutualTier(90)`**. Même le chemin de repli (`:72`, sans score) **rejetterait** `'Legend'` :
  la whitelist `CURRENT_TIER_VALUES` (`:6-13`) ne contient **pas** `'Legend'` → `isCurrentTier('Legend')=false` →
  renverrait `undefined` (jamais Rooted). Donc dans tous les cas, `'Legend'` est éliminé.

### (1) `sharedReveal` null / non résolu → repli store + `getMutualTier(score)` — **RÉFUTÉ comme cause**
Si `sharedReveal` était null au rendu, `effectiveRelation` retomberait sur le snapshot store et `revealedTier`
serait `null` → l'affichage passerait en **pending/chargement** (`app/relation/[id].tsx:417-419` puis « On amène
ta lecture partagée… » `:950`), **pas** « ENRACINÉ ». Or le terrain montre un tier **défini** (« ENRACINÉ ») =
`getMutualTier(90)` → **le score 90 a bien atteint le client**. Que la valeur vienne de `sharedReveal` (normalisé)
ou du store, **le résultat est identique** : re-dérivation du score = `Rooted`. Ce n'est donc pas un défaut de
null/timing ; la conversion se produit même `sharedReveal` pleinement résolu.

### (3) `frozenMutualScore` / `frozenTier` figent une valeur pré-`sharedReveal` — **RÉFUTÉ**
`app/relation/[id].tsx:393-394` lisent `relationForDisplay.localState.revealSnapshot.mutualScore/.tier`, et
`relationForDisplay = effectiveRelation ?? relation` (`:384`), `effectiveRelation` étant **recalculé à chaque
rendu** depuis le `sharedReveal` courant (`:204-205`, `useMemo([relation, sharedReveal])`). Il n'y a pas de gel :
`frozenMutualTier` **suit** `sharedReveal`. Simplement, ce qu'il suit est déjà normalisé en `'Rooted'` (piste 2).
`revealedTier = frozenMutualTier ?? …` (`:400-401`) → `getTierDisplayLabel(revealedTier)` (`:875`) = « Enraciné ».

---

## Le label « Légende » existe-t-il ? — OUI, mais **structurellement inatteignable**

`lib/tier-display.ts:19-26` mappe bien `Legend: 'Légende'` (ajouté en B27, `bb20f64`). **Ce n'est donc PAS un
oubli de traduction de B28.** Le commentaire du fichier le dit lui-même (`:14-17`) : « Legend is NOT a client
Tier — `getMutualTier(90)` returns 'Rooted' client-side, so no client render path emits it. It is mapped here
**defensively**. » `getTierDisplayLabel` ne reçoit que des `Tier` client (jamais `'Legend'`), donc l'entrée
`Legend: 'Légende'` est **du code défensif jamais atteint** par la carte.

## La divergence de fond : deux taxonomies de tiers

| Bande de score | **Serveur** (`shared_reveal_day3_lifecycle.sql:175-186`) | **Client** (`evaluation.ts:136-142`) |
|---|---|---|
| ≥ 90 | **Legend** | **Rooted** |
| ≥ 79 | Anchor | Anchor |
| ≥ 65 | Vibrant | Steady |
| ≥ 50 | Thrill | Active |
| ≥ 35 | Spark | Forming |
| < 35 | Ghost | Distant |

Le serveur écrit encore l'**ancienne** taxonomie (contrainte CHECK `shared_reveal_day1.sql:21` :
`'Ghost','Spark','Thrill','Vibrant','Anchor','Legend'`). Le client est passé à la taxonomie **actuelle** (Sprint
V.1) et se **protège** des labels legacy via `normalize()` (docstring `persisted-tier-normalization.ts:29-45` :
« harden against legacy … 'Ghost','Spark','Thrill','Vibrant' or 'Legend' »). Mêmes seuils (90/79/65/50/35), **labels
différents** sauf `Anchor`. ⇒ pour 90, serveur=`Legend`, client=`Rooted` = « Enraciné ». Aucune donnée n'est
fausse (le **score** 90 est le tier maximal des deux côtés) — seul le **nom** diffère, et le client impose le sien.

---

## Synthèse & options (aucune tranchée — hors périmètre de ce diagnostic)

| Piste | Verdict |
|---|---|
| (1) sharedReveal null → store/getMutualTier | **Réfutée** : « ENRACINÉ » (tier défini) prouve que le score 90 est arrivé ; null → pending, pas Enraciné |
| (2) `normalize()` / Legend | **CAUSE** : `persisted-tier-normalization.ts:69` re-dérive `getMutualTier(90)='Rooted'` ; `rawTier='Legend'` jamais lu (et hors whitelist) |
| (3) frozen pré-sharedReveal | **Réfutée** : `effectiveRelation` recalculé par `useMemo` (`relation/[id]:204`) ; pas de gel |
| Label « Légende » manquant (B28) ? | **Non** : présent (`tier-display.ts:26`) mais inatteignable par construction |

**Question produit — TRANCHÉE (11/08) : option A retenue.**
- **A — accepter « Enraciné » ✅ RETENUE** : le tier affiché **reste dérivé du score côté client** (`getMutualTier`) ;
  le label serveur legacy `'Legend'` est **écarté par `normalize()` comme prévu**. À 90, l'app affiche
  **« Enraciné »**. Le **score est correct des deux côtés** — seul le **nom** diverge. **Aucun code** : c'est le
  comportement actuel, désormais assumé.
- ~~B — adopter « Légende » client-side~~ (non retenue) : aurait exigé un palier `Legend` client complet + alignement serveur.
- ~~C — hybride~~ (non retenue).

Corollaire (parké, `docs/PARKING.md`) : l'échelle **serveur** est restée en taxonomie **pré-V.1**
(`day3_lifecycle:175-186` : Ghost/Spark/Thrill/Vibrant/Anchor/Legend) — à migrer vers l'échelle client actuelle
**avant toute exposition publique des tiers**. Sans impact tant que le client re-dérive du score (option A).

**STATUT : CLOS (11/08) — option A. Aucun code, le comportement est celui attendu.**

_Diagnostic clos. Aucune modification de code de production, aucun SQL._
