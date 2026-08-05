# Rapport de diagnostic — B34 (funnel d'activation)

> Question : que signifie exactement `status = 'waiting_other_side'` avec `side_b_user_id IS NULL`
> dans `shared_relationship_reveals` ?
>
> **Diagnostic seul — aucune ligne de production modifiée, aucun SQL exécuté, aucun OTA.** Preuves `fichier:ligne`.

---

## VERDICT

Dans Baobab, **l'inviteur est toujours `sideA`, l'invité toujours `sideB`** (convention client, prouvée §2).
Donc **`side_b_user_id` = le compte de l'invité**, et il n'est renseigné **qu'au moment où l'invité réclame
l'invitation** (ou soumet une lecture en tant que sideB) — deux gestes qui exigent un compte connecté.

⇒ **`waiting_other_side` + `side_b_user_id IS NULL` = personne n'a jamais occupé le côté invité.** Cas dominant :
**l'invité n'a jamais réclamé l'invitation** (aucun compte lié). Trois sous-cas à distinguer par jointure avec
`relationship_invites` (§2 + requête §4b), et **on est aveugle sur le parcours de l'invité avant le claim** (§3).

---

## 1. Cycle de vie d'une relation partagée

### Table & statuts
`public.shared_relationship_reveals` (`supabase/shared_reveal_day1.sql`) : PK `relationship_id text`, `status`
(défaut **`'waiting_other_side'`**, `:3`), `side_a_reading_id`/`side_b_reading_id`, `mutual_score`, `tier`,
`created_at`… Les colonnes participants sont ajoutées ensuite :
`side_a_user_id`, `side_b_user_id uuid references auth.users` (`supabase/shared_reveal_day2_auth_access.sql:2-3`),
avec contrainte `side_a_user_id <> side_b_user_id` (`:13-17`) et trigger d'**immutabilité** des participants
(`prevent_shared_reveal_participant_reassignment`, `:28-46` : une fois un côté lié, il ne peut être réassigné).

**Statuts possibles** (contrainte `shared_reveal_day1.sql:17-19`) :
`waiting_other_side` → `cooking_reveal` → `reveal_ready` → `revealed`.

### Quand la ligne est créée (3 points d'entrée, tous en `waiting_other_side`)
1. **Création d'invite** — `create_relationship_invite` bootstrappe la ligne si absente et lie le **côté de
   l'inviteur** (`supabase/migrations/20260607000000_invite_inviter_identity_snapshot.sql:141-210` : INSERT si
   absente, sinon UPDATE `set side_a_user_id = caller_id` `:183` / `side_b_user_id = caller_id` `:200` selon
   `p_inviter_side`). → l'autre côté reste **NULL**.
2. **Soumission de lecture** — `submit_shared_reading` crée la ligne au premier appel en liant **le côté du
   caller** : `p_side='sideA'` → INSERT `side_a_user_id = caller` (`shared_reveal_day3_lifecycle.sql:323-334`) ;
   `p_side='sideB'` → INSERT `side_b_user_id = caller` (`:336-357`). Statut `'waiting_other_side'` (`:328`,`:351`).
   Sur ligne existante : UPDATE coalesce du côté du caller (`:379-385` sideA, `:402-408` sideB).
3. **Claim** — `claim_relationship_invite` : marque l'invite `claimed_at`/`claimed_by_user_id` (`:417-424`),
   calcule les deux côtés depuis `inviter_side` (`:428-435`) et **INSERT ON CONFLICT** la ligne reveal avec
   **les deux** `side_a_user_id` et `side_b_user_id` (`:443-461`, coalesce : ne remplit que les NULL, n'écrase
   jamais un côté déjà lié).

### Quand `side_b_user_id` est renseigné
**Uniquement** par un caller agissant en **sideB** : `submit_shared_reading` p_side='sideB'
(`day3_lifecycle.sql:348`,`:404`) **ou** `claim_relationship_invite` (`20260607…:446,453,461`). Les deux
supposent un **compte connecté** (`caller_id = auth.uid()`), donc un invité qui a effectivement réclamé.

### Transitions jusqu'à `revealed`
La ligne reste `waiting_other_side` tant que **les deux côtés** n'ont pas soumis leur lecture. Quand les deux
lectures sont présentes → `cooking_reveal` (démarre un délai d'« infusion », réduit à **15 s** par
`supabase/migrations/20260611000000_reduce_reveal_cooking_duration_to_15s.sql`) → `reveal_ready` quand le délai
est écoulé (`mark_shared_reveal_ready_if_unlocked`, garde `mutual_score IS NOT NULL` ajoutée par
`20260529174636`) → `revealed` à l'ouverture (`open_shared_reveal`). RPC lifecycle : `shared_reveal_day3_lifecycle.sql`.

## 2. Que signifie `side_b_user_id IS NULL` ?

**Convention Baobab (prouvée côté client) : inviteur = `sideA`, invité = `sideB`, toujours.**
- Tous les points d'envoi passent `'sideA'` : `app/relation/[id].tsx:602,637,649`,
  `app/relation/evaluate/[id].tsx:236,244` (`createRelationshipInviteForCurrentUser(..., 'sideA', ...)`).
- Le claim fixe toujours `'sideB'` : `app/invite/[relationId].tsx:235` (`let claimedSide = 'sideB'`).

Donc **`side_b_user_id` = le compte de l'invité**. `NULL` signifie **aucun compte n'a jamais occupé le côté
invité**. Le sens dominant est : **l'invité n'a jamais réclamé l'invitation**. Mais `NULL` **ne dit pas
pourquoi**, et recouvre trois situations distinctes — à séparer via `relationship_invites` :

