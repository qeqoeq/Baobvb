# STATUS.md — Point de situation B25→B27

> Canal de lecture de l'auditeur. Mis à jour 2026-07-21. Le repo reste la source de vérité —
> ce document pointe vers commits/IDs, ne recopie pas de code.

---

## 1. Les commits du cycle B25→B27 (tous sur `main` = `origin/main`, working tree propre)

| # | Commit | Sujet | Type | État |
|---|---|---|---|---|
| 1 | `b71a5e2` | **B26** — re-sync foreground (`resyncSharedRelations`, throttle 45s + in-flight, **sans** réconciliation d'orphelins — arbitrage A) | app / OTA | ✅ publié |
| 2 | `85b6696` | **B25** — deep link résolu par `id \|\| canonicalRelationId` + machine 3 états (resolving→found/unavailable, grâce 8s) | app / OTA | ✅ publié |
| 3 | `acbea07` | **B27-app** — traduction FR directe du parcours critique (sans lib i18n), enum `Tier` intact → `lib/tier-display.ts` | app / OTA | ✅ publié |
| 4 | `a191151` | **B27-notifs** — fallbacks push FR (`notification-dispatch-runner:37-38` : « Ton lien est prêt » / « Ouvre Baobab pour le révéler ») | **serveur / Edge Function** | 🟠 **codé, NON déployé (STOP)** |
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

## 4. Deploy runner B27-notifs — **EN ATTENTE Samo (STOP maintenu)**

Le texte push FR vit dans l'Edge Function (hors bundle → **inatteignable par `eas update`**). Code prêt
(`a191151`), déploiement non effectué. Commande exacte à exécuter côté Samo :

```
supabase functions deploy notification-dispatch-runner --no-verify-jwt
```

**⚠️ Condition Verify JWT — à vérifier au dashboard AVANT et APRÈS le deploy.**
La fonction est appelée par le cron via l'en-tête `x-dispatch-secret` (**pas de JWT / pas d'`Authorization`**).
Il n'existe **aucune** section `[functions.notification-dispatch-runner]` dans `supabase/config.toml` qui
épinglerait `verify_jwt = false` → un deploy CLI sans le flag reprendrait le défaut `verify_jwt = true` et
**casserait tout dispatch cron en 401** (organe déjà réparé 2×). Deux garde-fous cumulés :

1. Le flag `--no-verify-jwt` sur la commande de deploy.
2. Confirmation manuelle au dashboard (Edge Functions → `notification-dispatch-runner` → Details) que
   **Verify JWT = OFF** une fois le deploy terminé.

Tant que ces deux points ne sont pas confirmés par Samo : **ne pas déployer**.

---

## 5. Prochaines actions Samo

1. **Décider** du deploy `notification-dispatch-runner` (cf. §4) — valider la commande + la condition Verify JWT.
2. Une fois déployé : smoke test d'une notif `reveal_ready` de bout en bout (le texte push doit arriver en FR).
3. Rappels permanents : latence notif 1–4 min = cron minute, **normale, ne pas fixer** ; tout SQL reste STOP.
4. Suite produit : onboarding testeurs externes (3–5). Invite-identity et picker/pass-signal restent **parkés**
   (`docs/PARKING.md`), hors périmètre Phase 0.

---

_Point de situation seul. Aucune modification de code de production ce prompt. Micro-OTA tiers = déjà fait
(session précédente) ; deploy runner = STOP, attente validation Samo._
