# SUPABASE-REGISTRY — Registre des SQL appliqués manuellement au remote

Toute modification du schéma Supabase passe ici. Deux catégories :
- **SQL manuel** : appliqué via SQL Editor (Supabase Dashboard) — pas de CLI.
- **Migration CLI** : appliqué via `supabase db push` ou Dashboard Migrations tab.

Règle : après apply, cocher "Vérifié" avec la date et le moyen de vérification.
Risque connu : Supabase peut réintroduire `GRANT EXECUTE TO anon` après recréation de fonction. Toujours vérifier la colonne Grants post-apply.

---

## SQL manuels (supabase/*.sql)

| Fichier | Date apply (estimée) | Contenu résumé | Vérifié |
|---|---|---|---|
| `shared_reveal_day1.sql` | 2026-03-14 | Création table `shared_relationship_reveals` + RLS de base | Oui |
| `shared_reveal_day2_auth_access.sql` | 2026-03-14 | Politiques RLS auth — accès lecture/écriture selon side_a/side_b | Oui |
| `shared_reveal_day2_1_hardening.sql` | 2026-03-14 | Durcissement RLS : guard lifecycle + policy insert uniquement | Oui |
| `shared_reveal_day3_lifecycle.sql` | 2026-03-14 | RPCs lifecycle : `submit_shared_reading`, `mark_shared_reveal_ready_if_unlocked`, `open_shared_reveal` | Oui |
| `shared_reveal_day3_1_cleanup.sql` | 2026-03-14 | Nettoyage post-day3 (DROP de fonctions obsolètes) | Oui |
| `shared_reveal_day6_invites.sql` | 2026-03-19 | Table `relationship_invites` + RPC `create_relationship_invite` + `hash_relationship_invite_token` | Oui |
| `shared_reveal_day6_claim_flow.sql` | 2026-03-19 | RPC `claim_relationship_invite` v1 (retourne `shared_relationship_reveals` composite) + `attach_shared_private_reading_reference` | Supersédé par migrations |
| `shared_reveal_day7_notifications.sql` | 2026-03-19 | Table `reveal_notifications` + RPC `enqueue_reveal_ready_notifications_for_relationship` | Oui |
| `shared_reveal_day8_notification_delivery_hardening.sql` | 2026-03-23 | Durcissement dispatch : idempotence, retry logic, `processing`/`dispatched` states | Oui |
| `shared_reveal_day9_relationship_id_uuid_guard.sql` | 2026-03-25 | Guard UUID dans toutes les RPCs lifecycle — rejette les IDs legacy `r-{timestamp}` | Oui |
| `shared_reveal_day10_my_shared_relationships.sql` | 2026-03-25 | RPC `my_shared_relationships()` — bootstrap des shared relations au démarrage (12 colonnes) | Oui |
| `shared_reveal_day11_counterpart_public_profile.sql` | — | **NON APPLIQUÉ DIRECTEMENT** — contient `my_shared_relationships` enrichi (13 colonnes) + version obsolète de `claim_relationship_invite`. Appliqué via `docs/sql/day11_apply.sql` à la place. | — |
| `shared_reveal_day12_lifecycle_uuid_guard.sql` | 2026-03-28 | Guard UUID renforcé dans le lifecycle complet (double-check sur toutes les transitions) | Oui |
| `shared_reveal_day13_processing_recovery.sql` | 2026-03-28 | RPC `recover_stale_processing_notifications` — batch recovery des rows bloquées en `processing` | Oui |
| `shared_reveal_day14_deno_dispatch.sql` | 2026-03-28 | RPC `dispatch_reveal_ready_notification` + trigger Deno Edge Function pour push Expo | Oui |
| `user_public_profiles.sql` | 2026-03-25 | Table `user_public_profiles` + RLS + RPC `provision_public_profile` + `lookup_public_profile` | Oui |
| `user_handles.sql` | 2026-05-06 | Table `user_handles` + RLS + RPC `claim_handle` + `check_handle_availability` | Oui |
| `phone_anchor_day1_tables.sql` | 2026-05-14 | Tables `phone_anchors` + `phone_anchor_lookups` + RLS + RPC `register_phone_anchor` + `lookup_phone_anchor` | Oui |
| `phone_anchor_day2_vault_pepper.sql` | 2026-05-14 | Pepper Vault (`phone_anchor_pepper`) + migration du hashing vers HMAC-SHA256 avec pepper | Oui |

