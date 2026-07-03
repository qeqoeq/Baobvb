# BAOBAB V2 — Le GPS relationnel
## Spécification masterclass : du 6/10 au 10/10

**Règle de lecture : ceci est une évolution de Baobab, pas une nouvelle application.** L'audit technique a montré un socle sain (0 erreur TS, 962 tests, flux critique fonctionnel). Tout ce qui suit se construit par-dessus. Le pivot est interdit ; la séquence est obligatoire.

---

## 1. LE CONCEPT EN UNE PHRASE

> Baobab est la mémoire privée de tes relations, qui apprend qui compte pour quoi, et route le bouche-à-oreille dans les deux sens : « ça m'a fait penser à toi » (push) et « qui peut m'aider pour ça ? » (pull).

Le mot GPS n'est pas une métaphore décorative. Un GPS fait trois choses : il **cartographie** (le graphe relationnel), il **positionne** (le moteur de lecture), il **route** (le pass et l'ask). Baobab actuel fait 1 et 2, et la moitié de 3. Le 10/10, c'est compléter le routage.

---

## 2. LE MOTEUR RELATIONNEL V2 — « le plus proche de la réalité »

### 2.1 Le principe fondateur : un score est une croyance, pas une mesure

La réalité d'une relation n'est pas observable directement. Ce qu'on observe : des déclarations (ce que Samo *pense* de sa relation avec Paul) et des comportements (ce qui se *passe* entre eux). L'état réel est une variable cachée. Le seul cadre mathématique honnête est donc l'inférence bayésienne : on maintient une **croyance avec incertitude**, mise à jour par les preuves.

C'est exactement ta demande « figé et dynamique » formalisée :
- **Figé** = le prior. L'évaluation déclarée (5 piliers, 22 critères progressifs — déjà codés).
- **Dynamique** = la vraisemblance. Le flux d'événements d'interaction.
- **Fusion** = le posterior. Le score affiché.

### 2.2 État d'une relation (par pilier)

Pour chaque pilier p ∈ {trust, interactions, affinity, support, sharedNetwork} :

```
état_p = { μ_p : valeur crue (0–100),  σ_p : incertitude }
```

**Initialisation (le figé) :**
- L'évaluation déclarée fixe μ_p.
- σ_p démarre haut et baisse avec le nombre de critères progressifs répondus. Une lecture à 4 critères = croyance floue ; à 22 critères = croyance nette. (Réutilise tel quel ton système existant de sub-signals.)

**Mise à jour (le dynamique) — filtre de Kalman simplifié :**

Chaque événement e porte une valeur observée v_e, un poids w_e, et des tags de piliers/domaines.

```
gain K = σ_p² / (σ_p² + bruit_e)
μ_p ← μ_p + K × w_e × (v_e − μ_p)
σ_p ← σ_p × (1 − K)          // chaque preuve affine la croyance
```

**Décroissance temporelle — LA règle qui réconcilie tout :**

```
à chaque période sans événement :  σ_p ← σ_p × λ   (λ > 1)
μ_p ne bouge JAMAIS par le temps.
```

Le silence n'abaisse jamais une relation (ta doctrine, intacte). Il élargit l'incertitude. Une relation forte sans nouvelles depuis 18 mois reste « Anchor », affichée « Anchor · lecture ancienne ». Aucune app au monde ne modélise ça. C'est ton avantage philosophique transformé en avantage mathématique.

### 2.3 Le journal d'événements (event sourcing local)

Nouvelle primitive : un log append-only local `relationship_events`, source unique du dynamique.

