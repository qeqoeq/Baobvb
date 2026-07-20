# SESSION-STATE.md — CLÔTURE DE CYCLE B1→B24

> Document de clôture. Le repo est la source de vérité — ce document POINTE vers commits/fichiers,
> il ne recopie jamais de code. Cycle ouvert au smoke test build 27, clos au build 31 + OTA (2026-07-12).

---

## 0. MISE À JOUR 2026-07-21 — cycle B25→B27 (post première testeuse externe)

Première session testeuse externe réelle (Sou, @sounj, 20/07) : serveur 100 % vert
(relation `c41ab40b…`, revealed, mutual_score=90). Trois défauts client → diagnostic
`docs/DIAG-B25-B27.md`, corrigés dans l'ordre B26→B25→B27, **tous OTA sauf B27-notifs**.

- **B26** `b71a5e2` — re-sync foreground (`lib/resync-shared-relations.ts` : throttle 45s + in-flight, **sans** `reconcileOrphanedSharedRelations`), AppState 'active' + RefreshControl (garden/reveals) + useFocusEffect (fiche). L'app ne reste plus « sourde » entre deux relances.
- **B25** `85b6696` — deep link notif résolu par `id || canonicalRelationId` (fiche + `getRelationSnapshotById`) + machine 3 états (resolving→found/unavailable, grâce 8s) : plus jamais « Relationship unavailable » sec au tap de la notif.
- **B27-app** `acbea07` — traduction FR directe du parcours critique (sans lib i18n). Enum `Tier` intact, mappé à l'affichage via `lib/tier-display.ts`.
- **B27-notifs** `a191151` — fallbacks push FR (`notification-dispatch-runner:37-38`). **Non déployé** (STOP).

**OTA** : branch `production`, runtime `1.0.0`, iOS — update group `ca43dd0b-2fd0-429b-9e67-61111ef50179` / iOS update `019f81ad-773d-7841-87e4-20ea2fd2df19` (commit `acbea07`). tsc 0, vitest 1127/1127.

**Arbitrages Samo (2026-07-20)** figés :
- **A** — B26 re-sync foreground **sans** réconciliation d'orphelins ; l'archivage d'orphelins reste **cold-start uniquement** (un resync sur réseau instable ne doit jamais archiver).
- **B** — B27-notifs = **sous-tâche serveur séparée** avec STOP (pas parkée) ; le texte push vit dans l'Edge Function, hors bundle OTA.
- **C** — traduction FR **directe, sans lib i18n**. Noms de tiers = enum load-bearing → couche d'affichage FR (`getTierDisplayLabel`), **mots de marque fournis par Samo** (non devinés).

**En attente Samo** :
1. Les 7 mots de marque des tiers (Rooted/Anchor/Steady/Active/Forming/Distant + Legend côté serveur) → remplir `TIER_DISPLAY_FR` dans `lib/tier-display.ts` (fallback EN en attendant) → **micro-OTA de suivi**.
2. Validation de la commande `supabase functions deploy notification-dispatch-runner` pour B27-notifs — **attention `verify_jwt`** : la fonction est appelée par le cron via `x-dispatch-secret` (pas de JWT), redéployer sans préserver ce réglage la casserait (organe réparé 2×).

**PARKING ajouté** : « Invite claimable par n'importe quel porteur du lien (pas de vérification d'identité au claim) — écran de confirmation d'identité, décision produit post-retours testeurs (constat Sou 20/07). »
Note : latence notification 1–4 min = cron minute, **normale, ne pas fixer**.

---

## 1. BILAN — cycle B1→B24 terminé

**24 bugs résolus avec preuve** (tsc 0 + suite verte à chaque commit, 1106/1106 en fin de cycle).

- **5 builds** : 27 (départ) → 28 → 29 → 30 → **31** (dernière base obligatoire, embarque le runtime OTA).
- **3 déploiements OTA** (zéro build consommé, channel `production`, runtime `1.0.0`) :
  - B22 — `38c1d563` (pass restored + status resync)
  - B23 — `f254ae16` (permanent navigation)
  - B24 — `9f1e2935` (cascade name on all remaining surfaces)
- **2 purges de base** : 142 comptes fantômes supprimés (résidus mars + orphelins `1eadf1cc`/`9f083ff3`), cascade manuelle ; **état final 2 users / 2 profils / 3→4 reveals** (voir SUPABASE-REGISTRY).
- **Pipeline notifications ressuscité** : rotation `DISPATCH_RUNNER_SECRET` + recréation cron jobid 2 → 401 corrigé, dispatch E2E vert.
- **Racine d'identité traitée** : découplage session Supabase (AsyncStorage) ↔ MeProfile ↔ privkey Keychain → **réconciliation R1+R2** (`reconcileHandleOwnership`) + **écran `/identity/conflict`** (jamais de logout muet).
- **Fondation EAS Update opérationnelle** : `expo-updates` + `runtimeVersion.policy=appVersion` + `channel=production` (`d77f941`). Tout fix JS-only part désormais en OTA.

### Table des bugs (résumé — détail dans l'historique git)

