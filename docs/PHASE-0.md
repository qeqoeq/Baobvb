# PHASE 0 — Checklist TestFlight

Objectif : build TestFlight propre installable par 15-20 testeurs.
Porte de sortie : build installé chez ≥15 testeurs, smoke test 100% vert, zéro donnée seed en production, day11 vérifié non-null, plus aucun auth UID côté client.

---

## P0.1 — Docs, CLAUDE.md, PARKING.md
- [x] docs/baobab-v2-masterclass.md présent
- [x] docs/baobab-moteur-seve-jardin-de-nuit.md présent
- [x] CLAUDE.md réécrit : scoring réel documenté, "12 dimensions" supprimé, section V2 + règles de travail
- [x] docs/PARKING.md créé avec template
- [x] docs/PHASE-0.md créé (ce fichier)

## P0.2 — X.88 : seeds dev hors production (BLOQUANT)
- [ ] Marquage des données seed analysé et documenté
- [ ] Gating production implémenté : aucun seeding en non-dev
- [ ] Purge chirurgicale au boot non-dev : seed purgé, données réelles intactes
- [ ] Tests vitest : purge sélective, idempotence, aucun seeding hors dev
- [ ] tsc 0 erreur, vitest 100% vert
- [ ] Commit : "fix(store): gate dev seeds out of production builds with surgical purge (X.88)"

## P0.3 — Day11 : déploiement Supabase + vérification end-to-end
- [ ] docs/sql/day11_apply.sql préparé (idempotent, REVOKE/GRANT inclus)
- [ ] docs/SUPABASE-REGISTRY.md créé et rempli rétroactivement
- [ ] SQL appliqué par Samo dans le SQL Editor
- [ ] Vérification : counterpartPublicProfileId non-null dans le dump AsyncStorage
- [ ] Assisted reconciliation UI déclenchable (relation/[id].tsx)
- [ ] Commit : "chore(supabase): day11 apply script and migration registry"

## P0.4 — Fuite des auth UIDs : migration vers RPC
- [ ] docs/sql/reveal_state_rpc.sql préparé (get_my_reveal_state, REVOKE/GRANT inclus)
- [ ] SQL appliqué par Samo dans le SQL Editor
- [ ] lib/reveal-shared-repo.ts migré vers la RPC (plus de .select() client sur shared_relationship_reveals)
- [ ] upsertSharedRevealRecordForCurrentUser supprimé
- [ ] grep "side_a_user_id|side_b_user_id" sur lib/ et app/ : 0 usage client
- [ ] Tests : mapping RPC + garde-fou grep
- [ ] Flux reveal complet re-testé sur simulateur
- [ ] Commit : "fix(privacy): remove auth UID exposure via get_my_reveal_state RPC"

## P0.5 — Hygiène release
- [ ] console.warn evaluate/[id].tsx:303 derrière __DEV__
- [ ] lib/supabase.ts : throw en dev si env manquantes, fail-safe silencieux en prod
- [ ] app/modal.tsx supprimé (boilerplate jamais référencé)
- [ ] app.json : NSContactsUsageDescription + NSCameraUsageDescription rédigées et validées par Samo
- [ ] app.json : bundleIdentifier, version, buildNumber, icon, splash, scheme vérifiés
- [ ] Grep secrets : 0 clé hardcodée, env Supabase via EXPO_PUBLIC_* uniquement
- [ ] AASA/Universal Links noté dans PARKING.md (hors scope Phase 0)
- [ ] npx expo-doctor sans erreur bloquante
- [ ] tsc 0 erreur, vitest 100% vert
- [ ] Commit : "chore(release): prod log guards, dead code removal, iOS usage strings"

## P0.6 — Build EAS + TestFlight
- [ ] eas.json configuré : profil production, autoIncrement buildNumber, env via EAS Secrets
- [ ] EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY définis comme secrets EAS
- [ ] eas login + credentials iOS (géré par EAS)
- [ ] App record "Baobab" (com.samo.baobab) dans App Store Connect
- [ ] eas build --platform ios --profile production lancé
- [ ] eas submit vers TestFlight
- [ ] docs/SMOKE-TEST.md rédigé
- [ ] Build installé sur iPhone A et iPhone B
- [ ] Smoke test docs/SMOKE-TEST.md 100% coché
- [ ] Commit : "chore(release): EAS production profile and smoke test protocol"
