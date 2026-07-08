# SESSION-STATE.md — Passation session bugs B1→B9

> Règle d'or : le repo est la source de vérité. Ce document POINTE vers fichiers et commits.
> Il ne recopie JAMAIS de code déjà commité. Interdiction de régénérer du code de mémoire.
>
> ⚠️ Document généré hors-repo (claude.ai) à partir du transcript de session.
> Avant commit : vérifier les deux sections marquées ⚠️ À VÉRIFIER dans Claude Code.

## CONTEXTE (5 lignes max)

Projet Baobab (Expo/React Native + Supabase, local-first). Double rôle de l'assistant :
EXÉCUTANT (implémente les fixes) + AUDITEUR (refuse tout [DONE] sans preuve : dumps, sorties
de tests, résultats SQL collés). Session en cours : correction des bugs B1→B9 issus du smoke
test du build 27, un commit par bug. Fichiers à lire en premier, dans cet ordre : CLAUDE.md,
docs/SESSION-STATE.md, docs/PHASE-0.md, docs/SUPABASE-REGISTRY.md, docs/SMOKE-TEST.md,
docs/PARKING.md, docs/baobab-design-bible.md si présent. NB : docs/PASSATION.md n'existe pas
encore dans le repo (le doc de passation stratégique vit hors-repo, à committer plus tard).

## ÉTAT ACTUEL — B1→B9

| Bug | Statut | Cause racine | Fix | Preuve | Commit |
|---|---|---|---|---|---|
| B1 — Seed "me" en prod | **DONE prouvé** | `state.me = SEED_ME` à l'init + `...SEED_ME` dans `applyHydratedState` non guardés par `__DEV__` ; `purgeSeedData()` ne couvrait pas `me` | `BLANK_ME` en prod (init + hydratation), purge boot du handle seed `@yasmine.baobab`, `getMeSnapshot` exporté pour tests | Tests M1/M2 ajoutés, 1006/1006 verts (`store/useRelationsStore.ts`, `store/useRelationsStore.test.ts`) | `9788cb0` |
| B2 — Bouton Start silencieux | **DONE prouvé** | `finally { setIsSaving(false) }` réactivait le bouton pendant la nav ; `router.back()` échouait en setup mode (pas d'historique) | `setIsSaving(false)` uniquement sur erreur ; en setup mode succès → `router.replace('/(tabs)')` (`app/me/edit.tsx`) | tsc + 1006/1006 verts | `d3d3bf6` |
| B3 — Clavier non dismissible | **DONE prouvé** | Écrans à `TextInput` sans pattern dismiss complet | Pattern global : `KeyboardAvoidingView` + `keyboardShouldPersistTaps="handled"` + `onScrollBeginDrag={Keyboard.dismiss}` (ScrollView) ou wrapper `Pressable onPress={Keyboard.dismiss}` (View). Écrans couverts : me/edit, place/add, place/edit/[id], relation/add, relation/edit/[id], invite/identity/[relationId], (tabs)/garden, me/invite-by-number | tsc + 1006/1006 verts, 2 commits | `aa6c580` + `eb4ee6d` |
| B4 — Counterpart name absent | **SQL appliqué — fix client en cours** | (1) `user_public_profiles` sans colonnes `display_name`/`handle` ; (2) `my_shared_relationships()` ne retournait pas `counterpart_display_name`/`counterpart_handle` | `docs/sql/b8_b4_counterpart_name.sql` appliqué 2026-07-08 (5/5 ✓). Client à mettre à jour : `SharedRelationBootstrapInput` + `upsertBootstrappedSharedRelations` + `upsertUserHandle(handle, displayName?)` + appel depuis `me/edit.tsx` | — | — |
| B5 — Tier visible avant reveal | **À FAIRE** (décision figée prise, voir ci-dessous) | — | — | — | — |
| B6 — Picker de pass filtré | **À FAIRE** (décision figée prise, voir ci-dessous) | — | — | — | — |
| B7 — Back incorrect post-claim | **DONE prouvé** | `invite/identity/[relationId]` présenté en modal → Expo Router empilait une 2e instance de `invite` ; back retombait dessus | Param `fromClaim: '1'` passé de `invite/[relationId]` vers evaluate (3 points de nav, `push` → `replace`) ; dans `evaluate/[id]`, les 4 navigations succès vont vers `/(tabs)` si `isFromClaim` | tsc + 1006/1006 verts | `3a87c94` |
| B8 — Doublons de claim | **STOP SQL écrit — à re-tester device smoke test build 28** | Diagnostic 2026-07-08 : 0 doublon (110/110 distinct) — base saine. Smoke test B8 était faux positif ou issue client transiente. Fix préventif : contrainte `UNIQUE(relationship_id)` sur `shared_relationship_reveals`. | `docs/sql/b8_b4_counterpart_name.sql` BLOC 1. Bouton disabled pendant claim déjà géré par `isSubmitting` guard dans `handleAddMySide`. | Diagnostic SQL : "Success. No rows returned" + count=110 distinct_ids=110 | — |
| B9 — Identité | **À FAIRE** (décision figée prise, voir ci-dessous) | — | — | — | — |

### git status / push — VÉRIFIÉ 2026-07-08

Ordre chronologique réel (git log, du plus ancien au plus récent) :
`9788cb0` (B1) → `d3d3bf6` (B2) → `aa6c580` (B3 pt.1) → `eb4ee6d` (B3 pt.2) → `3a87c94` (B7)
→ `4ee8871` (runner catch-up).
Note : SESSION-STATE.md hors-repo avait B7 et B3pt.2 inversés — corrigé ici.
Branche 21 commits ahead of origin/main. Aucun push effectué. Working tree propre après commit runner.
Fichiers non commités traités : runner ✓ commité ; app.json en attente (expo-font non utilisé — STOP).

## DÉCISIONS FIGÉES DE CETTE SESSION (non renégociables)

- **B9** : identité = paire Ed25519 générée on-device, clé privée en SecureStore jamais
  exportée, handle affiché `@{name}·{6 chars base32 du SHA-256 de la pubkey}`, AUCUNE
  blockchain/token/dépendance réseau, usages futurs documentés dans docs/IDENTITY.md uniquement.
- **B5** : le tier n'apparaît NULLE PART tant que CE côté n'a pas ouvert son reveal ;
  cinématique à la première ouverture, par side.
- **B6** : le picker de pass liste toutes les relations revealed avec `canonicalRelationId`,
  aucun filtre de score/tier.
- **B1** : en production, `me` s'initialise sur `BLANK_ME` (`isProfileSetup: false` →
  redirect `/me/edit?setup=1`) ; la purge boot détecte le seed par le handle
  `@yasmine.baobab` et préserve `internalAuthUserId`.
