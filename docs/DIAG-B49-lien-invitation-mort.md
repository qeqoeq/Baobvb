# DIAG-B49 — Le lien d'invitation ne mène nulle part (LECTURE SEULE, URGENT)

> Diagnostic seul. Aucun correctif. Chaque réponse porte `fichier:ligne` ou « NON PROUVÉ ».

**Terrain (13/08, 2 témoins/24 h)** : réception d'un `https://getbaobab.app/invite/<uuid>?token=<...>` → ouverture → page **« Un espace privé vous attend »** + bouton **« Continuez en privé »** → tap → **rien** (« je peux rien faire d'autre » / « quand je click sa fait rien »). Page en **anglais** pour l'un, **français** pour l'autre.

**Verdict court** : la page vue est une **page web externe** (hors repo). Le lien `https://` **n'ouvre pas l'app** car les Universal Links ne sont **pas fonctionnels** (AASA non hébergé, **parké Phase 1**), et les destinataires **n'ont pas l'app** (Phase 0 = TestFlight uniquement, pas d'App Store public). Le bouton n'a donc **aucune destination valide**.

---

## 1. Où vit la page `getbaobab.app/invite` ?

**PAS dans ce repo.** Les chaînes « Un espace privé vous attend » et « Continuez en privé » sont **absentes** du repo (grep sur `app/`, `components/`, `lib/`). C'est une **page web externe** hébergée sur `getbaobab.app`, dont le code (HTML/JS) n'est pas dans ce dépôt.

Ce que le repo sait d'elle :
- Il **construit** cette URL : `lib/relationship-invite.ts:22` → `https://getbaobab.app/invite/${relationId}?token=${token}` (en prod ; en `__DEV__` c'est `Linking.createURL(...)`, `:20`).
- Il **sait la parser** comme deep link : `lib/parse-invite-deep-link.ts:17,38`.
- Il **déclare le domaine** pour Universal Links : `app.json:22-23` `"associatedDomains": ["applinks:getbaobab.app"]`.

L'écran **in-app** d'arrivée (`app/invite/[relationId].tsx`) est un écran distinct (React Native), **pas** cette page web — ses libellés (« Tu as ouvert ta propre invitation », `:79`…) ne correspondent pas au terrain.

---

## 2. Que fait le bouton « Continuez en privé » ?

**Code NON accessible** (page web hors repo). Depuis le repo, on sait seulement ce que l'app **s'attend** à recevoir — le parseur accepte trois formes (`parse-invite-deep-link.ts:16-19`) :
- `baobab://invite/{relationId}?token={token}` (scheme custom, `app.json:8`)
- `com.samo.baobab://invite/{relationId}?token={token}`
- `https://getbaobab.app/invite/{relationId}?token={token}` (universal link)

Le bouton tente vraisemblablement l'une de ces formes (probablement le scheme `baobab://` ou re-charger l'universal link), **mais** :
- `baobab://…` n'ouvre l'app **que si elle est installée** ;
- `https://getbaobab.app/…` ne rouvre l'app **que si les Universal Links marchent** (voir §4).
**NON PROUVÉ** exactement quelle cible le bouton utilise (page externe).

---

## 3. Que se passe-t-il si l'app N'EST PAS installée ?

**Aucun repli côté repo.** Toute la gestion de deep link du repo (`_layout.tsx:381-428`) ne s'exécute **qu'à l'intérieur de l'app installée**. Pour un destinataire sans l'app, seule la **page web externe** décide — et :
- **Pas d'App Store public** : l'app est en **Phase 0 / TestFlight** (`eas.json:20-24` a un profil `production` `distribution: "store"`, mais l'app n'est **pas publiée** sur l'App Store ; TestFlight exige une invitation). Il n'existe donc **aucun lien d'installation grand public** vers lequel renvoyer.
- `PARKING.md:8` confirme la doctrine actuelle : « scheme `baobab://` suffit **pour TestFlight** » → le lien ne « marche » que pour quelqu'un qui a **déjà** le build TestFlight.

Conséquence : pour un invité sans l'app, « Continuez en privé » **échoue silencieusement** (tente un scheme/universal link sans app derrière, ou n'a nulle part où aller). C'est exactement « je peux rien faire d'autre ». **NON PROUVÉ** ce que fait précisément le bouton web, mais le repo prouve qu'il n'y a **aucune app publique à installer**.

---

## 4. Universal Links configurés ? AASA ? Entitlement ? Build 32 ?

- **Entitlement `associated domains`** : **OUI dans le repo et dans le build 32.** `app.json:22-23` `"associatedDomains": ["applinks:getbaobab.app"]`, et `git show 8cd688b:app.json` (build 32) le contient déjà.
- **Fichier `apple-app-site-association`** : **ABSENT du repo** (aucun `apple-app-site-association`, aucun `.well-known/`). Il devrait être **servi** à `https://getbaobab.app/.well-known/apple-app-site-association` — hébergement **externe**, non vérifiable depuis le repo.
- **Statut réel** : `PARKING.md:8` (2026-07-03) — « **AASA / Universal Links** (scheme `baobab://` suffit pour TestFlight) | **En attente Phase 1** ». → Les Universal Links sont **parkés/non finalisés** : l'entitlement est déclaré, mais l'**AASA n'est (vraisemblablement) pas hébergé**. Sans les **deux** côtés (entitlement **et** AASA servi), iOS n'associe pas le domaine.

**Conclusion** : `https://getbaobab.app/invite/…` **n'ouvre pas l'app** → il ouvre la **page web** dans le navigateur. C'est la cause directe du terrain. **NON PROUVÉ** au niveau repo que l'AASA n'est pas servi (le confirmer avec `curl https://getbaobab.app/.well-known/apple-app-site-association`), mais le PARKING + l'absence de fichier le rendent hautement probable.

---

## 5. D'où vient le choix FR/EN de la page ?

**De la page web externe, hors repo.** La bascule FR/EN pour l'un vs l'autre relève d'une logique de **localisation côté site** (typiquement l'`Accept-Language` / la langue de l'OS/navigateur du destinataire). Ce n'est **pas** contrôlé par ce dépôt. **NON PROUVÉ** ici. (À titre de contraste : l'écran **in-app** d'arrivée est majoritairement FR — `invite/[relationId].tsx:79,86,93…` — avec un unique fallback EN `:39` ; mais ce n'est pas la page vue au terrain.)

---

## 6. Ce que reçoit l'app quand elle EST installée et qu'on ouvre le lien

Chemin (uniquement si le lien parvient à ouvrir l'app — voir §4) :
1. **Capture** : `Linking.getInitialURL()` (démarrage à froid, `_layout.tsx:421`) et `Linking.addEventListener('url', …)` (à chaud, `:427`) → `route(url)` (`:385`).
2. **Parse** : `parseInviteDeepLink(url)` (`:392`) — exige **relationId ET token** (`parse-invite-deep-link.ts:57`), sinon `null`.
3. **Navigation** : `router.replace({ pathname: '/invite/[relationId]', params:{ relationId, token } })` (`_layout.tsx:417`). (En prod, le linking natif d'expo-router route aussi la même URL ; le handler manuel est un repli dev-client, cf. commentaire `:397-401`.)
4. **Auth gate** : si non connecté → redirection sign-in avec `redirectPath` (`:95-160`), puis retour vers l'arrivée invite.
5. **Claim** : écran `invite/[relationId].tsx` → `claimRelationshipInviteForCurrentUser(token)` (`:12`, RPC `claim_relationship_invite`, `reveal-shared-repo.ts:90`).

⚠️ Ce chemin **ne se déclenche pas** au terrain, car l'étape 0 (le lien ouvre l'app) échoue : Universal Links non fonctionnels **et/ou** app non installée.

---

## Hypothèses classées (avec l'observation terrain qui la confirmerait)

**H1 — Aucune distribution publique + Universal Links non fonctionnels. RANG : LE PLUS PROBABLE (cause structurelle).**
Les destinataires sont de **nouveaux utilisateurs sans l'app** ; l'app est **TestFlight-only** (Phase 0, pas d'App Store public — `eas.json:20-24`, aucune release publique). Les Universal Links sont **parkés** (`PARKING.md:8`) : entitlement présent (`app.json:22`, build 32) mais **AASA non hébergé** → le lien https ouvre la **page web**, dont le bouton n'a **aucune cible valide** sans app installée. Colle aux deux témoins (« je peux rien faire d'autre »).
*Confirme si* : (a) aucun des deux témoins n'avait l'app/TestFlight ; (b) `curl https://getbaobab.app/.well-known/apple-app-site-association` → 404/JSON invalide ; (c) l'app est introuvable sur l'App Store ; (d) le même lien « marche » sur un appareil ayant **déjà** le build TestFlight.

**H2 — Universal Links ne se déclenchent pas depuis le navigateur intégré de WhatsApp. RANG : HAUT (renforce H1).**
Le lien est reçu via WhatsApp (contexte B48) → ouvert dans la **webview intégrée** de WhatsApp, où iOS **ne déclenche pas** les Universal Links (ils ne partent que de Safari / certains contextes). → page web → cul-de-sac, **même** pour un hypothétique utilisateur ayant l'app.
*Confirme si* : ouvrir le **même** lien depuis **Safari** (pas WhatsApp) sur un appareil ayant l'app ouvre l'app ; un **appui long** sur le lien propose « Ouvrir dans Baobab ».

**H3 — La page web externe (bouton) est cassée/mal configurée. RANG : MOYEN.**
Page + bouton **hors repo** → non inspectables ici. Même si le bouton visait `baobab://invite/…`, ça n'ouvre l'app que si elle est installée.
*Confirme si* : `view-source` de `getbaobab.app/invite/…` ; inspecter la cible (`href`/`onclick`) du bouton « Continuez en privé ».

**H4 — Bascule FR/EN de la page (informatif). RANG : explication annexe.**
Localisation **côté site externe** (Accept-Language / langue de l'appareil), non contrôlée par le repo.
*Confirme si* : les deux téléphones ont des langues système différentes.

*Aucun correctif proposé — audit d'abord.*
