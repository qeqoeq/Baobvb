# Claude Code — Baobab

## Projet
Stack : React Native 0.81.5 / Expo SDK 54 / TypeScript 5.9 / React 19 / Supabase / expo-router v6
Store : useSyncExternalStore + AsyncStorage (pas de Zustand, pas de WatermelonDB, pas de NativeWind)

## Règles absolues
- Toujours lire un fichier avant de le modifier
- Ne modifier que les fichiers explicitement demandés
- reactCompiler doit rester OFF — il cause un SIGSEGV Hermes au démarrage (stringPrototypeMatch)
- Jamais de commit ni de push sans demande explicite de Samo

## Moteur de scoring — code réel (lib/evaluation.ts)

Deux modèles distincts, 5 piliers chacun, 22 critères progressifs sub-jacents (lib/progressive-criteria.ts).

**Score privé** (computePrivateLinkScore) — affiché avant reveal :
trust 30%, interactions 25%, affinity 20%, support 15%, sharedNetwork 10%
Trust gates : trust ≤ 1 → cap 39 ; trust = 2 → cap 59 ; trust ≥ 3 → pas de cap.
Tiers privés (getTier) : Distant 0–24 / Forming 25–39 / Active 40–54 / Steady 55–69 / Anchor 70–84 / Rooted 85+

**Score mutuel** (computeMutualRelationshipScore) — affiché après reveal uniquement :
trust 35%, support 20%, interactions 20%, affinity 15%, sharedNetwork 10%
Formule : sqrt(sideScoreA × sideScoreB) − gapPenalty − criticalPenalty + signatureBonus (hardcodé 0, TODO)
Trust gates mutuels : trust ≤ 2 → cap 59 ; trust+support ≤ 2 → cap 64 ; interactions ≤ 2 (les deux) → cap 63.
Tiers mutuels (getMutualTier) : Distant 0–34 / Forming 35–49 / Active 50–64 / Steady 65–78 / Anchor 79–89 / Rooted 90+

Les scores ne sont jamais visibles avant le mutual reveal. Le signatureBonus est intentionnellement 0 en attendant une politique validée.

## Conventions Baobab
- "relationship" remplace "link" partout dans le code et l'UI
- Mutual reveal obligatoire avant tout affichage de score
- Décisions récepteur strictement locales — jamais de retour serveur
- sourceRelationId jamais envoyé au serveur (constraint SQL + exclusion client)

## Règles de travail
- Aucune feature hors du périmètre de la phase courante (Phase 0 — TestFlight)
- Toute idée nouvelle → docs/PARKING.md, pas dans le code
- Jamais de commit ni de push sans demande explicite de Samo
- Phase courante : Phase 0 (TestFlight). Checklist : docs/PHASE-0.md

## Direction V2
Les deux documents de référence produit sont dans docs/ :
- docs/baobab-v2-masterclass.md — GPS relationnel, moteur bayésien, Ask, roadmap 12 semaines
- docs/baobab-moteur-seve-jardin-de-nuit.md — 7 lois Sève, Jardin de Nuit, palette, mignonitude
Phase 0 est le prérequis de tout. Rien du contenu V2 ne se code avant la porte de sortie Phase 0.
