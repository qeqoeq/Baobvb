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
- [x] console.warn evaluate/[id].tsx derrière __DEV__
- [x] lib/supabase.ts : throw en dev si env manquantes, fail-safe silencieux en prod
- [x] app/modal.tsx supprimé (boilerplate jamais référencé)
- [x] app.json : NSContactsUsageDescription (via expo-contacts plugin) + NSCameraUsageDescription (via expo-camera plugin) ajoutées et validées
- [x] app.json : bundleIdentifier com.samo.baobab ✓, version 1.0.0 ✓, buildNumber 24 ✓, icon 1024×1024 ✓, splash ✓, scheme baobab ✓
- [x] Grep secrets : 0 service_role key ; EXPO_PUBLIC_* seules dans le code ; .env ignoré par git
- [x] AASA/Universal Links noté dans PARKING.md (hors scope Phase 0) ✓
- [x] npx expo-doctor : 17/18 checks passés. 1 warning non bloquant : décalages patch/minor (expo, expo-router, react-native-svg +2 mineurs). EAS build non impacté.
- [x] tsc 0 erreur, vitest 991/991 vert
- [x] Commit : fc862ad "chore(release): prod log guards, dead code removal, iOS usage strings"

## P0.5bis — Push notification pass delivery
- [x] Architecture : extension typée du pipeline `notification_outbox` (kind `pass_delivery`)
- [x] docs/sql/pass_notification.sql : kind check étendu, `dequeue` multi-kind, `enqueue_pass_delivery_notification`, `create_pass_delivery` avec enqueue best-effort
- [x] SQL appliqué par Samo (2026-07-03) — anti-spam/dedup ✓, grants ✓, anon révoqué ✓
- [x] Deno `notification-dispatch-runner` : fix parsing Expo (envoi `[{...}]`, fallback array/object) + pushTitle/pushBody depuis payload
- [x] Client : `addPassDeliveryNotificationResponseListener` + `getLaunchPassDeliveryFromLastNotification` + cold-start handler dans `_layout.tsx`
- [x] Tests N1–N7 (listener, extraction, cold-start) — 1004/1004
- [x] Incidents résolus : runner jamais schedulé (pg_cron absent) + parsing Expo (zéro push depuis day14) — backlog stale purgé
- [x] docs/sql/cron_runner_schedule.sql préparé (pg_cron + pg_net, schedule toutes les minutes)
- [x] E2E validé : pass "Test Luciole 2" simulateur → curl → dispatched:1 → push reçu iPhone app fermée → tap → lieu visible
- [x] Commit : 1859b8b "feat(pass): receiver push notification on pass delivery (P0.5bis)"

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
