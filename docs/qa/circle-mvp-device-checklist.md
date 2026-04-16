# Circle MVP — Device QA Checklist

Target: iPhone (physical device), dev build.  
Time estimate: ~15 min for a full pass.

---

## Prérequis

1. Build dev installé sur iPhone (`expo start --dev-client` ou `expo run:ios --device`)
2. App en premier plan, onglet **Garden** visible
3. **Reset seed** : appuyer sur **"Reset local dev state"** en bas du Garden  
   → Charge les 7 relations de test (Olivier, Nora, Jean, Sara, Marc, Lena, Paul)
4. Naviguer vers l'onglet **Circle**

---

## États de test injectés par le seed

| ID | Nom     | Reveal status       | Score | Circle status        | Label        | Proximity |
|----|---------|---------------------|-------|----------------------|--------------|-----------|
| 1  | Olivier | waiting_other_side  | 68    | waiting_other_side   | Waiting      | direct    |
| 2  | Nora    | waiting_other_side  | —     | unread               | Unread       | far       |
| 3  | Jean    | waiting_other_side  | —     | —                    | Archived     | far       |
| 4  | Sara    | cooking_reveal      | 68    | cooking              | Preparing    | direct    |
| 5  | Marc    | reveal_ready        | 68    | ready                | Ready        | direct    |
| 6  | Lena    | revealed            | 75    | revealed_stable      | Stable       | direct    |
| 7  | Paul    | revealed            | 0     | revealed_to_nurture  | To nurture   | near      |

---

## Ordre de test recommandé

Tester la **vue List** en premier (plus stable), puis la **vue Map**.  
Valider les invariants de sécurité (pas de tier pré-reveal) à chaque étape.

---

## Tests List view

### L1 — Sections et labels

**Étapes :**
1. Circle > vue List (par défaut)
2. Observer les sections affichées

**Résultat attendu :**
- Section **Inner circle** (direct) : Lena, Marc, Sara, Olivier (ordre variable selon poids de statut)
- Section **Nearby** (near) : Paul
- Section **Distant** (far) : Nora (`Unread`), Jean (`Archived`)
- Aucun des termes `Ghost`, `Spark`, `Thrill`, `Vibrant`, `Anchor`, `Legend` visible **nulle part**

**Bloquant** si un nom de tier apparaît dans l'UI.

---

### L2 — Labels de statut exacts

**Étapes :**
1. Lire le sous-label de chaque carte

**Résultat attendu :**

| Carte   | Label attendu |
|---------|---------------|
| Olivier | `@... · Waiting` |
| Nora    | `@... · Unread` |
| Jean    | `@... · Archived` |
| Sara    | `@... · Preparing` |
| Marc    | `@... · Ready` |
| Lena    | `@... · Stable` |
| Paul    | `@... · To nurture` |

**Bloquant** si un label affiché correspond à un tier.

---

### L3 — Masquage des noms (far)

**Étapes :**
1. Section Distant — observer les noms affichés

**Résultat attendu :**
- Jean et Nora affichés sous forme `J • • •` / `N • • •` (première lettre + points)
- Opacité de la section réduite (~0.38)

**Non bloquant** si les points sont légèrement décalés visuellement.

---

### L4 — Avatar fog (far)

**Étapes :**
1. Section Distant — observer l'avatar de Jean et Nora

**Résultat attendu :**
- Overlay semi-transparent sur l'avatar (fond primaire AA)

---

### L5 — Tap sur une carte

**Étapes :**
1. Tapper sur Lena (section Inner circle)

**Résultat attendu :**
- Navigation vers `relation/6` (détail de Lena)
- Bouton retour fonctionnel

**Bloquant** si le tap ne navigue pas.

---

### L6 — Héros et compteur

**Étapes :**
1. Observer le bloc héros en haut de la liste

**Résultat attendu :**
- `7 people in view` (7 relations au total, archivées comprises)
- Texte : "The closer people are to your inner circle, the clearer they appear."

---

## Tests Map view

### M1 — Bascule List → Map

**Étapes :**
1. Tapper le bouton **Map** (toggle en haut à droite)

**Résultat attendu :**
- Ego graph SVG affiché
- 6 nœuds visibles (Jean est archived → **exclu** du graph)
- Nœud central = initiale de Yasmine (`Y`)
- Lignes reliant chaque nœud au centre

