# DIAG-B47 — Choix de contact au flux d'ajout de relation (LECTURE SEULE)

> Diagnostic seul. Aucun code, aucune dépendance installée, aucun correctif. Le GO viendra après audit.
> Chaque réponse porte une référence `fichier:ligne`, ou « NON PROUVÉ ».

**Motif** : premier testeur adulte hors famille, 12/08 : « je ne comprends même pas qui je note ». Dernière des trois plaintes non traitée. Hypothèse : le flux d'ajout ne donne pas d'identité claire à la relation avant l'évaluation.

**Décision produit actée (non rediscutée)** : le contact choisi sert UNIQUEMENT à nommer la relation en local, sur l'appareil. Aucune donnée de contact (nom, numéro, email) ne part au serveur. Aucun profil tiers créé. C'est une étiquette privée, pas un compte.

**Constat central (renverse la question)** : `expo-contacts` est **déjà installé, déjà utilisé, et déjà dans le build TestFlight actuel**. Le sélecteur de contact existe **déjà** dans le flux *Inviter par téléphone* (`app/me/invite-by-number.tsx:75`). B47 n'est donc pas « ajouter une dépendance » mais « étendre un picker existant au flux `relation/add` » — en **JS pur, OTA-safe**.

---

## 1. Flux actuel d'ajout

Trois points d'entrée mènent à trois parcours distincts :

**A. Profil → « Ajouter »** (`app/me/profile.tsx:142`, `onPress` → `router.push('/me/invite-by-number')` `:140`)
→ `app/me/invite-by-number.tsx`, état par défaut `'ready'` (`:39,194`) :
- **« Choisir un contact »** (`:221`) → `Contacts.presentContactPickerAsync()` (`:75`) → extrait `phone` + `contactName` (`:94-97`) → `createRelationAndStart(anchorPhone, contactName)` (`:98`) → `addRelation(effectiveLabel, { source:'invite_number', privateLabel:effectiveLabel, anchorValue:phone })` (`:51-59`) → `router.replace('/relation/evaluate/[id]')` (`:65`).
- **« Saisir le numéro manuellement »** (`:232`) → état `'manual'` : champ téléphone + champ **« Nom (facultatif) »** (`:131-141`) → `createRelationAndStart(phone, name)` (`:128,143`).

**B. Profil → « Scanner un code »** (`app/me/profile.tsx:135`, `handleScan` → `router.push('/me/scan')` `:40`)
→ scan → `relation/add?fromScan` (formulaire pré-rempli, `add.tsx:329-385`) → nom + pseudo → « Ajouter la personne » (`:376`) → `evaluate`.

**C. Écran Liens → bouton d'ajout** (`app/(tabs)/index.tsx:252` et `:360`, `router.push('../relation/add')`)
→ `app/relation/add.tsx`, `mode='hub'` (`:82,294`) :
- **« Commencer à répondre »** (`:302`) → `setMode('private')` → formulaire **nom libre** (`:388-408`, sous-titre « Toi seul·e le verras » `:406`) → « Ajouter la personne » (`:376`) → `handleCreate` (`:115`) → `addRelation(cleanName, { source:'manual', privateLabel:cleanName })` (`:152-154`) → `router.replace('/relation/evaluate/[id]')` (`:163`).
- **« Inviter par téléphone plutôt »** (`:307-312`) → renvoie vers `invite-by-number` (parcours A).

**D. Claim (personne invitée)** : `app/invite/[relationId].tsx` → au claim, relation créée à partir du snapshot de l'inviteur `claimResult.inviter_display_name` (`:314`) via `addRelation(source:'claim')` (`:339`) → `evaluate?fromClaim`.

**À quel moment la relation reçoit un nom affichable ?** À la **création** (`addRelation` → `pushRelation`/`pushRelationWithSource`, `store:2416,2482`) : `name` est posé (obligatoire) et `privateLabel` = ce nom (`store:2422,2428,2494,2501`). L'écran d'évaluation affiche `getNormalizedPrivateLabel(relation)` (`evaluate/[id].tsx:339`) = `privateLabel ?? counterpartDisplayName ?? name` (doctrine `store:166-176`).

---

## 2. Le trou

**Aucun chemin n'affiche littéralement « rien »** : `name` est toujours posé à la création (le champ nom est obligatoire là où il existe). MAIS deux chemins arrivent à l'évaluation **sans identité humaine claire** — c'est le cœur de la plainte :