| Bug | Sujet | Commit(s) |
|---|---|---|
| B1 | Seed "me" en prod → BLANK_ME | `9788cb0` |
| B2 | Bouton Start silencieux | `d3d3bf6` |
| B3 | Clavier non dismissible (pattern global) | `aa6c580` `eb4ee6d` |
| B4 | Counterpart name (SQL + client) | `d0d2b54` `d6c689e` |
| B5 | Tier visible avant reveal (gate firstViewedAt) | `e7b212f` |
| B6 | Picker de pass filtré (canonicalRelationId) | `301078a` |
| B7 | Back incorrect post-claim | `3a87c94` |
| B8 | Doublons de claim (UNIQUE constraint) | `d0d2b54` |
| B9 | Identité Ed25519 + suffixe | `a19506f` |
| B10 | Reveal not ready (précédence Fix A/B) | `402503a` |
| B11 | Nom absent / '(shared)' + racine identités orphelines (Volets A/B/C) | `28d8d35` `4643337` `3228ac4` |
| B12 | Double écran invite (deep link) | `53767df` |
| B13 | Scroll leak (overlay écran) + countdown (preuve, pas de bug) | `841be6d` `0b162d6` |
| B14 | Push token réinstall — **dissous par la purge** (résidu 3-tokens bénin) | — |
| B15 | Handle gelé post-setup (client + SQL) | `5cdeaf8` + `b15_handle_freeze.sql` |
| B16 | Suffixe null Hermes (SHA-512 pur-JS câblé) | `ac9cb7e` |
| B17 | Fantômes "(shared)" purgés → archivage réconcilié | `e770e51` |
| B18 | Nom dominant sur la carte de reveal | `cb499e8` |
| B19 | Espace reveal Ready+Waiting + atterrissage post-save | `7ca17ff` |
| B20 | Archivés exclus de graph/compteur/gateways/lexique | `1f96296` |
| B21 | Plus jamais "(shared)" → handle / « Invitation pending » | `5e1705d` |
| B22 | Re-sync statut au bootstrap + pass jamais masqué (OTA) | `d6f6098` |
| B23 | Navigation primaire permanente (OTA) | `2aad445` |
| B24 | Nom cascade sur toutes les surfaces restantes (OTA) | `ad07123` |

---

## 2. ÉTAT

- **Build 31 + OTA `9f1e2935` (B24) à jour sur les deux devices.** `main` = `origin/main`, working tree propre.
- **Base saine** : 2 users / 2 profils légitimes (`display_name` non-null), reveals cohérents, cron notifications actif.
- **Smoke test final vert** : notification simple confirmée (device), navigation permanente OK, noms cascade partout, pass restauré.
- **B14** : résidu **3 tokens actifs par compte** (enregistrements successifs jamais désactivés) → **bénin, surveillance seulement** (risque théorique de doublon/token mort ; aucun impact observé). Pas de ticket ouvert.
- **B13-countdown** : pas de bug (preuve C1-C4) ; observation passive.

---

## 3. DÉCISIONS FIGÉES (cumulées sur le cycle)

- **D1 — Nom visible** : le nom du counterpart s'affiche partout dès qu'il est connu, y compris pré-reveal ; seuls tier/score/lecture restent gated par `firstViewedAt` (B5). Cascade unique `privateLabel ?? counterpartDisplayName ?? name` (`getNormalizedPrivateLabel`), jamais "(shared)"/"Private link" surfacé (B21/B24).
- **D2 — Handle gelé** : le handle est immuable après le setup initial ; seul `displayName` reste éditable. Re-publication à l'identique autorisée (idempotence, `reconcileHandleOwnership`). Garde client + SQL `handle_frozen`.
- **Navigation permanente** : aucune surface de navigation ou fonctionnalité primaire ne disparaît quand son compteur est à zéro — état vide explicite ou badge, jamais l'absence (B19/B22/B23). Inscrit dans `CLAUDE.md` § Conventions UI.
- **Pass = action, pas révélation** : l'éligibilité du pass est sur le statut **`revealed`** (mutuel serveur eu lieu), pas sur `firstViewedAt` local (B6/B22).
- **Doctrine intacte** : mutual reveal obligatoire avant tout score ; décisions récepteur strictement locales ; `sourceRelationId` jamais envoyé ; le pass ne touche jamais le score mutuel.

---

## 4. PARKING actif (`docs/PARKING.md`)

- **Picker dynamique + pass-as-signal** — spec `docs/PASS-SIGNAL-SPEC.md` (boucle scores→suggestions→pass→évidence). Phase 1 récence+catégorie (local), Phase 2 bayésien.
- **QR one-tap/swipe** (montrer + scanner en un geste) — UX Phase 1.
- **Polish barre de navigation** (B23) — chantier design.
- **expo-font / design bible Jardin de Nuit** — conditionné au chantier design.
- Scan : pré-remplir le nom depuis `display_name` résolu.
- (optionnel) critère de purge élargi `display_name IS NULL OR btrim()=''` ; signal opt-in agrégé pour l'apprentissage inversé.

---

## 5. PROCHAINE ACTION

**Onboarding des premiers testeurs externes (3-5), TestFlight groupe dédié.**
Le chantier design **Jardin de Nuit** est conditionné à leurs retours — on écoute avant de peaufiner.

Rappels opérationnels : fixes JS → **OTA** (`eas update --channel production --platform ios`), zéro build ;
tout SQL reste **STOP** (Samo applique + consigne SUPABASE-REGISTRY) ; jamais de push/commit sans demande.

---
Cycle B1→B24 clos — 2026-07-12. Sessions : B1–B9 (build 28), B10–B16 (build 29), B17–B19 (build 30), B20–B24 (build 31 + 3 OTA).
