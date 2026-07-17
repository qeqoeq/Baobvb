# PARKING.md — Idées hors phase courante

Toute idée nouvelle non couverte par la phase en cours atterrit ici. Elle n'est ni rejetée ni oubliée.
Révision à chaque porte de sortie de phase.

| Date | Idée | Origine | Statut |
|---|---|---|---|
| 2026-07-03 | AASA / Universal Links (scheme baobab:// suffit pour TestFlight) | P0.5 audit | En attente Phase 1 |
| 2026-07-08 | Réintroduire expo-font (plugin app.json) quand les fonts custom du chantier design bible Jardin de Nuit seront implémentées | B4 triage | En attente chantier design |
| 2026-07-08 | `addPassObject` écrit le local et confirme l'UI avant le guard `createPassDelivery` — tout futur chemin d'envoi hors picker doit re-vérifier `canonicalRelationId` (cf. B6 : sans cette vérification, l'UI confirme un envoi que le counterpart ne reçoit jamais) | B6 triage | À vérifier sur tout nouveau point d'envoi de pass |
| 2026-07-09 | QR : montrer son QR et scanner en un geste (one-tap/swipe) — UX Phase 1 | Smoke test build 28 | En attente Phase 1 |
| 2026-07-10 | Scan : pré-remplir le champ nom depuis le `display_name` résolu (`lookupPublicProfile`) au lieu de forcer l'utilisateur à retaper (`app/relation/add.tsx:343` détecte `found` mais n'utilise pas le nom) | D-A(3) / B17 triage | En attente Phase 1 |
| 2026-07-12 | Picker dynamique + pass-as-signal — spec `docs/PASS-SIGNAL-SPEC.md` (boucle scores → suggestions → pass → évidence → scores). Phase 1 : ranking récence+catégorie (local) ; Phase 2 : évidence bayésienne. Décision Samo 12/07 | Décision produit | En attente Phase 1 |
| 2026-07-17 | Si rejet beta review ou pour la review App Store complète : implémenter un accès reviewer robuste (trigger test-email documenté ou endpoint de démo) — ne pas improviser sur `auth.users` en prod | Beta review kit (Test OTP email inexistant) | En attente review App Store |
