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

Fonctions concernées (historique) : `my_shared_relationships()`, `claim_relationship_invite(text)`, `submit_shared_reading(text, text, jsonb)`.

---

## À appliquer (queue)

_Aucun script en attente._

---

## Journal d'application

| Date | Fichier | Résultat | Méthode de vérification |
|---|---|---|---|
| 2026-07-03 | `docs/sql/day11_apply.sql` | **Appliqué** — 13 colonnes confirmées, anon absent | curl RPC direct (token frais) : 22/23 non-null ; dump AsyncStorage post-bootstrap : 22/23 non-null, 1 null = `waiting_other_side` sans side_b |