- **`relation/add` → nom libre** (parcours C, le principal depuis Liens) : l'utilisateur **invente** une étiquette sans aucun ancrage sur un contact réel. Sous-titres : « Toi seul·e le verras » (`add.tsx:406`) / « Donne un nom à cette personne, pour toi » (`add.tsx:337`). L'identité est abstraite → « qui je note ? ». **Le sélecteur de contact n'est PAS accessible ici** ; il n'existe que dans `invite-by-number` (parcours A).
- **`invite-by-number` → saisie manuelle, nom laissé vide** : `effectiveLabel = label.trim() || anchorPhone.trim()` (`invite-by-number.tsx:52`). L'étiquette devient **le numéro de téléphone**, et l'évaluation affiche donc un numéro en guise de « nom » (`evaluate/[id].tsx:339`).

Ce que voit l'utilisateur à la place d'une identité : soit une étiquette qu'il a lui-même tapée sans contexte, soit un numéro de téléphone brut.

---

## 3. Modèle local de nommage

Champs de nommage sur `Relation` (`store/useRelationsStore.ts`) :
- `name: string` — obligatoire, fallback d'affichage (`:99`).
- `privateLabel?: string` — **override privé de l'utilisateur** (`:106`). « how I label this person » (`:97`).
- `handle?: string` — pseudo (`:104`).
- `counterpartDisplayName?: string | null` — **appartient au serveur** (`:166-176`), NULL pour les sources manuelles.

**Purement local, jamais envoyé** : **`privateLabel`** (et `name`). Preuve : `pushRelation`/`pushRelationWithSource` écrivent seulement dans `state.relations` puis `persist()` (AsyncStorage) — **aucun appel réseau** (`store:2451-2454`, `2450`+`persist`). Aucun RPC de `lib/reveal-shared-repo.ts` ne prend `name`/`privateLabel` en paramètre (voir §4).

---

## 4. Ce qui part au serveur

**À la création (`addRelation`) : RIEN.** Création = local + `persist()` uniquement (`store:2451-2454`). Aucun champ transmis.

RPC ultérieurs (`lib/reveal-shared-repo.ts`) et leurs paramètres exacts :
- `attach_shared_private_reading_reference` (`:39-44`) : `p_relationship_id`, `p_side`, `p_reading_id`, `p_reading_payload` (les scores de la lecture) — **pas de nom/étiquette**.
- `create_relationship_invite` (`:67-73`) : `p_relationship_id`, `p_inviter_side`, `p_ttl_minutes`, **`p_inviter_display_name` = le nom de l'INVITEUR lui-même** (`inviterIdentity.displayName`, `:71`), `p_inviter_handle`, `p_inviter_avatar_seed` — c'est l'identité de **soi**, jamais l'étiquette locale du tiers.
- `register_phone_invite_anchor` (`:147-149`) : **`p_phone_e164`** — le téléphone EST envoyé, **uniquement dans le flux d'invitation par téléphone**, comme ancre de livraison (commentaire « must never be logged » `:141`).
- `claim_relationship_invite` (`:90-91`) : `p_invite_token` seul.

**Y a-t-il un champ où un nom local pourrait fuiter ?** **Non.** Le seul « nom » transmis est celui de l'inviteur (soi). L'étiquette locale du tiers (`privateLabel`/`name`) n'entre dans aucun RPC. Le seul datum de contact envoyé est le **téléphone**, et seulement pour l'invitation par téléphone — **pas** pour le picker de nommage visé par B47 (voir §7 : le picker B47 est *name-only*, `source:'manual'`, aucun ancrage téléphone).

---

## 5. Dépendance

**`expo-contacts` est installé** : `package.json` (`~15.0.11`) ✅, et **présent dans le build natif** : `ios/Podfile.lock` (`ExpoContacts (15.0.11)`). Les deux commits qui l'ont introduit (`1315b33` 09/05, `7a169f8` 13/05) sont **ancêtres de `8cd688b`** = build 32 (05/08) → il tourne déjà sur le TestFlight actuel (le picker d'`invite-by-number` fonctionne en prod).

**Son ajout impose-t-il un build natif ?** **Non — il est déjà buildé.** Étendre le picker à `relation/add` = **JS pur, OTA-safe**, réutilise le module natif déjà embarqué.

**Alternative sans module natif ?** Aucune pour un vrai sélecteur de contacts. Le repli non-natif est la **saisie de nom libre** (déjà existante), qui reste la voie de secours.

---

## 6. Permission iOS

