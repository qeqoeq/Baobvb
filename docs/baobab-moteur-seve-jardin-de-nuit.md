# BAOBAB — LE MOTEUR SÈVE & LE JARDIN DE NUIT
## Couche identité de la V2 : mathématiques de la vérité relationnelle, graphe, couleurs, mignonitude

**Statut : extension de la V2, pas révision.** Ce document approfondit deux couches du cadre existant : le moteur de lecture (spec détaillée de la Phase 2) et l'identité visuelle (chantier parallèle, design sans code avant Phase 2). La roadmap, la doctrine privacy, l'Ask et la Phase 0 sont inchangés. Toute idée née de ce document et hors de ces deux couches → PARKING.md.

---

# PARTIE I — LE MOTEUR SÈVE
## Sept lois pour que le score touche à une vérité de la vie

Principe : chaque loi encode un résultat établi de la science des relations humaines. Ce n'est pas de la décoration mathématique — c'est la recherche (Gottman & Murray, Baumeister, Granovetter, Dunbar, Glicko/TrueSkill pour l'incertitude) transformée en équations. **La science est aussi le storytelling : "le premier moteur relationnel fondé sur 40 ans de recherche" est un pitch, un argument App Store et un article de presse.**

Le moteur produit pour chaque relation un état interne appelé **Sève** (la valeur, μ) et une **Netteté** (la confiance de lecture, inverse de σ). Base V2 conservée : croyance bayésienne par pilier, prior déclaré, preuves comportementales.

### Loi 1 — L'asymétrie du négatif (« bad is stronger than good »)
**Vérité de vie :** la recherche (Baumeister 2001 ; ratio de Gottman ~5:1) montre qu'un événement négatif pèse environ cinq fois un positif dans une relation.
**Équation :** deux gains d'apprentissage distincts.
```
si (v_e − μ) ≥ 0 :  K = K_base
si (v_e − μ) < 0 :  K = 5 × K_base   (plafonné pour éviter le KO en un événement)
```
**Conséquence produit :** le moteur pardonne lentement, comme les humains. Un « not for me » isolé égratigne à peine ; une série pèse vraiment.

### Loi 2 — Le tempo propre (le silence se mesure au rythme de la relation)
**Vérité de vie :** chaque dyade a sa fréquence naturelle. L'ami qu'on voit une fois par an n'est pas plus faible que le collègue quotidien.
**Équation :** le moteur estime, par relation, la distribution des intervalles entre événements (médiane T̂ de la dyade). La croissance d'incertitude est relative à CE tempo :
```
σ ← σ × (1 + κ × max(0, Δt/T̂ − 1))
```
Tant que le silence reste dans le tempo habituel, rien ne bouge. μ ne bouge jamais par le temps (doctrine).
**Conséquence produit :** fin du problème universel des apps sociales qui punissent l'absence. Baobab est la seule app qui connaît *votre* rythme à deux.

### Loi 3 — L'hystérésis (une relation est un chemin, pas un point)
**Vérité de vie :** la confiance monte lentement et chute vite ; l'état présent dépend de l'histoire, pas seulement des signaux actuels. Deux relations aux comportements identiques aujourd'hui mais aux passés différents ne sont pas dans le même état.
**Mécanique :** (a) asymétrie des gains (Loi 1) ; (b) le pilier trust a un K_montée réduit de moitié ; (c) le journal d'événements append-only (déjà dans la V2) rend l'état path-dependent par construction.
**Conséquence produit et moat :** reproduire un état Sève exige de rejouer toute l'histoire privée de la dyade. Aucun concurrent ne peut l'inférer d'un snapshot.

### Loi 4 — Les tiers sont des bassins, pas des lignes
**Vérité de vie :** les relations ne clignotent pas entre états ; changer d'état demande une énergie accumulée (attracteurs des systèmes dynamiques, à la Gottman-Murray).
**Équation :** double seuil + preuve de séjour (trigger de Schmitt).
```
Entrée dans un tier : S ≥ seuil_haut  ET  ≥3 événements concordants
Sortie d'un tier    : S < seuil_haut − 9  (marge d'hystérésis)
```
Seuils actuels conservés comme seuils d'entrée ; la marge de −9 crée le bassin.
**Conséquence produit :** zéro flapping Anchor↔Steady. Un changement de tier devient un ÉVÉNEMENT rare et signifiant — donc un moment produit (voir Partie III).

### Loi 5 — L'incertitude est première (on affiche ce qu'on sait, pas ce qu'on devine)
**Vérité de vie :** l'honnêteté épistémique. Une lecture ancienne n'est pas une lecture basse.
**Mécanique :** V2 inchangée — Netteté = f(σ). Affichage : tier + « lecture solide / lecture ancienne / lecture précoce ». Le chiffre reste privé et non dominant.

### Loi 6 — La force des liens faibles (Granovetter, dans le routeur)
**Vérité de vie :** l'information *nouvelle* circule par les liens faibles ; le *soutien* passe par les liens forts. Le vrai bouche-à-oreille utilise les deux.
**Équation de routage :** le score de route dépend du TYPE de besoin.
```
Besoin de soutien/confiance (santé, argent, émotionnel) :
  R = trustGate × domainTrust × force_du_lien
Besoin de découverte (resto, film, objet, opportunité) :
  R = trustGate × domainTrust × (1 + β × diversité_structurelle)
```
où diversité_structurelle ↑ si le contact partage peu de réseau commun avec moi (le pilier sharedNetwork, inversé, sert enfin à quelque chose d'actif).
**Conséquence produit :** l'Ask ne recommande pas toujours tes meilleurs amis — il recommande la bonne *route*. C'est ce qui le rend troublant de justesse.

### Loi 7 — Le trust gate (inchangé, constitutionnel)
L'affinité ne compense jamais une confiance faible. Caps existants conservés tels quels.

### Paramètres v1 (à calibrer au TestFlight, pas à débattre avant)
| Paramètre | Valeur initiale |
|---|---|
| K_base | 0,15 |
| Ratio négatif | 5× (cap : un événement ne peut bouger μ de plus de 12 pts) |
| K_montée trust | 0,5 × K_base |
| κ (tempo) | 0,25 par période T̂ dépassée |
| Marge d'hystérésis tier | 9 pts |
| Preuves d'entrée tier | 3 événements |
| β (bonus lien faible) | 0,3 |

### Pourquoi c'est difficile à copier — la vérité, pas le fantasme
Les équations ci-dessus sont publiables ; un concurrent peut les lire. Ce qui est incopiable :
1. **L'historique.** L'état est path-dependent (Loi 3) : sans le journal privé d'événements de chaque dyade, impossible de reconstituer les états. Ce journal vit on-device, hors de portée de tout scraping.
2. **Les tempos appris.** T̂ par dyade se construit sur des mois. Un entrant démarre aveugle sur la dimension la plus différenciante.
3. **La doctrine comme barrière structurelle.** Meta/Google ne peuvent pas faire de l'apprentissage 100% on-device sans télémétrie : leur modèle publicitaire l'interdit. Ta contrainte philosophique est leur mur.
4. **La calibration.** Les 7 paramètres se règlent avec des données d'usage réel que seul Baobab accumule.
Le moat, c'est le jardin de données, pas le secret des équations. Dis-le publiquement : ça renforce la marque.

---

# PARTIE II — LE JARDIN DE NUIT
## Le graphe repensé : les cernes du tronc

### Le problème
L'EgoGraph actuel est un graphe nœuds-liens générique : c'est le visuel de toutes les apps réseau depuis 2005, il est illisible à 46 relations (audit), et les nœuds « ? » ressemblent à des bugs.

### Le concept : ton tronc, vu de dessus
On coupe la métaphore réseau. **L'écran Home devient la coupe transversale de TON baobab : des anneaux de croissance concentriques.** La science fournit la structure : les cercles de Dunbar.

```
Centre        : toi (le cœur du tronc)
Anneau 1 (r1) : ~5 places   — les intimes (tiers Anchor/Root)
Anneau 2 (r2) : ~15 places  — les proches (Steady)
Anneau 3 (r3) : ~50 places  — le cercle actif (Active/Forming)
Brume externe : le reste (Distant) — présent, jamais listé comme un stock
```
Le placement dans un anneau découle du tier (donc de la Sève) mais SE LIT comme de la proximité, pas comme un rang. Aucun chiffre, aucun ordre intra-anneau visible (position angulaire stable par hash de l'id — une relation ne « bouge » jamais sans raison).

### La grammaire visuelle (chaque variable du moteur a UN canal)
| Variable moteur | Canal visuel | Rendu |
|---|---|---|
| Tier / Sève | rayon (anneau) + taille de la pousse | graine → bourgeon → feuille → feuille lumineuse |
| Netteté (σ) | **netteté optique** | lecture solide = contours nets ; lecture ancienne = brume/flou doux ; jamais de grisaillement punitif |
| Tempo actif | respiration | micro-oscillation d'échelle (2-3%) au rythme T̂ de la dyade — le jardin respire littéralement aux tempos de tes relations |
| Pass en transit | luciole | particule lumineuse qui traverse les anneaux vers la pousse destinataire |
| Objet reçu en attente | lueur douce au pied de la pousse | pas de badge, pas de compteur (doctrine Home ≠ inbox) |
| Relation « ? » (non nommée) | **graine fermée** + halo d'invitation | microcopy : « Une pousse attend son nom » — le bug devient un rituel |
| Reveal complété | éclosion (animation 1,5 s, haptique) | LE moment signature de l'app |

Interdits : flèches, lignes entre nœuds (le lien est implicite : tout part du centre), rouge d'alerte, compteurs, tri visible par valeur.

### Pourquoi ça crée hype + croissance
1. **Screenshotable et unique.** Personne d'autre n'a « les cernes de ma vie relationnelle ». Chaque jardin est une empreinte digitale visuelle.
2. **La Canopée** (croissance, conforme doctrine) : une fois par an — et à la demande — l'app génère une œuvre abstraite du jardin (anneaux, pousses, brumes, SANS noms, SANS chiffres) exportable en story/fond d'écran. La seule chose qui sort de Baobab est de l'art. Curiosité → installs. K-factor sans trahison.
3. **Le temps rend le produit beau.** Plus tu vis dans l'app, plus ton tronc s'épaissit (un cerne fin s'ajoute chaque année). La rétention devient esthétique.

---

# PARTIE III — COULEURS & MIGNONITUDE

### La palette « Jardin de Nuit » (dark-first, bioluminescente)
Règle constitutionnelle : **la teinte encode la famille/saison, JAMAIS un rang de qualité.** Pas d'échelle rouge→vert (jugement + daltonisme). Toute information est redondée par taille/position/netteté (accessibilité AA).

| Rôle | Couleur | Hex |
|---|---|---|
| Fond (nuit) | bleu-noir profond | #0B0F14 |
| Surface cartes | encre | #131A22 |
| Texte principal | blanc chaud | #F4EFE8 |
| Texte secondaire | brume | #8FA0AE |
| Racines (Anchor/Root) | vert profond + lueur menthe | #2F6B4F / glow #79E0A8 |
| Cercle actif (Steady/Active) | ambre chaud | #F5A25C |
| Pousses (Forming) | lavande | #A78BFA |
| Lointain (Distant) | bleu crépuscule | #5B7C99 |
| Lucioles (passes/asks) | jaune doux | #FFE29A |
| CTA / accent | corail sève | #FF8A5C |
| Brume (basse Netteté) | voile blanc 8→40% + blur progressif | #F4EFE8 α |

Lumière : les éléments importants ÉMETTENT (glow subtil) au lieu d'être surlignés. Ambiance lucioles dans un jardin la nuit — premium, calme, chaleureux. Cohérent avec le header sombre déjà en place.

### Mignonitude — la douceur comme différenciateur
La mignonitude de Baobab n'est pas kawaii-stickers ; c'est de la **tendresse de produit** : tout est vivant, rien ne juge.
- **Micro-interactions :** la pousse frémit quand on la touche ; l'éclosion au reveal ; la luciole qui se pose ; « planté. » quand on garde un lieu reçu.
- **Haptiques composées :** signature vibratoire propre à l'éclosion (déjà des haptics au reveal — les étendre en langage).
- **Lexique (naming system, à utiliser partout — app, site, pitch) :**
  - **Sève** — la valeur interne d'une relation (jamais affichée en chiffre)
  - **Netteté** — la confiance de lecture
  - **Tempo** — le rythme propre de la dyade
  - **Saisons** — les tiers vécus (une relation « en pleine saison », « en hiver de lecture »)
  - **Éclosion** — le reveal mutuel
  - **Luciole** — un pass/ask en transit
  - **La Canopée** — le bilan annuel partageable
- **Ton de la microcopy :** phrases courtes, minuscules, point final. « paul pense à toi. » « une pousse attend son nom. » « lecture ancienne — le tempo reprendra. » Jamais d'exclamation, jamais d'urgence.

---

# PARTIE IV — INTÉGRATION (l'ordre reste le produit)

| Chantier | Quand | Livrable |
|---|---|---|
| Phase 0 — TestFlight | semaine 1, INCHANGÉ | build livré, 15-20 testeurs, visuel actuel |
| Piste parallèle identité (design pur, zéro code) | semaines 1-5 | maquettes Jardin de Nuit (Home, relation, éclosion, Canopée), palette appliquée, prototype Figma/Rive de la respiration |
| Phase 1 — Ask | semaines 2-5, INCHANGÉ | l'Ask ship avec l'UI actuelle |
| Phase 2 — Moteur Sève + Jardin de Nuit | semaines 6-9 | les 7 lois en fonctions pures (~400 lignes testables par-dessus l'existant) + nouveau Home |
| Phase 3 — RGPD + paywall | semaines 10-12, INCHANGÉ | La Canopée peut servir d'argument Plus |

Décision à prendre par Samo maintenant (une seule) : valider le concept « cernes du tronc » comme direction visuelle, pour lancer la piste design en parallèle dès cette semaine.

---

*La Sève ne juge pas. Elle se souvient, à son tempo, avec la netteté qu'on lui donne. — Doctrine du Jardin de Nuit*
