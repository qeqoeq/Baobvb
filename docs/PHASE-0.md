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
- [x] Marquage des données seed analysé et documenté
- [x] Gating production implémenté : aucun seeding en non-dev
- [x] Purge chirurgicale au boot non-dev : seed purgé, données réelles intactes
- [x] Tests vitest : purge sélective, idempotence, aucun seeding hors dev (X1–X5)
- [x] tsc 0 erreur, vitest 100% vert (967/967)
- [x] Commit : dac745a "fix(store): gate dev seeds out of production builds with surgical purge (X.88)"

## P0.3 — Day11 : déploiement Supabase + vérification end-to-end
- [x] docs/sql/day11_apply.sql préparé (idempotent, REVOKE/GRANT inclus)
- [x] docs/SUPABASE-REGISTRY.md créé et rempli rétroactivement
- [x] SQL appliqué par Samo dans le SQL Editor (2026-07-03)
- [x] Vérification : 22/23 counterpartPublicProfileId non-null dans le dump AsyncStorage (1 null = waiting_other_side sans side_b — attendu)
- [x] Assisted reconciliation UI câblée (relation/[id].tsx) — déclenchable dès qu'un draft scan avec sourcePublicProfileId correspondant coexiste
- [x] Commit : 3cb4c94 "chore(supabase): day11 apply script and migration registry"
- [x] Fix backfill stale relations : fd42bda "fix(store): backfill counterpartPublicProfileId on stale bootstrap relations (day11)" + tests B1–B4

## P0.4 — Fuite des auth UIDs : migration vers RPC
- [x] docs/sql/reveal_state_rpc.sql préparé (get_my_reveal_state, REVOKE/GRANT inclus)
- [x] SQL appliqué par Samo dans le SQL Editor (2026-07-03) — grants vérifiés, anon absent
- [x] lib/reveal-shared-repo.ts migré vers la RPC (plus de .select() client sur shared_relationship_reveals)
- [x] upsertSharedRevealRecordForCurrentUser supprimé
- [x] grep "side_a_user_id|side_b_user_id" sur lib/ et app/ : 0 usage client (hors type defs + .test.ts)
- [x] UUID guard ajouté : IDs legacy ('1'–'23', 'r-*') → null sans appel RPC (évite Postgres 22P02)
- [x] Tests : R1–R6 mapping RPC + G1–G3 UUID guard + garde-fou grep (auth-uid-guard.test.ts) — 991/991
- [x] Flux reveal re-testé simulateur : relation "(shared)" revealed → "Active" via RPC ; Lena → snapshot local, aucun crash
- [x] Commit : c4a91e6 "fix(privacy): remove auth UID exposure via get_my_reveal_state RPC"

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
