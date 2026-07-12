# PASS-SIGNAL-SPEC — le picker vivant & le pass comme signal

> Spécification produit. **Aucune implémentation ici.** Décision Samo — 2026-07-12.
> Références : `docs/baobab-v2-masterclass.md` (§2 moteur bayésien, §2.5 domainTrust,
> §3.1 Pass, §3.3 apprentissage inversé), `lib/evaluation.ts` (5 piliers + trust gates),
> `lib/progressive-criteria.ts` (22 critères / sub-signals → σ), `CLAUDE.md` (doctrine).
> État actuel : pass push livré (`createPassDelivery`, `pass_deliveries`, `PlacePassSheet`,
> éligibilité B6 = revealed + canonicalRelationId + !archived, B22 re-sync, B24 nom cascade).

---

## 1. PRINCIPE

Un pass n'est pas un partage, c'est **un acte de pensée dirigée** : « j'ai pensé à toi, ici ».
C'est un **signal relationnel de premier ordre** — plus rare et plus sincère qu'un like,
parce qu'il coûte une intention et nomme une personne.

La boucle vivante :

```
   scores privés ──▶ suggestions du picker ──▶ le geste de pass
        ▲                                              │
        │                                              ▼
   moteur (évidence) ◀────────── le pass devient une preuve locale
```