- **B2** : jamais de `finally` sur `setIsSaving` ; désactivation uniquement sur les branches
  d'erreur ; succès en setup mode → `router.replace('/(tabs)')`.
- **B3** : pattern clavier standard du projet — ScrollView : `keyboardShouldPersistTaps="handled"`
  + `onScrollBeginDrag={Keyboard.dismiss}` + `KeyboardAvoidingView` (behavior padding iOS /
  height Android) ; View simple : wrapper `Pressable onPress={Keyboard.dismiss}` + style `kav`.
- **B7** : le flux claim utilise `router.replace` (jamais `push`) et propage `fromClaim: '1'`
  jusqu'à evaluate ; toute sortie succès d'un flux claim atterrit sur `/(tabs)`.
- **B4** : le fix passera par des colonnes `display_name`/`handle` sur `user_public_profiles`
  synchronisées dans `upsert_user_handle`, exposées par `my_shared_relationships()` — pas de
  lecture directe côté client.

VÉRIFIÉ 2026-07-08 : aucune décision supplémentaire prise sur B5/B6/B8/B9 après la fin du
transcript. Les décisions ci-dessus sont complètes. app.json bloqué : expo-font ajouté en plugin
mais aucun import dans le code — attente de confirmation avant commit.

## SQL EN ATTENTE (verbatim)

**B8 — diagnostic doublons. STOP : Samo applique dans le SQL Editor et colle le résultat.**

```sql
-- B8 : détecter les doublons de claim
select
  relationship_id,
  count(*)                  as row_count,
  array_agg(status)         as statuses,
  min(created_at)::date     as first,
  max(created_at)::date     as last
from public.shared_relationship_reveals
group by relationship_id
having count(*) > 1
order by row_count desc;

-- Total global
select count(*), count(distinct relationship_id) as distinct_ids
from public.shared_relationship_reveals;
```

Vérification post-apply : lecture seule, aucune vérification de grant nécessaire.
Interprétation : `row_count > 1` sur un même `relationship_id` → doublon confirmé →
contrainte `UNIQUE(relationship_id)` absente → fix = contrainte SQL + client (bouton
disabled pendant claim). Le SQL du fix B4 (ALTER TABLE `user_public_profiles` +
CREATE OR REPLACE `upsert_user_handle` + `my_shared_relationships()`) sera écrit en une
seule passe après ce résultat — il n'est PAS encore rédigé, ne pas le régénérer de mémoire.

## PIÈGES CONNUS

Rencontrés dans cette session :
- Claude Code : `Update()` refuse d'éditer un fichier non lu ("File must be read first") —
  toujours `Read` avant `Update` sur un fichier pas encore ouvert dans la session.
- zsh : les chemins avec crochets (`app/place/edit/[id].tsx`) déclenchent le globbing
  ("no matches found") — toujours quoter les chemins dans les commandes bash.
- B7 : présenter un écran en modal puis `router.replace` depuis ce modal empile une nouvelle
  instance dans le stack principal au lieu de réutiliser l'existante.

Rappels permanents :
- Révoquer `anon` explicitement sur toute fonction recréée (3 incidents à ce jour).
- Le dequeue retente les `failed` — ne JAMAIS purger en marquant `failed` : `DELETE`.
- STOP avant tout SQL : Samo applique dans le SQL Editor, jamais l'assistant.
- Un prompt = une tâche.
- Preuve avant [DONE] (tests verts, sortie de commande, résultat SQL collé).
- Jamais de push sans demande explicite (exception : le push de ce handover est autorisé).
- Consigner tout changement SQL appliqué dans docs/SUPABASE-REGISTRY.md avec vérification
  de grants pre/post.

## PROCHAINE ACTION

Reprendre B8 : Samo exécute le diagnostic SQL ci-dessus dans le SQL Editor et colle le
résultat ; selon le résultat, écrire en une seule passe le fix SQL B8 (contrainte UNIQUE
+ client) puis le fix SQL B4 (déjà diagnostiqué). B5, B6, B9 restent à faire ensuite.

---
Clôture : après vérification des sections ⚠️, commit
`docs: session state handover (B1-B9)` + `git push origin main` (autorisé — sauvegarde),
confirmer le hash final et une working tree propre.