Le code utilise **`Contacts.presentContactPickerAsync()`** (`invite-by-number.tsx:75`), **jamais** `getContactsAsync`/`requestPermissionsAsync` (grep exhaustif : une seule API contacts dans tout `app/`). Sur iOS ce picker s'exécute **hors-process** (`CNContactPickerViewController`) et **ne requiert NI la permission NI `NSContactsUsageDescription`** : l'utilisateur choisit un contact, l'app ne reçoit que celui-là.

**Faut-il déclarer quelque chose dans `app.json` ?** C'est **déjà** déclaré (plugin `expo-contacts` + `contactsPermission`, `app.json:52-54`, texte anglais). Pour B47 (picker uniquement) : **aucune nouvelle déclaration nécessaire, donc aucun build.** ⚠️ Toute modification d'`app.json` (ex. réécrire le texte) EST une config native → **imposerait un build**, et n'est PAS requise ici.

**Texte de permission FR proposé** (optionnel — pertinent seulement si un jour on lit tout le carnet ; sinon inutile) :
> « Baobab n'ouvre tes contacts que pour te laisser choisir un nom à donner à une relation, sur cet appareil. Aucun contact n'est envoyé, copié ni partagé. »

---

## 7. Point d'insertion

Dans **`app/relation/add.tsx`** uniquement :
- Ajouter un bouton **« Choisir dans mes contacts »** dans le hub (`:294-320`) et/ou dans le formulaire *private* (`:388-408`).
- Handler : `Contacts.presentContactPickerAsync()` → extraire **le nom seul** (`contact.name` ou `firstName + lastName`, logique déjà écrite `invite-by-number.tsx:94-97`) → pré-remplir l'état `name` (`add.tsx:85`) → l'utilisateur peut corriger → `handleCreate` existant (`source:'manual'`, `privateLabel = cleanName`, `:152-154`).
- **Aucun** ancrage téléphone, **aucun** `register_phone_invite_anchor`, **aucune** invitation : name-only, 100 % local.

**Écrans touchés** : `app/relation/add.tsx` (seul). Optionnel : extraire un helper pur `contactDisplayName(contact)` en `lib/` (réutilisé depuis `invite-by-number`). **Pas de** changement à `invite-by-number`, `evaluate`, ni au store.

---

## 8. Risque (refus des contacts)

Avec `presentContactPickerAsync` (hors-process), **il n'y a pas de prompt de permission ni de refus** à gérer : l'API ne demande pas l'accès au carnet. Le seul cas est l'**annulation du picker** (retour `null`, cf. `invite-by-number.tsx:76-79`).

**Ce qu'il faut garantir** : le picker est **additif, jamais obligatoire**. Le champ **nom libre reste toujours disponible** (`add.tsx:388-408`) comme voie normale ; annuler le picker doit laisser ce champ éditable, sans cul-de-sac. Le flux actuel (nom libre) le permet déjà — B47 ne doit pas le retirer.

---

## PLAN D'IMPLÉMENTATION (ordonné — GO après audit)

1. **[sans build]** (vérifié dans ce diag) Confirmer `expo-contacts` dans le build courant → aucun build requis pour un picker JS. — *aucun fichier*
2. **[sans build]** Extraire un helper pur `contactDisplayName(contact)` (nom || prénom+nom), testé. — `lib/contact-display-name.ts` (+ `.test.ts`)
3. **[sans build]** Ajouter le bouton « Choisir dans mes contacts » + handler `presentContactPickerAsync` (name-only) qui pré-remplit `name`. — `app/relation/add.tsx`
4. **[sans build]** Garantir le repli : annulation du picker → champ nom libre éditable, pas de cul-de-sac. — `app/relation/add.tsx`
5. **[sans build]** Verrouiller la doctrine sur ce chemin : `source:'manual'`, **aucun** `anchorValue`/téléphone, **aucun** RPC — pur label local. — `app/relation/add.tsx`
6. **[sans build]** Tests : helper `contactDisplayName` + assertion que le chemin picker B47 ne pose ni téléphone ni ancre serveur. — `lib/contact-display-name.test.ts`
7. **[BUILD NATIF requis — HORS B47, différé]** *Seulement si* un texte de permission FR est voulu, ou si un jour on lit tout le carnet (`getContactsAsync`) : éditer `app.json` (`contactsPermission`). Non nécessaire pour le picker.

*Tout le chantier B47 (étapes 1-6) est JS-only et OTA-safe. Seule l'étape 7, optionnelle et différée, exigerait un build.*
