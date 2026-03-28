# Apple Developer Activation — Runbook opérationnel

État du repo au moment de la rédaction : `dc65cab` · working tree propre.

---

## AUDIT — État actuel du repo

### Ce qui est déjà en place

| Fichier | État | Note |
|---------|------|------|
| `app.json` → `ios.usesAppleSignIn` | `true` | Entitlement déclaré, sera injecté dans le build EAS |
| `app.json` → `ios.bundleIdentifier` | `"com.anonymous.baobab"` | **À changer** avant tout build réel |
| `app.json` → `scheme` | `"baobab"` | Deep link custom scheme opérationnel |
| `app.json` → `extra.eas.projectId` | `d2eb9dbc-c750-49fa-91f0-71f344213d63` | EAS déjà configuré |
| `eas.json` | présent | Profiles : `development`, `development-simulator`, `preview`, `production` |
| `expo-apple-authentication` | en `dependencies` | Package JS présent. Pas dans `plugins` — correct : `usesAppleSignIn: true` suffit pour l'entitlement |
| `lib/supabase-auth.ts` | complet | `signInWithApple()` → `supabase.auth.signInWithIdToken` → `onAuthStateChange` |
| `app/_layout.tsx` | complet | Auth gate unique, post-auth routing centralisé, aucune race condition |
| `app/auth/sign-in.tsx` | complet | Bouton custom (pas le bouton natif Apple UI) — pas de contrainte de design Apple |
| `lib/push-notifications.ts` | complet | `registerDevicePushTokenForCurrentUser` → RPC `register_device_push_token` |
| `supabase/functions/notification-dispatch-runner/` | déployable | Nécessite `DISPATCH_RUNNER_SECRET` dans les secrets EAS/Supabase |
| `.env.local` | présent | `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` présents |

### Ce qui est bloqué sans Apple Developer

| Fonctionnalité | Pourquoi bloqué |
|----------------|----------------|
| Sign in with Apple en production | Entitlement non signé sans compte actif |
| Push notifications APNs | Clé APNs (.p8) crée dans le portail Apple |
| Build EAS `development` / `preview` / `production` | Certificats iOS + provisioning profiles |
| TestFlight / App Store | Nécessite App ID enregistré |

---

## RUNBOOK 1 — Prérequis Apple Developer

### A. Créer le compte

1. Ouvrir `developer.apple.com` → s'inscrire → sélectionner le plan individuel ($99/an)
2. Attendre la validation Apple (email + 24-48h pour activation complète)
3. Vérifier que l'accès à `Certificates, Identifiers & Profiles` est débloqué

### B. Enregistrer l'App ID (bundle identifier)

1. Portail → `Identifiers` → `+` → App IDs → App
2. `Bundle ID` : choisir l'identifiant définitif, par exemple `com.baobab.app` (ou tout autre nom propre)
3. Capabilities à cocher **obligatoirement** sur cet App ID :
   - [x] **Sign In with Apple** (mode primaire)
   - [x] **Push Notifications**
4. Enregistrer

> Ce bundle ID est ce qui remplacera `"com.anonymous.baobab"` dans `app.json`.

### C. Créer la clé APNs

1. Portail → `Keys` → `+`
2. Cocher **Apple Push Notifications service (APNs)**
3. Télécharger le `.p8` — il ne peut être téléchargé qu'une seule fois
4. Noter : `Key ID` (10 caractères) + `Team ID` (visible dans le coin supérieur droit du portail)

### D. Préparer les identifiants Sign In with Apple pour Supabase

Pour la validation côté Supabase du flux `signInWithIdToken` (natif iOS) :
- **Bundle ID** (= App ID) : sera utilisé comme `client_id` dans la config Supabase Apple
- **Team ID**
- **Key ID** + contenu du `.p8`

---

## RUNBOOK 2 — Vérifications Supabase