**Bloquant** si Jean apparaît dans le graph.

---

### M2 — Nœud unread en opacité réduite

**Étapes :**
1. Localiser le nœud "Nora" dans le graph

**Résultat attendu :**
- Nœud Nora affiché avec `opacity: 0.55`
- Tous les autres nœuds à `opacity: 1.0`

---

### M3 — Dot de statut

**Étapes :**
1. Observer les dots colorés (top-right de chaque nœud)

**Résultat attendu :**

| Nœud    | Couleur attendue           |
|---------|---------------------------|
| Lena    | Vert sage (mutedSage)      |
| Paul    | Corail doux (softCoral)    |
| Marc    | Teal profond (deepTeal)    |
| Sara    | Gris (text.secondary)      |
| Olivier | Or chaud (warmGold)        |
| Nora    | Or chaud (warmGold)        |

---

### M4 — Tap sur un nœud

**Étapes :**
1. Tapper sur le nœud "Marc"

**Résultat attendu :**
- Navigation vers `relation/5`

**Bloquant** si le tap ne répond pas.

---

### M5 — Long press (tooltip)

**Étapes :**
1. Long-press sur le nœud "Lena"

**Résultat attendu :**
- Tooltip affiché avec `Lena` + `Stable`
- Tap n'importe où → tooltip disparaît

**Non bloquant** si le tooltip déborde très légèrement du bord.

---

### M6 — Empty state

**Étapes :**
1. Garden → archiver toutes les relations actives (ou : créer un compte vierge sans reset)
2. Circle → Map

**Résultat attendu :**
- Nœud central seul (Yasmine)
- Texte : "Add someone from Garden\nto see your circle."

---

## Tests persistance

### P1 — Persistance du mode List/Map

**Étapes :**
1. Circle → basculer en **Map**
2. Quitter l'app (home button, pas force-quit)
3. Rouvrir l'app → aller sur Circle

**Résultat attendu :**
- Vue **Map** restaurée (pas de retour à List)

**Étapes reverse :**
1. Circle → basculer en **List**
2. Même séquence

**Résultat attendu :**
- Vue **List** restaurée

---

## Tests overflow (manuel — non couvert par le seed)

### O1 — Overflow +N dans le graph

**Prérequis :** Ajouter 15+ relations supplémentaires dans Garden (via "Add relation") pour atteindre 21 actives.

**Étapes :**
1. Circle → Map

**Résultat attendu :**
- 20 nœuds visibles + 1 nœud `+N` (N = nombre de relations au-delà de 20)
- Tap sur `+N` → bascule en vue List

**Note :** Ce test est manuel. Il n'est pas couvert par le seed automatique (trop long à préparer).

---

## Invariants de sécurité — vérification finale

À la fin du pass complet, confirmer :

| Invariant | OK |
|-----------|-----|
| Aucun tier (`Ghost`…`Legend`) visible dans Circle List ou Map | ☐ |
| Jean (archived) absent du graph Map | ☐ |
| Nora (unread, no reading) dans section Distant | ☐ |
| Paul (`revealed_to_nurture`) dans section Nearby — PAS Inner circle | ☐ |
| Tous les pré-reveal (Olivier, Nora, Sara, Marc) dans section Inner circle ou Distant — jamais Nearby | ☐ |
| Long-press tooltip n'affiche pas de tier | ☐ |

---

## Classification des bugs

**Bloquant (P0) :**
- Tier visible dans Circle (Ghost, Spark, Thrill, Vibrant, Anchor, Legend)
- Jean visible dans le graph Map
- Tap sur nœud/carte ne navigue pas
- Vue ne change pas après toggle List/Map
- App crash sur Circle

**Non bloquant (P1) :**
- Décalage visuel mineur des tooltips
- Opacité légèrement incorrecte
- Label tronqué à 7 caractères au lieu de 8

**Hors scope (ne pas fixer maintenant) :**
- Disposition des nœuds dans le graph (déterministe mais pas "beau")
- Overflow non couvert par seed automatique
- Animations de transition List/Map

---

## Reset rapide

Pour recommencer un pass depuis zéro :  
Garden → scroller tout en bas → **"Reset local dev state"**

Ce bouton est visible uniquement en build `__DEV__`.