---

## Migrations CLI (supabase/migrations/*.sql)

| Fichier | Date apply | Contenu résumé | Vérifié |
|---|---|---|---|
| `20260523123000_claim_invite_bootstrap_shared_reveal.sql` | 2026-05-23 | DROP + CREATE `claim_relationship_invite` v2 : nouveau type de retour (13 colonnes dont `counterpart_public_profile_id`), bootstrap atomique de `shared_relationship_reveals` via INSERT ON CONFLICT | Oui |
| `20260529174636_enforce_reveal_ready_score_contract.sql` | 2026-05-29 | Guard `mutual_score IS NOT NULL` dans `mark_shared_reveal_ready_if_unlocked` + `open_shared_reveal` + `enqueue_reveal_ready_notifications_for_relationship` | Oui |
| `20260530230041_fix_claim_invite_ambiguous_relationship_id.sql` | 2026-05-30 | CREATE OR REPLACE `claim_relationship_invite` v3 : ajout `#variable_conflict use_column` — correctif "invite link is invalid" (ambiguïté column vs OUT variable) | Oui |
| `20260607000000_invite_inviter_identity_snapshot.sql` | 2026-06-07 | Snapshot identité inviteur dans `relationship_invites` au moment de l'envoi : `inviter_display_name`, `inviter_avatar_seed`, `inviter_handle` | Oui |
| `20260611000000_reduce_reveal_cooking_duration_to_15s.sql` | 2026-06-11 | Réduit la durée de cooking de 90s à 15s dans `mark_shared_reveal_ready_if_unlocked` | Oui |
| `20260629000000_pass_deliveries.sql` | 2026-06-29 | Table `pass_deliveries` + RLS + RPC `create_pass_delivery` + `fetch_pass_deliveries` | Oui |

---

## Corrections de grants (appliquées séparément)

Supabase réintroduit parfois `GRANT EXECUTE TO anon` après recréation de fonction (comportement plateforme documenté). Lorsque détecté, appliquer :

```sql
revoke all on function public.<nom_fonction>(<args>) from public;
revoke all on function public.<nom_fonction>(<args>) from anon;
grant execute on function public.<nom_fonction>(<args>) to authenticated;
```

Fonctions concernées (historique) : `my_shared_relationships()`, `claim_relationship_invite(text)`, `submit_shared_reading(text, text, jsonb)`, `enqueue_pass_delivery_notification(uuid, uuid)`.

**Leçon P0.5bis :** `REVOKE ALL FROM public, authenticated` ne couvre pas `anon` — Supabase maintient `anon` comme rôle distinct. Règle à suivre partout : `REVOKE ALL FROM public, authenticated, anon` sur toute fonction security definer non destinée aux clients.

---

## À appliquer (queue)

| Fichier | Objet | Statut |
|---|---|---|
| `docs/sql/cron_runner_schedule.sql` | pg_cron + pg_net activés, secret substitué, appliqué | **Vérifié 2026-07-03** — `cron.job active=true`, 3 exécutions consécutives succeeded (17:24, 17:25, 17:26 UTC) |
| `docs/sql/b8_b4_counterpart_name.sql` | B8 UNIQUE(relationship_id) + B4 display_name/handle sur user_public_profiles + upsert_user_handle étendu + my_shared_relationships 15 colonnes | **Vérifié 2026-07-08** — V1→V5 conformes (voir Journal) |
| `docs/sql/b15_handle_freeze.sql` | B15/D2 — gel du handle post-setup dans `upsert_user_handle` (rejet `handle_frozen` si handle différent, idempotence préservée) | **Vérifié 2026-07-10** — V1→V3 conformes (voir Journal) |