Projet : `ejjrdvxxdidivfoqmwvf.supabase.co`
Tableau de bord : `app.supabase.com/project/ejjrdvxxdidivfoqmwvf`

### A. Activer le provider Apple

1. `Authentication` → `Providers` → `Apple` → Enable
2. Remplir :
   - **Service ID (Client ID)** : le bundle identifier choisi (ex. `com.baobab.app`)
   - **Secret Key** : coller le contenu du `.p8`
   - **Key ID**
   - **Team ID**
3. Sauvegarder → tester via `Authentication` → `Users` qu'aucune erreur n'apparaît

### B. Vérifier que les RPCs sont en place

Exécuter dans `SQL Editor` du dashboard :

```sql
-- Ces 5 RPCs doivent exister. Si une ligne est absente, la migration correspondante n'a pas été appliquée.
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'register_device_push_token',
    'get_or_create_public_profile_id',
    'my_shared_relationships',
    'dispatch_pending_notifications_batch',
    'claim_relationship_invite'
  )
order by routine_name;
```

Résultat attendu : 5 lignes.

Si des lignes manquent, appliquer les migrations dans l'ordre :
- `user_public_profiles.sql` → `get_or_create_public_profile_id`
- `shared_reveal_day6_claim_flow.sql` → `claim_relationship_invite`
- `shared_reveal_day7_notifications.sql` → `register_device_push_token` + `dispatch_pending_notifications_batch`
- `shared_reveal_day10_my_shared_relationships.sql` → `my_shared_relationships`

### C. Configurer la clé APNs dans Supabase (pour le dispatch push)

1. Dashboard → `Settings` → `Edge Functions` → `Secrets`
2. Ajouter :
   - `APNS_AUTH_KEY` : contenu du `.p8`
   - `APNS_KEY_ID` : Key ID (10 caractères)
   - `APNS_TEAM_ID` : Team ID
   - `APNS_BUNDLE_ID` : bundle identifier (ex. `com.baobab.app`)
   - `DISPATCH_RUNNER_SECRET` : générer une chaîne aléatoire (ex. `openssl rand -hex 32`) — **noter cette valeur**

### D. Déployer l'edge function

```bash
# Dans /Users/baobab/baobab
npx supabase functions deploy notification-dispatch-runner --project-ref ejjrdvxxdidivfoqmwvf
```

Tester manuellement :
```bash
curl -X POST \
  https://ejjrdvxxdidivfoqmwvf.functions.supabase.co/notification-dispatch-runner \
  -H "x-dispatch-secret: VOTRE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit": 1}'
# Réponse attendue : {"ok":true,"dispatched":0,...}
```

---

## RUNBOOK 3 — Vérifications Expo / app.json

### A. Changer le bundleIdentifier

Dans `app.json`, ligne 14 :
```json
"bundleIdentifier": "com.baobab.app"
```
Remplacer `com.anonymous.baobab` par le bundle ID enregistré dans le portail Apple.

> C'est le **seul changement obligatoire** dans `app.json` avant le premier build réel.
> `usesAppleSignIn: true` est déjà en place. `expo-apple-authentication` n'a pas besoin d'être dans `plugins`.

### B. Vérifier les variables d'environnement

Le fichier `.env.local` (déjà présent) doit contenir :
```
EXPO_PUBLIC_SUPABASE_URL=https://ejjrdvxxdidivfoqmwvf.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key actuelle>
```

Ces variables sont lues au runtime par `lib/supabase.ts`. Si elles manquent, l'app crashe au démarrage avant toute navigation.

### C. Se connecter à EAS

```bash
npx eas-cli login
# Vérifier que le compte connecté correspond au compte Apple Developer
npx eas-cli whoami
```

### D. Lier EAS au compte Apple

```bash
npx eas-cli credentials
# Sélectionner : iOS → Distribution certificate + Provisioning profile
# EAS peut créer les certificats automatiquement via l'API Apple
```

---

## CHECKLIST BUILD iOS

### Build development (device physique)

