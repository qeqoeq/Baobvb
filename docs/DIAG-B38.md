# B38 — Exposer `mutual_score` + `tier` au bootstrap (migration à AUDITER, pas à appliquer)

> Objectif : `my_shared_relationships()` renvoie aussi `mutual_score` + `tier` (NULL tant que non `revealed`),
> et le bootstrap client les mappe dans le `revealSnapshot`. **Aucun SQL exécuté, aucun code appliqué** —
> Samo colle après audit. Preuves `fichier:ligne`.

---

## 0. Portée corrigée (correction de DIAG-B35)

DIAG-B35 présentait l'absence de score comme un problème **côté invité (side B)**. **C'est en réalité les DEUX
côtés.** Preuve : le seul writer du `mutualScore` dans le store est le **calcul LOCAL**
(`store/useRelationsStore.ts:1845` `computeMutualRelationshipScore(readingA.ratings, readingB.ratings)`) qui exige
**les deux lectures dans `state.evaluations` local** (`:1837-1839`). Pour une relation partagée, **aucun** des
deux côtés ne possède la lecture de l'autre (le serveur n'expose que des reading **IDs**, jamais les ratings du
counterpart — ni `my_shared_relationships()` ni `get_my_reveal_state`). Donc **ni A ni B** ne peut calculer le
score localement ⇒ le `revealSnapshot` du store n'a **jamais** de `mutualScore` pour une relation partagée, des
deux côtés. Conséquence terrain confirmée : buckets **Solide/Bon/Fragile/À soigner** (`garden.tsx:698-726`) et
section **Santé** (`garden.tsx:652-687`) **vides des deux côtés** (elles lisent `revealSnapshot.mutualScore` via
`getRevealedLinkStrength` `garden.tsx:84-86`). La fiche `relation/[id]` s'en sort seule car elle lit le score via
le fetch `get_my_reveal_state` (état local du composant, cf. DIAG-B36-1) — mais ce chemin **ne backfille pas le
store**, donc les écrans de synthèse restent vides. B38 corrige la source : le score entre au bootstrap.

---

## 1. Définition actuelle complète

`docs/sql/b8_b4_counterpart_name.sql:128-186` (dernière version appliquée — SUPABASE-REGISTRY, 2026-07-08) :

```sql
CREATE OR REPLACE FUNCTION public.my_shared_relationships()
RETURNS TABLE(
  relationship_id               text,
  status                        text,
  my_side                       text,
  side_a_present                boolean,
  side_b_present                boolean,
  side_a_reading_id             text,
  side_b_reading_id             text,
  cooking_started_at            timestamptz,
  unlock_at                     timestamptz,
  ready_at                      timestamptz,
  revealed_at                   timestamptz,
  relationship_name_revealed    boolean,
  counterpart_public_profile_id uuid,
  counterpart_display_name      text,
  counterpart_handle            text
)
LANGUAGE plpgsql
SECURITY DEFINER              -- (:147) à PRÉSERVER
SET search_path = public      -- (:148) à PRÉSERVER
AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authenticated user required';
  END IF;
  RETURN QUERY
  SELECT
    sr.relationship_id,
    sr.status,
    CASE WHEN sr.side_a_user_id = caller_id THEN 'sideA' ELSE 'sideB' END AS my_side,
    (sr.side_a_user_id IS NOT NULL)  AS side_a_present,
    (sr.side_b_user_id IS NOT NULL)  AS side_b_present,
    sr.side_a_reading_id,
    sr.side_b_reading_id,
    sr.cooking_started_at,
    sr.unlock_at,
    sr.ready_at,
    sr.revealed_at,
    sr.relationship_name_revealed,
    c_upp.public_profile_id  AS counterpart_public_profile_id,
    c_upp.display_name       AS counterpart_display_name,
    c_upp.handle             AS counterpart_handle
  FROM public.shared_relationship_reveals sr
  LEFT JOIN public.user_public_profiles c_upp
    ON c_upp.user_id = CASE
         WHEN sr.side_a_user_id = caller_id THEN sr.side_b_user_id
         ELSE sr.side_a_user_id
       END
  WHERE
    (sr.side_a_user_id = caller_id OR sr.side_b_user_id = caller_id)
    AND sr.relationship_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
END;
$$;
```