- **Lecture** : les scores/croyances trient le picker → le bon nom remonte en 3 secondes.
- **Écriture** : le pass émis (et, côté destinataire, ce qu'il en fait) devient une **évidence**
  qui affine les croyances — qui à leur tour améliorent le tri.

Le geste reste **100 % humain**. L'algorithme ne choisit jamais à la place de l'utilisateur ;
il ordonne une liste et apprend d'un acte déjà posé.

---

## 2. PICKER DYNAMIQUE (lecture)

**Objectif produit** : le geste « Who came to mind? » doit rester un **réflexe de 3 secondes
même à 100+ contacts**. Aujourd'hui le picker liste les relations éligibles triées par
`revealedAt` (`place/[id].tsx` eligibleRelations) — suffisant à 3 relations, ingérable à 100.

### 2.1 Trois zones, une intention

1. **Suggestions (3–5 en tête)** — les candidats les plus pertinents pour *ce lieu*, calculés.
2. **Recherche instantanée** — champ de filtre par nom (cascade B24) dès la frappe.
3. **Liste complète** — toutes les relations éligibles (B6), tri stable.

### 2.2 Signal de pertinence (ranking des suggestions)

Score de pertinence `rel × lieu`, combinaison locale de :

| Facteur | Source | Intuition |
|---|---|---|
| **Affinité de domaine** | `domainTrust[domaine(lieu)]` (V2) ; en attendant : `worldFit`/catégorie du lieu × piliers de la relation | un **restaurant** remonte ceux avec qui la dimension **partage/affinity** est forte ; un lieu « creative » remonte les mondes créatifs |
| **Récence d'interaction** | `revealedAt`, dernier pass, futur `relationship_events` | qui est « chaud » en ce moment |
| **Score privé** | `computePrivateLinkScore` (tier, jamais le chiffre) | pondération douce, jamais un filtre |
| **Anti-répétition** | historique de pass récents vers X | éviter de re-suggérer toujours la même personne (diversité) |

Le tri est une **combinaison pondérée**, pas un seuil : personne n'est jamais *exclu* des
suggestions par un score bas — le score ne fait que **remonter** les plus pertinents. La liste
complète reste toujours accessible sous les suggestions (règle B23/B19/B22 : rien ne disparaît).

### 2.3 Catégorie du lieu → dimension

La taxonomie des « worlds » déjà codée fournit le pont lieu→dimension (masterclass §2.5).
Exemple : `restaurant`/`food` → pondère l'affinité « partage » (shareSafe, driverDimensions) ;
`spot`/`calm` → pondère les relations « deep_talk ». Mapping à figer dans une table pure testable.

---

## 3. SIGNAL RETOUR (écriture)

Le pass devient une **entrée du journal d'événements local** `relationship_events`
(masterclass §2.3), consommée par la couche bayésienne (μ, σ) via le filtre de Kalman simplifié
(§2.2 : `μ_p ← μ_p + K·w_e·(v_e − μ_p)`, `σ_p ← σ_p·(1−K)`).

### 3.1 Dimensions informées

- **Émettre un pass vers X** informe principalement **interactions** (↑), faiblement **affinity**
  dans le **domaine du lieu** (`domainTrust[food]`, etc.). Jamais **trust** directement (le trust
  se déclare, ne se déduit pas d'un geste léger — trust gate intact).
- **Côté destinataire** (voir §3.3, doctrine) : recevoir/garder informe **trust_domaine** et
  **affinity** (masterclass : « objet reçu de X gardé (local) → trust_domaine ↑, affinity ↑, fort »).

### 3.2 Trois intensités — et OÙ vit chaque preuve

| Intensité | Événement | Force | **Sur quel device** | Pilier(s) |
|---|---|---|---|---|
| **Faible** | Pass **émis** vers X | `w` faible | **émetteur** | interactions ↑ (+ affinity domaine, très léger) |
| **Moyen** | Pass **ouvert** par le destinataire | `w` moyen | **destinataire** (croyance du destinataire sur l'émetteur) | interactions ↑ |
| **Fort** | Lieu **gardé** (`kept`) par le destinataire | `w` fort, **réciproque** | **destinataire** | trust_domaine ↑, affinity ↑ |

⚠️ **Point de doctrine à ne pas escamoter** : « ouvert » et « gardé » sont des **décisions
récepteur** — or *« Décisions récepteur strictement locales — jamais de retour serveur »*
(`CLAUDE.md`). Donc **par défaut, ces preuves n'informent QUE le moteur du destinataire**
(sa croyance sur l'émetteur), **jamais celui de l'émetteur**. L'émetteur ne « gagne » pas de
score parce que l'autre a gardé son lieu — il ne le sait même pas. La réciprocité est **vécue
symétriquement des deux côtés en local**, jamais transmise.

→ Faire remonter « ouvert/gardé » vers l'émetteur exigerait un **signal opt-in agrégé et
anonymisé** (masterclass §3.3 « apprentissage inversé sans trahir la privacy ») — hors scope
par défaut, décision produit explicite requise, jamais implicite.

### 3.3 Résumé de la propagation

- **Toujours local, jamais transmis** : émission (émetteur), ouverture/kept/not_for_me (destinataire).
- **Le mutuel** reste hors de cette boucle (voir garde-fou (a)).

---

## 4. GARDE-FOUS NON NÉGOCIABLES

**(a) Jamais le score mutuel.** Le pass est **évidence privée uniquement**. Le score mutuel
(`computeMutualRelationshipScore`) **n'existe que par reveal bilatéral** et n'est jamais touché
par un pass, dans aucun sens. Un pass ne peut ni créer, ni avancer, ni modifier un reveal mutuel.
La boucle vit **entièrement dans les croyances privées** de chaque device.

**(b) Anti-gaming.**
- **Plafond par relation par période** : au-delà de N pass vers X sur une fenêtre, l'évidence
  supplémentaire est ignorée (le geste reste possible ; il n'ajoute plus de poids).
- **Rendements décroissants** : le k-ième pass vers X pèse moins que le premier (log/saturation),
  pour qu'aucun spam ne fabrique une croyance.
- **Décroissance temporelle** : cohérente avec la loi maîtresse (masterclass §2.2) — le temps
  **n'abaisse jamais μ**, il **élargit σ** ; une évidence de pass ancienne perd en netteté, pas
  en valeur déclarée.

**(c) Transparence doctrine — le ranking est implicite, jamais exposé.**
- **Aucun score, chiffre, tier ou barre n'est affiché dans le picker** (D1 + B5 restent la loi).
- Les suggestions apparaissent **sans justification chiffrée** (« pourquoi lui ? » n'affiche pas
  « affinité 0.8 »). L'ordre parle ; la mécanique reste invisible.
- Aucune suggestion n'est présentée comme un jugement sur la personne — c'est une commodité de
  saisie, pas un classement social.

---

## 5. PHASAGE

### 5.1 Faisable **maintenant** (local-first, sans moteur V2)

- Picker à **3 zones** (suggestions / recherche / liste) — pur JS, OTA-able.
- **Ranking simple** des suggestions : **récence** (`revealedAt` / dernier pass) + **catégorie du
  lieu → world/dimension** (table de mapping pure testable) + pondération douce par tier privé
  existant. Aucune nouvelle donnée serveur, aucune couche bayésienne.
- **Recherche instantanée** par nom cascade (B24).
- **Anti-répétition** basé sur l'historique de pass local existant (`passedObjects`).
- Respecte déjà tous les garde-fous (aucun score affiché, aucun effet mutuel).

### 5.2 Attend le **moteur V2** (couche bayésienne)

- Journal `relationship_events` (append-only local) comme source unique du dynamique.
- Couche (μ, σ) + filtre de Kalman + décroissance σ (masterclass §2, roadmap Phase 2).
- **`domainTrust`** appris localement (kept / not_for_me / ask), taxonomie = worlds.
- Ranking du picker passant de « récence + catégorie » à **`domainTrust[domaine] × affinité`**.
- Anti-gaming formalisé (plafonds, rendements décroissants) dans la couche évidence.
- Éventuel signal opt-in agrégé pour l'apprentissage inversé (§3.3) — décision séparée.

**Ligne de partage** : la Phase 1 rend le geste **utilisable à l'échelle** (tri utile) ;
la Phase 2 le rend **vivant** (le geste nourrit et est nourri par la croyance). Aucune des deux
n'expose de score. Phase 0 (TestFlight) reste le prérequis : rien de ceci ne se code avant sa porte de sortie.
