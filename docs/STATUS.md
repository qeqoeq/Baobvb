# STATUS.md — Cycle B25→B27 **CLOS** (2026-07-21)

> Canal de lecture de l'auditeur. Mis à jour 2026-07-21. Le repo reste la source de vérité —
> ce document pointe vers commits/IDs, ne recopie pas de code.
>
> **Cycle B25→B27 clos** : les 3 fixes app OTA sont en prod, les mots de tiers FR sont livrés,
> et le deploy serveur B27-notifs est **fait et vérifié** (voir §4). Plus aucune tâche en attente Samo
> sur ce cycle.

---

## 1. Les commits du cycle B25→B27 (tous sur `main` = `origin/main`, working tree propre)

| # | Commit | Sujet | Type | État |
|---|---|---|---|---|
| 1 | `b71a5e2` | **B26** — re-sync foreground (`resyncSharedRelations`, throttle 45s + in-flight, **sans** réconciliation d'orphelins — arbitrage A) | app / OTA | ✅ publié |
| 2 | `85b6696` | **B25** — deep link résolu par `id \|\| canonicalRelationId` + machine 3 états (resolving→found/unavailable, grâce 8s) | app / OTA | ✅ publié |
| 3 | `acbea07` | **B27-app** — traduction FR directe du parcours critique (sans lib i18n), enum `Tier` intact → `lib/tier-display.ts` | app / OTA | ✅ publié |
| 4 | `a191151` | **B27-notifs** — fallbacks push FR (`notification-dispatch-runner:37-38` : « Ton lien est prêt » / « Ouvre Baobab pour le révéler ») | **serveur / Edge Function** | ✅ **déployé en prod (21/07)** |
| 5 | `914e1bb` | docs — clôture B25-B27, arbitrages A/B/C, PARKING invite-identity + tier words | docs | ✅ |
| 6 | `bb20f64` | **B27-tiers** — `TIER_DISPLAY_FR` rempli avec les mots de marque validés | app / OTA | ✅ publié |
| 7 | `292f8e4` | docs — tier words filled + completion micro-OTA | docs | ✅ |

---

## 2. OTA publiés (branch `production`, runtime `1.0.0`, iOS)

| Contenu | Update group | iOS update | Commit |
|---|---|---|---|
| Fixes B25 / B26 / B27-app | `ca43dd0b-2fd0-429b-9e67-61111ef50179` | `019f81ad-773d-7841-87e4-20ea2fd2df19` | `acbea07` |
| Complétion mots de tiers FR | `ca5238ca-3969-4b21-97ea-5b27b5c4e7e5` | `019f81b4-d374-7822-87ea-ede00ab56663` | `bb20f64` |

tsc 0 · vitest 1127/1127 aux deux publications.

---

## 3. Mots de tiers FR — **FAIT**

`lib/tier-display.ts` (vérifié ce jour) — mapping à la couche d'affichage uniquement, enum inchangé :

```
Rooted → Enraciné   Anchor → Pilier   Steady → Stable   Active → Vivant
Forming → Naissant  Distant → Distant  Legend → Légende
```

Surfaces de rendu de tier vérifiées exhaustives : carte de reveal (`relation/[id]`) + lexique, toutes deux
routées par `getTierDisplayLabel`. `badgeLabel`/`getVisibleTierLabel` non consommés ; EgoGraph = géométrie
d'orbite ; garden = readingStatus + micro-signaux. Aucun test ne matche les libellés FR. Commit `bb20f64`,
micro-OTA `019f81b4-d374-7822-87ea-ede00ab56663`. **Rien à refaire.**

---

## 4. Deploy runner B27-notifs — ✅ **FAIT ET VÉRIFIÉ (2026-07-21)**

Le texte push FR vit dans l'Edge Function (hors bundle → **inatteignable par `eas update`**). Déployé en prod
côté Samo, commit `a191151`. Commande exécutée :

```
supabase functions deploy notification-dispatch-runner --no-verify-jwt
```

**Preuve :**
- Verify JWT confirmé **OFF** au dashboard **avant** le deploy.
- Deploy avec `--no-verify-jwt` **réussi**.
- Smoke test `curl` → `{"ok":true}`.
- Cron en **200 sur 3 cycles consécutifs** (18:23–18:25 UTC).

**Règle consignée** (`docs/SUPABASE-REGISTRY.md`, section « Edge Functions — règles de deploy » + Journal 21/07) :
`--no-verify-jwt` est **obligatoire pour tout futur deploy** de cette fonction. La fonction est appelée par le
cron via `x-dispatch-secret` (pas de JWT) ; aucune section `[functions.notification-dispatch-runner]` dans
`config.toml` n'épingle `verify_jwt = false` → un deploy nu reprendrait le défaut `true` et casserait le cron
en 401 (organe déjà réparé 2×). Vérification dashboard Verify JWT = OFF à refaire à chaque deploy.

---

## 5. Prochaines actions

Cycle B25→B27 **clos** — plus aucune tâche technique en attente sur ce cycle.

1. **Terrain** : Sou relance l'app (FR + premier reveal « Légende » l'attend dans les Reveals) → recueillir sa
   réaction verbatim (premier reveal d'une vraie utilisatrice, dans sa langue, avec un mot de marque = la donnée
   produit la plus précieuse générée à ce jour). Ses 3 autres invitations WhatsApp restent à partir.
2. E2E notif FR à confirmer opportunément quand une vraie `reveal_ready` retombe sur les fallbacks (texte FR).
3. Rappels permanents : latence notif 1–4 min = cron minute, **normale, ne pas fixer** ; tout SQL reste STOP.
4. Suite produit : onboarding testeurs externes (3–5). Invite-identity et picker/pass-signal restent **parkés**
   (`docs/PARKING.md`), hors périmètre Phase 0.

---

_Cycle B25→B27 clos 2026-07-21 : 3 fixes app OTA en prod, mots de tiers FR livrés, deploy serveur B27-notifs
fait et vérifié (curl ok + cron 200×3). Rien en attente Samo sur ce cycle._
