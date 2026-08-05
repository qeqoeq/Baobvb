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

**Confirmé terrain (05/08/2026)** — voir « Résultats terrain » : convention `sideA` sur 19/19, expiration non
causale, 9 relations bloquées (8 pré-claim + 1 post-claim `1a375332`, **cause de ce dernier non tranchée**),
0 anomalie serveur → **mur côté invité, quasi tout pré-claim**. Dénominateur organique (hors 2 relations de test
de mai) : **8 relations, 1 reveal complet**.

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

## Résultats terrain (05/08/2026)

> Requêtes de lecture seule exécutées par Samo dans l'éditeur SQL Supabase. Verdict acté ci-dessous.

**4c — distribution `inviter_side`**
`select inviter_side, count(*) from public.relationship_invites group by inviter_side;`
→ **`sideA = 19`, `sideB = 0`**. La convention **inviteur = `sideA` est confirmée empiriquement sur 19/19
invites** — `side_b_user_id` est bien, sans exception, le côté invité.

**4d — timing des invites réclamées** (`created_at` → `claimed_at`, vs `expires_at`)
→ **5 invites réclamées, toutes réclamées le JOUR MÊME de leur création** (0 jour d'écart). ⇒ **l'expiration
(TTL 7 j) n'est PAS causale** : aucun claim perdu par péremption ; qui réclame le fait immédiatement. Le TTL
n'explique aucun des non-claims. (5 réclamées sur 19 envoyées ⇒ 14 jamais réclamées ; plusieurs invites peuvent
viser la même relation — renvois — d'où invites ≠ relations.)

**5a — relations bloquées en `waiting_other_side`** (état des deux lectures + cohérence)
→ **9 relations bloquées**, **toutes** `lecture_a = true`, `lecture_b = false`, **aucune anomalie de transition**
(aucune ligne incohérente ; côté A toujours prêt, côté B jamais). Décomposition :
- **8** avec `side_b_user_id NULL` → **pré-claim** : l'invité n'a **jamais réclamé** (segment non instrumenté, §3).
- **1** — `1a375332…` — `side_b_user_id` **renseigné** mais `side_b_reading_id` **NULL** → **post-claim** : claim
  **réussi** (compte invité lié), **évaluation de l'invité jamais soumise**. ⚠️ **Correction (verdict f06f0a8
  erroné)** : ce n'est **pas** un « abandon devant l'écran d'évaluation ». La requête d'identités montre que
  l'invité de `1a375332` est **Laure @lolo**, qui est **aussi inviteuse de `66fb0fbe`** (créée le même jour,
  24/07, `lecture_a=true`) — elle **a donc rempli une évaluation ce jour-là**. **Cause inconnue**, hypothèses :
  non-saillance de la relation entrante dans l'accueil, filtrage possible par `my_shared_relationships()`, ou
  choix utilisateur. **Non tranché — terrain requis.**

**Nettoyage du dénominateur** — `86aec1a5` et `34ed1c23` (mai) impliquent les **appareils de test PhoneA /
iPhoneBB** → à exclure du funnel organique. **Dénominateur organique réel = 8 relations, dont 1 seul reveal complet.**

### Verdict acté
- Convention `inviter_side='sideA'` : **confirmée (19/19)**.
- Expiration : **non causale** (5/5 des claims le jour même de la création).
- Blocage : **exclusivement côté invité** — **0 blocage inviteur, 0 anomalie serveur** (transitions saines,
  côté A toujours prêt). Brut : 9 relations bloquées = **8 pré-claim** (invité jamais réclamé, invisibles
  serveur — §3) **+ 1 post-claim** (`1a375332` : claim réussi, évaluation invité jamais soumise — **cause NON
  tranchée**, cf. 5a ; **pas** un abandon d'évaluation avéré, la même personne en a rempli une le même jour).
- **Dénominateur organique** (hors les 2 relations de test de mai `86aec1a5` / `34ed1c23`, appareils PhoneA/
  iPhoneBB) : **8 relations, 1 reveal complet.**
- **Implication produit** : le point de perte n'est **pas technique** (serveur sain, TTL hors de cause) mais
  **l'activation de l'invité**, très majoritairement **avant le claim** — sur le segment que le serveur ne voit
  pas (§3). Le seul cas post-claim (`1a375332`) reste **non expliqué** (cf. 5a) et demande une observation
  terrain avant toute conclusion. Levier principal : instrumenter/alléger le parcours **jusqu'au claim**.

---

## Composition du panel (05/08)

**Les 8 relations bloquées sont toutes des invitations intra-familiales** :
- **Isaiah** → sa **mère Laure**, son **père**, sa **sœur** ;
- **Wouolha** → **2 de ses enfants**.

Le **seul reveal organique complet** — **Khadra ↔ Imane** — est **non familial**.

Le cas post-claim `1a375332` (Isaiah → sa mère Laure) est lui aussi **intra-familial** : il relève
vraisemblablement de la même hypothèse ci-dessous plutôt que d'un défaut d'écran d'évaluation (cohérent avec la
correction du verdict, §5a).

**Hypothèse — à acter comme NON tranchée mais PRIORITAIRE : biais de recrutement.**
Les relations à **certitude élevée** (liens familiaux proches) **n'offrent aucune incertitude à lever** — donc
**aucune récompense au bout de l'évaluation** : l'invité n'a rien à « découvrir » sur un lien déjà évident, et
n'a pas de raison saillante d'aller au bout. Le seul lien abouti (Khadra ↔ Imane) est précisément celui à
**incertitude réelle**. Cette hypothèse est **structurelle** (elle expliquerait le mur pré-claim ET le cas
post-claim) — mais **non prouvée** : elle demande un lot de test conçu pour la falsifier.

**Critère de recrutement retenu pour le prochain lot** : **adultes**, **relations à incertitude réelle**,
**hors famille**. (Objectif : lever le biais et tester si l'activation invité tient au type de lien, pas à la mécanique.)

---

## Synthèse

| Question | Réponse |
|---|---|
| Ligne créée quand ? | À la 1ʳᵉ des trois : création d'invite, soumission de lecture, ou claim — toujours en `waiting_other_side` |
| `side_b_user_id` renseigné quand ? | Quand un compte agit en **sideB** : claim, ou submit sideB. Jamais avant, jamais réassignable |
| `side_b NULL` = invité jamais réclamé ? | **Oui** (invité = sideB dans Baobab). Sous-cas (i) invite jamais envoyée / (ii) envoyée non réclamée / (iii) claim partiel — cf. §4b |
| Trace avant le claim ? | **Aucune.** Seuls `created_at`→`claimed_at` ; pas d'ouverture/install/écran. Segment **aveugle** |
| Verdict terrain (05/08) | Mur **côté invité** : 8 pré-claim + 1 post-claim (`1a375332`, **cause non tranchée** — même personne a rempli une éval le même jour). Dénominateur **organique** (hors 2 relations test mai `86aec1a5`/`34ed1c23`) = **8 relations, 1 reveal complet** |
| Composition du panel | **8 bloquées = toutes intra-familiales** (Isaiah→mère/père/sœur ; Wouolha→2 enfants) ; seul reveal abouti (Khadra↔Imane) = **non familial**. Hypothèse **prioritaire non tranchée** : **biais de recrutement** (certitude élevée ⇒ rien à lever ⇒ pas de récompense). Prochain lot : **adultes, incertitude réelle, hors famille** |

_Diagnostic seul. Aucune modification de code de production. Requêtes §4 + résultats terrain = lecture seule
(exécutées par Samo le 05/08/2026 ; aucun SQL exécuté par l'assistant, aucun `DELETE`)._