Événements v1 (tous déjà produits par l'app actuelle ou triviaux à émettre) :

| Événement | Piliers affectés | Poids |
|---|---|---|
| pass envoyé vers X | interactions ↑ | faible |
| objet reçu de X gardé (local) | trust_domaine ↑, affinity ↑ | fort |
| objet reçu de X « not for me » (local) | trust_domaine ↓ légèrement | faible |
| ask répondu par X | support ↑↑, trust_domaine ↑ | très fort |
| ask de X auquel j'ai répondu | interactions ↑, support ↑ | moyen |
| reveal mutuel complété | tous σ ↓ (preuve d'engagement) | fort |
| check-in manuel « on s'est vus » (optionnel, 1 tap) | interactions ↑ | moyen |
| réévaluation déclarée | reset partiel du prior | — |

Règles conservées en dur : **trust gate** (l'affinité ne compense jamais une confiance faible — caps existants inchangés), score numérique privé, forme visible = signature qualitative + tier + **badge de confiance** (« lecture solide » / « lecture ancienne » / « lecture précoce »).

### 2.4 Score composite et affichage

```
S = Σ w_p × μ_p   avec  w = {trust .35, support .20, interactions .20, affinity .15, network .10}
C = f(σ moyen)    // confiance globale de la lecture
```

Affiché : tier (Distant→Root, seuils existants) + badge de confiance. Jamais le chiffre en dominant. Le `signatureBonus` (TODO ligne 121, hardcodé à 0) devient inutile dans ce modèle — le supprimer, pas l'implémenter.

### 2.5 Le vecteur de confiance par domaine — la clé du routage

Un score global ne route rien : je fais confiance à Paul pour les restos, pas pour les finances. Chaque relation porte donc, en plus des piliers, un vecteur appris localement :

```
domainTrust = { food: μ±σ, culture: μ±σ, services: μ±σ, pro: μ±σ, lieux: μ±σ, ... }
```

Alimenté exclusivement par les événements locaux (kept / not_for_me / ask répondu, tagués par le domaine de l'objet). Les « worlds » déjà codés fournissent la taxonomie des domaines. Ce vecteur ne quitte **jamais** le device.

---

## 3. LE GPS COMPLET — push + pull + apprentissage

### 3.1 Push (existe) : le Pass

« Ça m'a fait penser à toi. » Codé, testé, livré. Une seule amélioration : au moment de choisir à qui passer, l'app pré-trie les relations par pertinence (domainTrust du domaine de l'objet × affinité de goût). Le geste reste 100% humain, l'algo ne fait que trier la liste.

### 3.2 Pull (à construire) : l'Ask — le vrai déblocage produit

**Flux :**
1. Samo formule un besoin : « Je cherche un bon ostéopathe vers Melun » + domaine (services).
2. L'app calcule pour chaque relation révélée : `R = domainTrust_services × trustGate × fraîcheur_de_preuve` et **suggère** les 3 meilleures routes. Samo choisit manuellement (v1 : l'humain décide toujours, l'algo propose).
3. Les destinataires reçoivent : « Samo cherche : un bon ostéo vers Melun ». Deux options : répondre en passant un objet, ou ignorer.
4. **Ignorer est invisible.** Pas de vu, pas de relance, pas de compteur. Cohérence totale avec la doctrine.
5. La réponse arrive comme un pass normal. Si Samo la garde → l'événement `ask_answered + kept` renforce localement la route de ce contact.

**Pourquoi c'est LE déblocage :** le push dépend d'un moment aléatoire (« je pense à toi »). Le pull naît d'un **besoin**, et les besoins sont fréquents et actionnables. C'est le pull qui répond à ta question de fréquence d'usage — et c'est le pull qui fait de Baobab un GPS (on demande un chemin à un GPS).

**Serveur (delta minimal, même moule que pass_deliveries) :**
```
table ask_deliveries : id, created_at, from_user_id, to_user_id,
                       canonical_relation_id, domain, ask_text (≤120 chars)
RLS receiver-only. Clés interdites identiques (pas de seen/answered/ignored).
RPC create_ask_delivery (anti-spam 3/24h), fetch_ask_deliveries.
```

### 3.3 L'apprentissage inversé : comment l'algo apprend sans trahir la privacy

Le paradoxe apparent : « les décisions du récepteur ne remontent jamais » vs « l'algorithme doit apprendre des résultats ». Résolution :

> **C'est le récepteur qui apprend, pas l'émetteur.** Mon device apprend que les recos de Paul marchent pour moi → il route mes futurs asks vers Paul et remonte les objets de Paul dans mon fil. Paul ne sait rien. Personne n'est surveillé. C'est la structure exacte du bouche-à-oreille réel : je sais à qui demander.

Conséquence architecturale : **tout le machine learning est on-device**, sur le journal d'événements local. Le serveur reste un facteur postal aveugle. C'est ton moat : Google/Meta ne peuvent structurellement pas construire ça, leur modèle économique l'interdit.

### 3.4 Le graphe à deux sauts (v3, pas avant)

« Paul connaît quelqu'un qui pourrait t'aider » — routage à travers un intermédiaire, avec consentement explicite de l'intermédiaire à chaque hop. C'est la vision terminale du GPS humain. À ne pas toucher avant que le 1-hop ait prouvé sa rétention.

---

## 4. PRIVACY & RGPD — la doctrine devient un produit

Inchangé et non négociable : pas de score visible avant reveal, pas de read receipts, décisions récepteur locales, sourceRelationId jamais serveur, silence non punitif.

À construire (conformité, pas philosophie) :
- Suppression de compte : cascade serveur (reveals, invites, deliveries, asks, profils) + purge locale. Une RPC + un écran.
- Export : dump JSON local (l'architecture local-first rend ça trivial — c'est un argument marketing).
- Contacts non-utilisateurs : une relation seed/manuelle = donnée personnelle de l'utilisateur sur un tiers, stockée uniquement on-device → régime d'exemption domestique, à documenter dans la politique de confidentialité. Rien de ce tiers ne va serveur avant son propre consentement (le claim d'invite). Cette phrase est ta défense RGPD et ton pitch.
- Mesure : compteurs agrégés anonymes opt-in (nb de passes/asks/keeps par semaine, k-anonymisés, jamais de contenu, jamais de graphe). Sans ça tu pilotes à l'aveugle ; avec ça tu restes irréprochable.

---

## 5. ARCHITECTURE — delta sur l'existant, pas refonte

| Couche | Existant (validé par audit) | Delta V2 |
|---|---|---|
| Client | Expo 54, RN 0.81, store custom 2869 lignes | Découper le store en 4 modules (relations / places / deliveries / events). Ajouter `eventsStore` append-only |
| Scoring | 5 piliers + 22 critères, fonctions pures testées | Ajouter couche bayésienne (μ, σ) par-dessus — les fonctions actuelles deviennent le calcul du prior. ~300 lignes pures, testables |
| Routage | néant | `lib/routing.ts` : domainTrust + suggestion top-3. Pur, on-device |
| Serveur | 6 tables, 14 RPCs, RLS propre | +1 table ask_deliveries, +2 RPCs, fix auth-UIDs (RPC dédiée), deploy day11 |
| Sync | one-shot au bootstrap | v2 : refetch on foreground (AppState listener). Realtime = plus tard |
| Web | baobab-web Next.js décidé | inchangé |

Aucune techno nouvelle. Pas de WatermelonDB, pas de refonte. Le risque R3 (store monolithique) se traite par le découpage ci-dessus.

---

## 6. BUSINESS MODEL

Gratuit (le réseau doit croître sans friction) : relations illimitées, passes illimités, 3 asks/mois, lecture standard.

**Baobab Plus — 4,99 €/mois ou 39 €/an :**
- Asks illimités + routage suggéré complet
- Lecture profonde illimitée (22 critères + historique d'évolution de chaque relation)
- Insights privés : « tes relations qui s'affaiblissent en confiance de lecture », bilan relationnel annuel
- Export enrichi + multi-device chiffré (plus tard)

Jamais : pub, vente de données, boost de visibilité. L'absence de ces revenus EST le produit.

Sanity check : 2 000 €/mois (ton objectif palier) = ~450 abonnés. Une communauté de niche y suffit. La licorne, elle, se joue sur le pull + le réseau, pas sur le pricing.

---

## 7. MÉTRIQUES — voler aux instruments

- **North Star : moments routés / utilisateur actif / semaine** (passes envoyés + asks envoyés + réponses à ask). C'est la mesure directe du bouche-à-oreille reproduit.
- Activation : 1er pass OU 1er ask dans les 7 jours post-reveal d'au moins 1 relation.
- Rétention : % d'utilisateurs avec ≥1 moment routé en semaine 4.
- Viralité : invites envoyées / utilisateur, taux de claim, taux de reveal complété.
- Qualité de routage (local, agrégé anonyme) : taux de keep sur objets reçus via ask.

Seuils de vie ou de mort au TestFlight (20 testeurs, 4 semaines) : ≥40% activation, ≥25% rétention S4, ≥1,5 moment routé/actif/semaine. En dessous → le problème est la fréquence du geste, et aucune feature ne le corrige.

---

## 8. ROADMAP SÉQUENCÉE — l'ordre est le produit

**Phase 0 — Ship (semaine 1)** : X.88 seeds, deploy day11, fix auth-UIDs, build EAS, TestFlight, 15-20 testeurs. *Déjà cadré dans l'audit. Rien d'autre ne commence avant.*

**Phase 1 — L'Ask (semaines 2-5)** : table + RPCs ask_deliveries, écran « J'ai besoin de… », réception + réponse par pass, journal d'événements local branché sur les actions existantes. Mesure agrégée opt-in.

**Phase 2 — Le moteur vivant (semaines 6-9)** : couche bayésienne (μ, σ), badge de confiance dans l'UI, décroissance d'incertitude, domainTrust + tri suggéré des routes. Découpage du store.

**Phase 3 — Conformité + monétisation (semaines 10-12)** : suppression/export RGPD, paywall Baobab Plus, App Store public.

**Phase 4 — Réseau (au-delà, conditionné aux seuils)** : refetch temps réel, 2-hops avec consentement, multi-device E2E.

Discipline : une phase ne commence que si la précédente est shippée ET mesurée. Douze semaines sans pivot.

---

## 9. CE QUI PEUT ENCORE TUER LE PROJET (honnêteté finale)

1. **La fréquence du geste.** Le pull la multiplie mais ne la garantit pas. Seul le TestFlight tranche. C'est LE pari.
2. **Le coût de l'évaluation.** 22 critères par relation, c'est un investissement que seuls les convaincus feront. Le prior doit pouvoir être posé en 30 secondes (4 critères) et s'affiner ensuite — l'architecture μ/σ le permet nativement.
3. **Le cold start du routage.** Avant 5-6 relations révélées, l'ask a peu de routes. Mitigation : l'ask v1 marche aussi vers les relations locales non révélées (livraison = simple partage iOS), et devient magique après reveal.
4. **Toi.** Le design ci-dessus est cohérent parce qu'il est séquencé. Chaque idée nouvelle pendant les 12 semaines va dans un fichier PARKING.md, pas dans le code.

---

*Un GPS ne juge pas les routes. Il sait juste, avec une confiance croissante, lesquelles mènent quelque part. — Doctrine Baobab V2*
