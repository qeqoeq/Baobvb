# Smoke Test — Baobab Phase 0

TestFlight build. Deux iPhones physiques requis.
- **iPhone A** : 17 Pro Max (compte Samo / mpksamo@gmail.com)
- **iPhone B** : 15 Pro (compte testeur B)

Règles :
- Tester sur install fraîche (app supprimée, pas de restauration iCloud de données)
- Toutes les étapes dans l'ordre — certains états dépendent des étapes précédentes
- Marquer [PASS] / [FAIL + description courte] pour chaque case

---

## Bloc 1 — Install & Auth (iPhone A)

- [ ] **S01** — L'app s'installe et démarre sans crash
- [ ] **S02** — L'écran d'accueil ne contient AUCUNE donnée seed (pas de "Lena", "Camille", etc.)
- [ ] **S03** — Apple Sign-In fonctionne (bouton → Face ID/Touch ID → session active)
- [ ] **S04** — Setup profil : prénom + handle (@xxx) acceptés, profil enregistré
- [ ] **S05** — Home affiché après setup : vide ou avec le bon message d'état vide

## Bloc 2 — Relation manuelle (iPhone A)

- [ ] **S06** — "Add relation" → formulaire ouvert
- [ ] **S07** — Relation "Test B" créée manuellement (relation locale, sans invite)
- [ ] **S08** — La relation apparaît dans Home avec le bon score privé (Distant/Forming)
- [ ] **S09** — Tap sur la relation → écran relation/[id] chargé sans crash
- [ ] **S10** — Lecture privée : au moins un critère coché → score évolue

## Bloc 3 — Invite QR (iPhone A → iPhone B)

- [ ] **S11** — iPhone A : "Invite" → QR code affiché
- [ ] **S12** — iPhone A : lien d'invite copié (fallback texte si scan impossible)

## Bloc 4 — Install & Claim (iPhone B)

- [ ] **S13** — L'app s'installe et démarre sur iPhone B sans crash
- [ ] **S14** — AUCUNE donnée seed visible sur iPhone B
- [ ] **S15** — Apple Sign-In iPhone B → session active (compte différent de A)
- [ ] **S16** — Setup profil B : prénom + handle acceptés
- [ ] **S17** — Scan du QR de A (ou paste du lien) → écran de claim affiché
- [ ] **S18** — "Your name" affiché (snapshot inviteur depuis relationship_invites) ✓
- [ ] **S19** — Claim accepté → relation apparaît dans Home de B
- [ ] **S20** — Relation apparaît dans Home de A également (counterpart lié)

## Bloc 5 — Reveal complet (A + B)

- [ ] **S21** — iPhone A : lecture privée sur la relation avec B sauvegardée (critères cochés)
- [ ] **S22** — iPhone B : lecture privée sur la relation avec A sauvegardée
- [ ] **S23** — Les deux côtés en état "cooking" (15 s) après soumission des deux lectures
- [ ] **S24** — État "ready" atteint après 15 s — bouton reveal actif sur les deux
- [ ] **S25** — **Push reveal-ready reçu sur iPhone A** (app fermée ou background) — titre "Your link is ready"
- [ ] **S26** — **Push reveal-ready reçu sur iPhone B** — même titre
- [ ] **S27** — iPhone A : tap "Reveal" → score mutuel + tier affichés
- [ ] **S28** — iPhone B : tap "Reveal" → score mutuel + tier affichés
- [ ] **S29** — Les deux scores mutuels sont cohérents (même valeur)
- [ ] **S30** — counterpartPublicProfileId non-null des deux côtés (visible dans le profil affiché)

## Bloc 6 — Pass delivery (Places)

- [ ] **S31** — iPhone A : section Places → "Pass a place" disponible
- [ ] **S32** — iPhone A : lieu "Test Luciole" passé à B
- [ ] **S33** — **Push "Someone thought of you 🌱" reçu sur iPhone B app FERMÉE** — titre "Baobab"
- [ ] **S34** — iPhone B : tap notification → app ouvre, lieu visible dans Home ou détail relation
- [ ] **S35** — iPhone B : "Keep" sur le lieu → marqué kept, pas de crash
- [ ] **S36** — iPhone A : AUCUN retour visible sur le status du pass (sender n'a pas accès)

## Bloc 7 — Anti-spam pass delivery

- [ ] **S37** — iPhone A tente de passer le même lieu ("Test Luciole", même objectId) → erreur "already exists" (pas de doublon)
- [ ] **S38** — iPhone A passe 2 lieux supplémentaires différents → total 3/3 dans la fenêtre 24h
- [ ] **S39** — iPhone A tente un 4e lieu → erreur "limit reached" (anti-spam 3/24h)

## Bloc 8 — Cold start & persistance

- [ ] **S40** — Fermer + rouvrir l'app sur iPhone A : Home rechargé, relation visible, score intact
- [ ] **S41** — Fermer + rouvrir l'app sur iPhone B : Home rechargé, relation visible, lieu passé toujours visible
- [ ] **S42** — iPhone A cold start depuis push reveal-ready (taper la notif, app fermée) → navigue directement vers la relation concernée
- [ ] **S43** — iPhone B cold start depuis push pass delivery (taper la notif, app fermée) → lieu visible dès l'ouverture

## Bloc 9 — Robustesse réseau

- [ ] **S44** — iPhone A : mode avion → ouvrir l'app → pas de crash (erreur UI ou état vide acceptable)
- [ ] **S45** — Retour réseau → données rechargées sans redémarrage nécessaire

---

## Résultats à rapporter

Pour chaque [FAIL] : décrire le comportement observé, l'écran concerné, et si reproductible.

Triage :
- **Bloquant TestFlight** : crash, auth non fonctionnel, reveal impossible, données seed visibles en prod
- **Non-bloquant** → PARKING.md ou Phase 1

---

*Rédigé pour Phase 0 — build `com.samo.baobab` 1.0.0 (buildNumber auto-incrémenté depuis 24)*