---

## Fonctions security definer actives (post-P0.4)

| Fonction | Colonnes sensibles exposées | Auth UIDs client | Vérifiée |
|---|---|---|---|
| `my_shared_relationships()` | counterpart_display_name, counterpart_handle (non-auth — noms publics du counterpart) | Non | Oui (2026-07-08) |
| `get_my_reveal_state(uuid)` | aucune (my_side calculé server-side) | Non | Oui (2026-07-03) |
| `claim_relationship_invite(text)` | counterpart_public_profile_id uniquement | Non | Oui |
| `open_shared_reveal(text)` | aucune | Non | Oui |
| `mark_shared_reveal_ready_if_unlocked(text)` | aucune | Non | Oui |
| `start_shared_cooking_reveal_if_ready(text)` | aucune | Non | Oui |

---

## Journal d'application

| Date | Fichier | Résultat | Méthode de vérification |
|---|---|---|---|
| 2026-07-03 | `docs/sql/day11_apply.sql` | **Appliqué** — 13 colonnes confirmées, anon absent | curl RPC direct (token frais) : 22/23 non-null ; dump AsyncStorage post-bootstrap : 22/23 non-null, 1 null = `waiting_other_side` sans side_b |
| 2026-07-03 | `docs/sql/reveal_state_rpc.sql` | **Appliqué** — `get_my_reveal_state`, anon absent | Grants vérifiés : authenticated EXECUTE seul (postgres + service_role exclus de anon) ; flux reveal re-testé sur simulateur post-migration |
| 2026-07-03 | `docs/sql/pass_notification.sql` | **Appliqué** — kind check étendu, `dequeue` multi-kind, `enqueue_pass_delivery_notification`, `create_pass_delivery` avec enqueue | kind check ✓ ; anti-spam/dedup true\|true\|true ✓ ; create_pass_delivery authenticated ✓ anon absent ✓ ; enqueue anon corrigé manuellement (revoke manquant — voir leçon registre) |
| 2026-07-03 | **Incident 1** : runner jamais schedulé depuis day14 | pg_cron non activé (42P01 `cron.job` does not exist) — `notification-dispatch-runner` n'a jamais tourné automatiquement. Les push reveal-ready n'étaient opérationnels qu'en invocation manuelle. **Fix : activer pg_cron + pg_net (Extensions) + `cron.schedule` cf. docs/sql/cron_runner_schedule.sql.** | Pendante — voir E2E P0.5bis |
| 2026-07-03 | **Incident 2** : parsing Expo — zéro push délivré depuis day14 | `sendExpoPush` envoyait un objet JSON (`{to,title,...}`) mais parsait la réponse comme tableau (`data[0]`). Expo retourne `data` comme **objet** pour un envoi unitaire, **tableau** seulement pour un envoi en tableau. Résultat : chaque tentative finissait en `"Expo response missing data[0]"` — dispatched:0 de tout temps. **Fix : envoyer `[{...}]`, parser avec fallback objet/tableau (commit à venir après redeploy Deno).** Backlog purgé via `docs/sql/cron_runner_schedule.sql` avant activation cron. | Fix appliqué — attente redeploy Deno + E2E |
| 2026-07-03 | **Incident 3** : `DeviceNotRegistered` lors du premier E2E — hypothèse APNs infirmée | La clé APNs existait déjà dans EAS (saine — test direct Expo ticket:ok, receipt:ok, push reçu sur iPhone). Le `DeviceNotRegistered` venait du parsing Expo (incident 2) : runner renvoyait l'erreur du ticket avant le fix `[{...}]`. Une fois le Deno redéployé, E2E complet validé : dispatched:1, failed:0, push "Someone thought of you 🌱" reçu app fermée, tap → lieu visible. **Aucun fix credentials nécessaire.** | Résolu — E2E 2026-07-03 |
| 2026-07-08 | `docs/sql/b8_b4_counterpart_name.sql` — 4 blocs | **Appliqué** — B8 (UNIQUE constraint, 0 doublon préalable), B4a (ALTER TABLE), B4b (DROP+CREATE upsert_user_handle), B4c (DROP+CREATE my_shared_relationships 15 col.) | V1 UNIQUE ✓ ; V2 display_name+handle nullable ✓ ; V3 args = `p_handle text, p_display_name text DEFAULT NULL::text` ✓ ; V4 `pg_get_function_result` = TABLE 15 col. verbatim ✓ ; V5 grants = authenticated+postgres+service_role, aucun anon ni public ✓ |
| 2026-07-09 | Rotation `DISPATCH_RUNNER_SECRET` + recréation cron jobid 2 | Cron runner en erreur 401 depuis le 2026-07-03. Cause : secret `DISPATCH_RUNNER_SECRET` expiré/invalide → Edge Function dispatch rejetait chaque appel pg_net avec 401. Fix out-of-session : (1) nouveau secret généré dans Supabase Vault → `DISPATCH_RUNNER_SECRET` mis à jour, (2) `SELECT cron.unschedule(2)` puis recréation du job `notification-dispatch-runner` (jobid 2) avec le nouveau secret injecté, (3) pipeline vérifiée end-to-end (dispatched:1, failed:0, push reçu). | Vérifié 2026-07-09 — 3+ exécutions cron succeeded post-rotation, pipeline push fonctionnelle |
| 2026-07-09 | **Purge données de test** — suppression de 142 comptes `auth.users` de test (résidus des runs de mars + 4 orphelins récents dont `1eadf1cc` et `9f083ff3`) | Contexte : diagnostic B11 (Volet C) — les claims récents s'inscrivaient sous des identités auth orphelines (session AsyncStorage découplée de la MeProfile), rendant les relations invisibles dans `my_shared_relationships()` du device légitime → `"(shared)"` permanent. **Critère de légitimité retenu : `user_public_profiles.display_name IS NOT NULL`.** Purge en cascade **manuelle** (pas de FK ON DELETE CASCADE) dans l'ordre : `shared_relationship_reveals` (108 rows) → `notification_outbox` → `user_handles` → `user_public_profiles` (lignes `display_name IS NULL`) → `relationship_invites` (FK `inviter_user_id` + `claimed_by_user_id`) → `device_push_tokens` (FK `user_id`) → `auth.users`. **État final vérifié : 2 users / 2 profils / 3 reveals.** ⚠️ **Note B14** : l'orphelin `ca653272` détenait un `device_push_token` — les tokens se rattachent à la **session auth active**, pas au profil affiché ; à intégrer au diagnostic B14 (re-registration du push token sur install fraîche). | Vérifié 2026-07-09 — comptage final 2/2/3 confirmé post-purge |
| 2026-07-10 | `docs/sql/b15_handle_freeze.sql` — gel handle post-setup | **Appliqué** — `CREATE OR REPLACE upsert_user_handle` (signature 2-args inchangée, pas de DROP) : garde `handle_frozen` insérée après le format guard / avant l'`INSERT ON CONFLICT` de `user_handles`, variable `existing_handle` dans le DECLARE principal. Idempotence préservée (re-publication à l'identique autorisée — requise par `reconcileHandleOwnership` bootstrap + `me/edit` post-setup B15). | V1 idempotence (même handle) = `{"success": true}` ✓ ; V2 gel (handle différent) = `{"success": false, "reason": "handle_frozen"}` ✓ ; V3 grants = authenticated + postgres + service_role, **aucun anon ni public** ✓ |