```bash
# 1. Vérifier que le bundle ID est correct dans app.json
grep bundleIdentifier app.json

# 2. Typecheck propre
npm run typecheck

# 3. Tests unitaires verts
npm test

# 4. Lancer le build EAS development
npx eas-cli build --platform ios --profile development
```

- EAS génère un `.ipa` installable via le lien QR ou `eas build:run`
- Durée : 10-20 minutes (build cloud EAS)
- Profil `development` crée un `developmentClient` (pas Expo Go) avec `distribution: internal`

### Build preview (distribution interne / TestFlight-like)

```bash
npx eas-cli build --platform ios --profile preview
```

- Distribution interne, installable via lien ad-hoc
- Pas soumis à App Store Review

### Vérifier que le build inclut les entitlements corrects

Après réception du build, dans le log EAS chercher :
```
com.apple.developer.applesignin = ["Default"]
aps-environment = development  (ou production)
```

Si ces lignes sont absentes → l'entitlement `usesAppleSignIn: true` n'a pas été pris en compte → vérifier `app.json`.

---

## CHECKLIST QA DEVICE

### Prérequis device

- iPhone physique avec la session Apple ID configurée dans `Réglages → Identifiant Apple`
- App installée depuis le build `development` ou `preview`
- Connecté au même réseau ou hors réseau (Supabase est cloud)

### QA-01 — Sign in with Apple (flux de base)

1. Ouvrir l'app → l'auth gate redirige vers `/auth/sign-in`
2. Taper `Continue with Apple`
3. La feuille native Apple Sign In apparaît
4. S'authentifier avec Face ID / Touch ID
5. **Attendu** : feuille disparaît, app navigue vers `/(tabs)` (Garden)
6. **Vérifier** : `Authentication → Users` dans Supabase dashboard affiche un nouvel utilisateur avec provider `apple`

### QA-02 — Provisionnement public profile

Immédiatement après QA-01, sans action :
- **Attendu** : aucun crash, aucun message d'erreur visible
- **Vérifier** dans Supabase : `select * from public_profiles limit 5` → une ligne avec l'`auth_user_id` correspondant au nouvel utilisateur

### QA-03 — Bootstrap shared relationships

Immédiatement après QA-01, sans action :
- **Attendu** : l'appel RPC `my_shared_relationships` s'exécute en arrière-plan (best-effort, silencieux)
- Si l'utilisateur a déjà des relations partagées, elles apparaissent dans le Garden

### QA-04 — Push notification permission

Après QA-01 (premier lancement authentifié) :
- **Attendu** : la popup système `"Baobab souhaite vous envoyer des notifications"` apparaît
- Accepter → `register_device_push_token` s'exécute
- **Vérifier** : `select * from device_push_tokens` → une ligne avec le token Expo de ce device

### QA-05 — Deep link invite (utilisateur A → utilisateur B)

**Utilisateur A (déjà authentifié, a une relation avec invite) :**

1. Dans la relation, générer le lien d'invitation (`baobab://invite/<RELATION_ID>?token=<TOKEN>`)
2. Partager ce lien (AirDrop, message, etc.)

**Utilisateur B (non authentifié, device différent) :**

1. Ouvrir le lien `baobab://invite/<RELATION_ID>?token=<TOKEN>`
2. **Attendu** : app ouvre, auth gate détecte l'URL invite, redirige vers `/auth/sign-in` avec `redirectPath=/invite/[relationId]` + `relationId` + `token` préservés dans les params
3. S'authentifier via Apple Sign In
4. **Attendu** : post-auth, l'auth gate navigue vers `/invite/[relationId]` avec les params intacts
5. Sur l'écran invite → `Add my side`
6. **Attendu** : si identité absente → `/invite/identity/[relationId]` ; si identité présente → claim immédiat → `/relation/evaluate/[id]`

### QA-06 — Reveal flow complet