Colonnes source disponibles (non exposées aujourd'hui) : `shared_relationship_reveals.mutual_score numeric(5,2)`
(`supabase/shared_reveal_day1.sql:11`) et `tier text` (`:12`).

## 2. Grants actuels

`docs/sql/b8_b4_counterpart_name.sql:188-190` :
```sql
REVOKE ALL ON FUNCTION public.my_shared_relationships() FROM public;
REVOKE ALL ON FUNCTION public.my_shared_relationships() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_shared_relationships() TO authenticated;
```
⇒ **`authenticated` : EXECUTE. `anon`/`public` : révoqués.** `postgres` (owner) + `service_role` (clé serveur)
peuvent apparaître — normal. **Jamais de grant `anon` ni `PUBLIC`** (3 incidents historiques, cf. SUPABASE-REGISTRY).

**Relève à exécuter par Samo AVANT la migration** (pour confirmer l'état réel, au cas où il aurait dérivé) :
```sql
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public' AND routine_name = 'my_shared_relationships'
ORDER BY grantee;
-- Attendu : authenticated EXECUTE ; aucun anon ; aucun PUBLIC.
```

## 3. Piège Postgres — changement de type de retour

`CREATE OR REPLACE FUNCTION` **échoue** quand la `RETURNS TABLE` change (ajout de colonnes) :
`ERROR: cannot change return type of existing function`. Il faut **`DROP FUNCTION` puis recréer**. **Le DROP
supprime aussi les GRANT** → la migration doit les **recréer à l'identique** (§2). Le tout **en transaction**
(`BEGIN; … COMMIT;`) pour que, en cas d'échec, la fonction ne reste pas droppée sans recréation.

## 4. Migration prête à coller (à AUDITER — ne pas appliquer avant GO)

> Ajoute `mutual_score` + `tier` **en fin** de `RETURNS TABLE` (n'affecte pas l'accès par nom côté client, §6).
> **Doctrine** : `CASE WHEN sr.status = 'revealed' … ELSE NULL` — aucun score/tier ne sort avant le reveal mutuel.
> ⚠️ La colonne `mutual_score` est **déjà peuplée dès `reveal_ready`** (guard `mutual_score IS NOT NULL`,
> migration `20260529174636`) : **sans le `CASE`, le score fuiterait avant le reveal** = défaut critique.

```sql
BEGIN;

-- 1) Le type de retour change → DROP obligatoire (CREATE OR REPLACE échouerait).
DROP FUNCTION IF EXISTS public.my_shared_relationships();

-- 2) Recréation : 15 colonnes existantes + 2 nouvelles EN FIN (mutual_score, tier).
CREATE FUNCTION public.my_shared_relationships()
RETURNS TABLE(
  relationship_id               text,
  status                        text,
  my_side                       text,
  side_a_present                boolean,
  side_b_present                boolean,
  side_a_reading_id             text,
  side_b_reading_id             text,
  cooking_started_at            timestamptz,
  unlock_at                     timestamptz,
  ready_at                      timestamptz,
  revealed_at                   timestamptz,
  relationship_name_revealed    boolean,
  counterpart_public_profile_id uuid,
  counterpart_display_name      text,
  counterpart_handle            text,
  mutual_score                  numeric,   -- B38 (NOUVEAU) — NULL tant que status <> 'revealed'
  tier                          text       -- B38 (NOUVEAU) — NULL tant que status <> 'revealed'
)
LANGUAGE plpgsql
SECURITY DEFINER                 -- PRÉSERVÉ
SET search_path = public         -- PRÉSERVÉ
AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authenticated user required';
  END IF;
  RETURN QUERY
  SELECT
    sr.relationship_id,
    sr.status,
    CASE WHEN sr.side_a_user_id = caller_id THEN 'sideA' ELSE 'sideB' END AS my_side,
    (sr.side_a_user_id IS NOT NULL)  AS side_a_present,
    (sr.side_b_user_id IS NOT NULL)  AS side_b_present,
    sr.side_a_reading_id,
    sr.side_b_reading_id,
    sr.cooking_started_at,
    sr.unlock_at,
    sr.ready_at,
    sr.revealed_at,
    sr.relationship_name_revealed,
    c_upp.public_profile_id  AS counterpart_public_profile_id,
    c_upp.display_name       AS counterpart_display_name,
    c_upp.handle             AS counterpart_handle,
    -- ── DOCTRINE : aucun score/tier avant le reveal mutuel ────────────────────
    CASE WHEN sr.status = 'revealed' THEN sr.mutual_score ELSE NULL END AS mutual_score,
    CASE WHEN sr.status = 'revealed' THEN sr.tier         ELSE NULL END AS tier
  FROM public.shared_relationship_reveals sr
  LEFT JOIN public.user_public_profiles c_upp
    ON c_upp.user_id = CASE
         WHEN sr.side_a_user_id = caller_id THEN sr.side_b_user_id
         ELSE sr.side_a_user_id
       END
  WHERE
    (sr.side_a_user_id = caller_id OR sr.side_b_user_id = caller_id)
    AND sr.relationship_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
END;
$$;

-- 3) Grants recréés À L'IDENTIQUE (le DROP les a supprimés). JAMAIS anon ni PUBLIC.
REVOKE ALL ON FUNCTION public.my_shared_relationships() FROM public;
REVOKE ALL ON FUNCTION public.my_shared_relationships() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_shared_relationships() TO authenticated;

COMMIT;
```

### Vérifications post-apply (à coller après la transaction)
```sql
-- V-B38.1 — type de retour = 17 colonnes, avec mutual_score + tier EN FIN
SELECT pg_get_function_result('public.my_shared_relationships()'::regprocedure);
-- Attendu : TABLE(… counterpart_handle text, mutual_score numeric, tier text)

-- V-B38.2 — grants : authenticated EXECUTE, aucun anon/public
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public' AND routine_name = 'my_shared_relationships'
ORDER BY grantee;

-- V-B38.3 — DOCTRINE : aucune ligne non-revealed ne porte de score
--            (doit renvoyer 0 pour un compte de test qui a des relations non révélées)
SELECT count(*) AS fuites
FROM public.my_shared_relationships()
WHERE status <> 'revealed' AND (mutual_score IS NOT NULL OR tier IS NOT NULL);
-- Attendu : 0. Toute valeur > 0 = fuite = NE PAS déployer le client.
```

## 5. Diff du mapping client (à AUDITER — non appliqué)

Trois éditions dans `store/useRelationsStore.ts` (+ le type est aussi consommé par `lib/bootstrap-shared-relations.ts`,
qui caste par **nom** — rien à changer là-bas).

**(5a) Type `SharedRelationBootstrapInput`** (`store/useRelationsStore.ts:2649-2681`) — ajouter en fin :
```diff
   counterpart_display_name: string | null;
   counterpart_handle: string | null;
+  /** B38: mutual score — NULL unless status='revealed' (server NULL-gates). */
+  mutual_score: number | null;
+  /** B38: server tier label — NULL unless revealed; re-derived client-side from the score. */
+  tier: string | null;
 };
```

**(5b) Projection `buildSharedRevealLocalState`** (`store/useRelationsStore.ts:2721-2732`) — mapper dans le
snapshot, **gardé sur `revealed`** (défense en profondeur, en plus du CASE serveur) ; le `tier` est **re-dérivé
du score** pour rester cohérent avec B36-2 option A (via `normalizePersistedRevealSnapshotTier`, déjà importée
par `getEffectiveRevealSnapshot`) :
```diff
     revealSnapshot: {
       status: normalizedStatus,
       revealed,
       relationshipNameRevealed: revealed ? data.relationship_name_revealed === true : false,
       cookingStartedAt: isCooking || isReady || revealed ? toOptionalTs(data.cooking_started_at) : undefined,
       unlockAt: isCooking ? toOptionalTs(data.unlock_at) : undefined,
       readyAt: isReady || revealed ? toOptionalTs(data.ready_at) : undefined,
       revealedAt: revealed ? toOptionalTs(data.revealed_at) : undefined,
+      mutualScore: revealed && typeof data.mutual_score === 'number' ? data.mutual_score : undefined,
+      tier: revealed
+        ? (normalizePersistedRevealSnapshotTier(data.tier, data.mutual_score) ?? undefined)
+        : undefined,
     },
```
_(import à ajouter en tête du fichier : `import { normalizePersistedRevealSnapshotTier } from '../lib/persisted-tier-normalization';` — vérifier qu'il n'est pas déjà importé.)_

**(5c) ⚠️ `mergeBootstrappedRevealSnapshot`** (`store/useRelationsStore.ts:2753-2766`) — **backfill obligatoire**.
Le merge actuel **retourne `local` sans rien adopter quand les rangs sont égaux** (`:2757-2758`). Or les
relations déjà `revealed` localement (cas terrain de Sou/A : révélées AVANT B38, donc **sans** score) ne seraient
**jamais** backfillées. Ajouter une branche de backfill non-destructive :
```diff
 function mergeBootstrappedRevealSnapshot(
   local: RelationshipRevealSnapshot,
   server: RelationshipRevealSnapshot,
 ): RelationshipRevealSnapshot {
   if (REVEAL_STATUS_RANK[server.status] <= REVEAL_STATUS_RANK[local.status]) {
+    // B38: backfill score/tier when local is already 'revealed' but scoreless
+    // (revealed before B38 exposed them). Non-destructive: status/firstViewedAt untouched.
+    if (
+      local.status === 'revealed' &&
+      local.mutualScore === undefined &&
+      typeof server.mutualScore === 'number'
+    ) {
+      return { ...local, mutualScore: server.mutualScore, tier: local.tier ?? server.tier };
+    }
     return local;
   }
   return {
     ...server,
     firstViewedAt: local.firstViewedAt ?? server.firstViewedAt,
     mutualScore: local.mutualScore ?? server.mutualScore,
     tier: local.tier ?? server.tier,
     finalizedVersion: local.finalizedVersion ?? server.finalizedVersion,
   };
 }
```
Sans (5c), B38 ne corrigerait que les relations révélées **après** le déploiement, pas celles déjà révélées —
donc **pas** le cas terrain observé. À noter au moment de coder.

## 6. Appelants côté client — ajout non cassant

Le résultat RPC est casté **par nom** (objets JSON), jamais par position :
- `lib/bootstrap-shared-relations.ts:14-17` — `supabase.rpc('my_shared_relationships')` → `data as SharedRelationBootstrapInput[]`.
- Consommateurs : `app/_layout.tsx:225` (bootstrap au démarrage) et `lib/resync-shared-relations.ts:53` (re-sync B26),
  tous deux via `fetchMySharedRelationships()`.

⇒ Ajouter des colonnes **en fin** de `RETURNS TABLE` **ne casse aucun appelant** (accès par nom ; les nouveaux
champs sont simplement lus en plus). `get_my_reveal_state` est une **fonction distincte**, non touchée. Aucun
autre consommateur de `my_shared_relationships` (grep : uniquement bootstrap/resync + commentaires).

---

## Checklist d'audit avant que Samo colle
- [ ] `DROP FUNCTION` + `CREATE` (pas `CREATE OR REPLACE` seul) — type de retour changé.
- [ ] `SECURITY DEFINER` + `SET search_path = public` présents dans le CREATE.
- [ ] 2 colonnes **en fin** de `RETURNS TABLE` **et** en fin du `SELECT`, même ordre.
- [ ] `CASE WHEN sr.status = 'revealed' … ELSE NULL` sur `mutual_score` **et** `tier`.
- [ ] Grants recréés : `authenticated` EXECUTE, `anon`/`public` révoqués. **Aucun `GRANT … TO anon/PUBLIC`.**
- [ ] Le tout dans `BEGIN; … COMMIT;`.
- [ ] V-B38.3 (fuite) = 0 avant de déployer le client.
- [ ] Client (5a/5b/5c) : le backfill (5c) est présent sinon les relations déjà révélées restent sans score.

_Aucun SQL exécuté, aucun code appliqué. Livrable d'audit — Samo applique après validation._