| Sous-cas | Signature | Interprétation |
|---|---|---|
| **(i) Invite jamais envoyée** | reveal `side_b NULL` + **aucune** ligne `relationship_invites` pour ce `relationship_id` | L'inviteur a fait sa lecture / créé la relation mais **n'a jamais envoyé de lien**. |
| **(ii) Invite envoyée, jamais réclamée** | invite existe, `claimed_at IS NULL` | **Le vrai « waiting on the invitee »** — le lien est parti, l'invité n'a pas (fini de) réclamer. |
| **(iii) Claim partiel / anomalie** | invite `claimed_at IS NOT NULL` **mais** reveal `side_b NULL` | Le claim a marqué l'invite mais n'a pas lié le côté B (échec entre `:424` et `:461`, ou résidu d'identité orpheline type B10/B11). **Incohérence à surveiller.** |

Ce que `side_b NULL` **n'est pas** : ce n'est pas « la relation est cassée » ni « le score a échoué » — la ligne
est parfaitement normale, elle attend simplement l'autre côté. Et grâce au trigger d'immutabilité, un `side_b`
lié ne peut jamais **redevenir** NULL : `NULL` est donc toujours un état « côté B jamais lié », pas une perte.

## 3. Trace serveur du parcours de l'invité AVANT le claim ?

**Non — on est aveugle.** `relationship_invites` (`supabase/shared_reveal_day6_invites.sql:3-31`) ne porte que :
`token_hash`, `relationship_id`, `inviter_user_id`, `inviter_side`, `target_side`, `expires_at`, **`created_at`**
(invite générée), **`claimed_at` / `claimed_by_user_id`** (invite réclamée), + snapshot inviteur
(`inviter_display_name/handle/avatar_seed`, migration `20260607`). **Aucune** colonne
`opened` / `viewed` / `installed` / `previewed`.

Et **aucune table d'analytics / télémétrie / événements** n'existe côté serveur (grep `analytics|telemetry|event|
invite_open|impression|funnel` sur `supabase/**` + `docs/sql/**` = **zéro**).

⇒ Les **seuls** horodatages observables du parcours d'une invitation sont **`created_at` → `claimed_at`**. Entre
les deux, impossible de distinguer côté serveur : « lien jamais ouvert » vs « ouvert mais app pas installée » vs
« installée mais claim/écran d'identité abandonné ». **Cette étape du funnel est non instrumentée.** (Toute
mesure de ce segment demanderait soit un lien traçable/redirect, soit un event d'ouverture — chantier à part,
hors périmètre.)

## 4. Requêtes de LECTURE SEULE (SELECT — à exécuter par Samo)

> Dans l'éditeur SQL Supabase (rôle `postgres`/service), la RLS est bypassée → ces agrégats voient **toute** la
> table (ce qu'on veut pour un funnel). Aucune écriture, aucun `DELETE`.

### 4a — La réponse à la question : par statut, `side_b` renseigné vs NULL
```sql
select
  status,
  count(*)                            as total,
  count(side_b_user_id)               as side_b_renseigne,   -- count() ignore les NULL
  count(*) - count(side_b_user_id)    as side_b_null
from public.shared_relationship_reveals
group by status
order by status;
```

### 4b — Funnel enrichi : décompose le bucket `side_b NULL` par état d'invitation (§2)
```sql
select
  r.status,
  (r.side_b_user_id is not null) as invite_lie,            -- côté B lié (invité réclamé)
  exists (
    select 1 from public.relationship_invites i
    where i.relationship_id = r.relationship_id
  ) as invite_envoyee,                                     -- au moins une invite créée
  exists (
    select 1 from public.relationship_invites i
    where i.relationship_id = r.relationship_id
      and i.claimed_at is not null
  ) as invite_reclamee,                                    -- invite marquée réclamée
  count(*) as relations
from public.shared_relationship_reveals r
group by 1, 2, 3, 4
order by 1, 2, 3, 4;
```
Lecture : les lignes `status='waiting_other_side'`, `invite_lie=false` sont l'attente d'activation. Parmi elles,
`invite_envoyee=false` = (i) invite jamais envoyée ; `invite_envoyee=true, invite_reclamee=false` = (ii) le vrai
« en attente de l'invité » ; `invite_reclamee=true` mais `invite_lie=false` = (iii) anomalie de claim à investiguer.

_(EXISTS plutôt qu'un JOIN pour éviter le fan-out si une relation a plusieurs invites.)_

---

## Synthèse

| Question | Réponse |
|---|---|
| Ligne créée quand ? | À la 1ʳᵉ des trois : création d'invite, soumission de lecture, ou claim — toujours en `waiting_other_side` |
| `side_b_user_id` renseigné quand ? | Quand un compte agit en **sideB** : claim, ou submit sideB. Jamais avant, jamais réassignable |
| `side_b NULL` = invité jamais réclamé ? | **Oui** (invité = sideB dans Baobab). Sous-cas (i) invite jamais envoyée / (ii) envoyée non réclamée / (iii) claim partiel — cf. §4b |
| Trace avant le claim ? | **Aucune.** Seuls `created_at`→`claimed_at` ; pas d'ouverture/install/écran. Segment **aveugle** |

_Diagnostic seul. Aucune modification de code de production, aucun SQL exécuté. Requêtes §4 = lecture seule._