1. Utilisateur A et B ont tous deux complété leur lecture privée
2. La relation passe en `reveal_ready`
3. **Attendu** : notification push envoyée à l'utilisateur en attente (via `notification-dispatch-runner`)
4. Appuyer sur la notification → app ouvre `/relation/[id]` correct
5. Ouvrir le reveal → score mutuel + tier affichés

### QA-07 — Reconnexion / reprise de session

1. Forcer la fermeture de l'app (`double appui home → swipe`)
2. Rouvrir
3. **Attendu** : `getCurrentAuthenticatedUser()` → session récupérée depuis AsyncStorage → auth gate ne redirige pas vers sign-in → Garden visible immédiatement

---

## SIGNES DE SUCCÈS

| Signal | Où le voir |
|--------|-----------|
| Feuille Apple Sign In apparaît sur device | Écran physique |
| Nouvel utilisateur avec provider `apple` | Supabase → Authentication → Users |
| Ligne dans `public_profiles` | Supabase SQL Editor |
| Token dans `device_push_tokens` | Supabase SQL Editor |
| Navigation vers `/(tabs)` sans boucle de redirect | App sur device |
| `npm run check:invite-claim-flow` passe | Terminal |
| `npm run check:shared-reveal-flow` passe | Terminal |
| `npm test` 96 tests verts | Terminal |

---

## SIGNES D'ÉCHEC

### Échec : `"Sign in with Apple is not available on this device."`

- Source : `lib/supabase-auth.ts:28`
- Cause : `AppleAuthentication.isAvailableAsync()` retourne `false`
- Regarder : l'Apple ID est-il configuré dans les Réglages du device ? L'entitlement `com.apple.developer.applesignin` est-il dans le build ? Vérifier les logs EAS build.

### Échec : `"Apple Sign In failed (simulator). Sign in to an Apple ID..."`

- Source : `lib/supabase-auth.ts:55-58`
- Cause : simulator sans Apple ID configuré (ou entitlement manquant)
- Regarder : utiliser un device physique pour ce test. Le simulateur est insuffisant pour valider Apple Sign In en production.

### Échec : `"Apple did not return an identity token."`

- Source : `lib/supabase-auth.ts:66`
- Cause : Apple a retourné des credentials sans `identityToken` — cas rare, lié à une interruption réseau ou un bug du framework
- Action : relancer. Si persistant, vérifier que le bundle ID dans `app.json` correspond exactement à l'App ID Apple enregistré.

### Échec : Supabase retourne une erreur sur `signInWithIdToken`

- Source : `lib/supabase-auth.ts:73`
- Cause : le provider Apple n'est pas configuré dans Supabase, ou le `client_id` (bundle ID) ne correspond pas
- Regarder : Supabase → Authentication → Providers → Apple → vérifier que le champ "Service ID" contient exactement le même bundle ID que `app.json`

### Échec : push permission accordée mais `register_device_push_token` échoue

- Source : `lib/push-notifications.ts:86`
- Cause possible 1 : `EXPO_PUBLIC_PROJECT_ID` absent → vérifier `.env.local` et `app.json → extra.eas.projectId`
- Cause possible 2 : RPC `register_device_push_token` absente → appliquer `shared_reveal_day7_notifications.sql`
- Regarder : Metro / console logs, `device_push_tokens` vide dans Supabase

### Échec : notification push jamais reçue après reveal

- Source : `notification-dispatch-runner` edge function
- Cause possible 1 : `DISPATCH_RUNNER_SECRET` non configuré dans les secrets Supabase
- Cause possible 2 : `APNS_AUTH_KEY` / `APNS_KEY_ID` / `APNS_TEAM_ID` / `APNS_BUNDLE_ID` manquants
- Cause possible 3 : edge function non déployée
- Regarder : Supabase → Edge Functions → `notification-dispatch-runner` → logs ; `notification_outbox` → colonnes `status`, `last_error`

### Échec : deep link préserve le `relationId` mais l'écran invite affiche une erreur `"claim failed"`

- Source : `app/invite/[relationId].tsx:95`
- Cause : token expiré ou déjà utilisé
- Action : générer un nouveau token d'invitation côté utilisateur A

### Échec : boucle de redirect entre auth gate et sign-in

- Source : `app/_layout.tsx`
- Cause : `isAuthenticated` oscille (session expirée côté Supabase ou token révoqué)
- Regarder : `onAuthStateChange` events dans Metro ; `Authentication → Users` dans Supabase — vérifier que la session est valide

### Échec : `get_or_create_public_profile_id` retourne une erreur silencieuse

- Source : `app/_layout.tsx:153-158`
- Cause : RPC absente (migration `user_public_profiles.sql` non appliquée)
- Conséquence : `publicProfileId` reste null, QR code reste en mode v1 — non bloquant pour le MVP
- Regarder : `console.warn` dans Metro en `__DEV__`

---

## PROCHAINS SPRINTS APRÈS VALIDATION AUTH

Ces sprints sont ordonnés par dépendance fonctionnelle. Chaque sprint ne démarre qu'une fois le précédent entièrement validé sur device.

### Sprint A — Validation du pipeline complet invite → reveal (priorité maximale)

**Condition d'entrée** : QA-01 et QA-05 passent sur deux devices distincts.

1. Test invite A→B de bout en bout avec deux comptes Apple réels
2. Test reveal complet : les deux côtés ont une lecture → notification → score mutuel visible
3. Valider que `claim_relationship_invite` est idempotent (cliquer deux fois sur "Add my side")
4. Valider la gestion d'un token expiré (message d'erreur correct, bouton "Try again" fonctionnel)

### Sprint B — Validation push end-to-end

**Condition d'entrée** : Sprint A validé + APNs configuré dans Supabase.

1. Déclencher un reveal → vérifier que `notification_outbox` passe à `sent`
2. Device en background → notification reçue → tap → ouverture de `/relation/[id]` correct
3. Device cold start (app tuée) → tap sur notification → `getLaunchRelationIdFromLastNotification` → navigation correcte
4. Vérifier `next_attempt_at` et retry logic dans `notification_outbox` (Day 8)

### Sprint C — QR / scan sur device physique

**Condition d'entrée** : Sprint A validé.

1. Générer le QR depuis `me/qr` → vérifier que `publicProfileId` est dans l'URL
2. Scanner avec `me/scan` depuis un autre device → déduplication correcte (pas de doublon si relation existe)
3. Résolution de l'identité partagée après scan

### Sprint D — Gestion de session multi-device

1. Se connecter sur device A, puis device B avec le même compte Apple
2. Vérifier que les deux devices ont leur propre `device_push_tokens` entry
3. Tuer l'app sur device A → révocation de session → vérifier que device B est non affecté
4. Vérifier la reconvergence du store local après `fetchMySharedRelationships` sur nouveau device

### Sprint E — Préparation TestFlight

**Condition d'entrée** : Sprints A + B + C validés.

1. Changer `bundleIdentifier` en valeur définitive si pas encore fait
2. Build `preview` → distribuer à 2-3 testeurs internes
3. Vérifier que Sign in with Apple fonctionne en distribution interne (profil ad-hoc)
4. Valider les logs de crash (pas de Xcode requis : EAS Crash Reporting ou Sentry)
5. Build `production` → soumettre à TestFlight (groupe interne)

### Sprint F — Identité et profil (non bloquant pour les sprints A-E)

1. Finaliser le flux `invite/identity/[relationId]` — test de l'arrivée sans identité configurée
2. Valider que `me/edit` met à jour l'identité persistée et que les invites futures reflètent la mise à jour
3. Décider du `bundleIdentifier` final et aligner `publicProfileId` QR si le schéma v2 est nécessaire

---

*Document généré sur base de l'état du repo `dc65cab`. Pas de commit.*
