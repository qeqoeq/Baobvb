# DIAG-B48 — Crash au partage d'invitation (LECTURE SEULE)

> Diagnostic seul. Aucun code, aucun correctif. Chaque réponse porte `fichier:ligne` ou « NON PROUVÉ ».

**Terrain (13/08)** : fin d'évaluation → l'app propose de partager l'invitation → la **feuille de partage iOS** s'ouvre → l'utilisateur choisit **WhatsApp** → **crash**.

**Suspect prioritaire annoncé** : `lib/relationship-invite.ts:33`, réécrit en B42-bis (`598e205`) pour traduire le message en français.

---

## 1. Chemin complet : fin d'évaluation → feuille de partage

Deux branches, selon que la relation est ancrée à un téléphone ou non :

**Relation téléphone** (`app/relation/evaluate/[id].tsx:232` `if (relation.source === 'invite_number' && relation.anchorValue)`) :
→ `createRelationshipInviteForCurrentUser` (`:236`) → `getRelationshipInviteMessage(...)` (`:252`) → **`showPhoneInviteSheet(...)`** (`:257`). Ce n'est **pas** la feuille iOS : `phone-invite-sheet.ts:21` est un `Alert.alert` à 4 boutons (**Messages / WhatsApp / More options / Cancel**). Le bouton WhatsApp fait `Linking.openURL('whatsapp://send?phone=…&text=…')` (`:38-43`), pas `Share.share`.

**Relation non-téléphone** (manuel / scan / claim) : la fin d'évaluation **ne partage pas**, elle navigue vers la fiche (`evaluate/[id].tsx:272-273`). Le partage se fait ensuite depuis la fiche : `app/relation/[id].tsx` handler d'invitation → `getRelationshipInviteMessage(...)` (`:658`) → `fullMessage = url ? \`${message}\n${url}\` : message` (`:663`) → **`Share.share({ message: fullMessage })`** (`:688`).

- **API** : `Share.share` de `react-native` (importé `relation/[id].tsx:4`). **Argument exact** : `{ message: fullMessage }` — **un seul champ `message`**, jamais `title`, jamais `url`.
- La **feuille de partage iOS** décrite au terrain = `Share.share` → c'est donc le chemin **non-téléphone** (`:688`), ou le bouton **« More options »** de l'alerte téléphone (`phone-invite-sheet.ts:56`, aussi `Share.share({ message: fullMessage })`).

`fullMessage` = message FR (`relationship-invite.ts:33`) + `\n` + URL (`https://getbaobab.app/invite/<uuid>?token=<token>` en prod, `Linking.createURL(...)` en `__DEV__`, `relationship-invite.ts:19-22`).

---

## 2. Contenu de l'objet passé — un champ peut-il être undefined ?

Objet passé à `Share.share` sur le chemin d'invitation : **`{ message: string }` uniquement** (`relation/[id].tsx:688`, `phone-invite-sheet.ts:56`). Pas de `url`, pas de `title`.

- `message` est **toujours une string** (littéral de gabarit, `relationship-invite.ts:33`). `sender = params.senderName?.trim() || 'Quelqu'un'` (`:31`) → jamais undefined.
- `url` **peut** être undefined (`buildRelationshipInviteUrl` renvoie `undefined` si relationId/token vides, `:14`), **mais** il est absorbé dans le texte via le garde `url ? … : message` (`relation/[id].tsx:663`) — il n'est **jamais** passé comme champ `url`.

**Conséquence** : la cause classique iOS « `url` undefined/invalide dans `Share.share` » **ne s'applique pas à ce chemin** (aucun champ `url` n'y est passé). Le seul `Share.share` avec un champ `url` de l'app est le **partage du QR** (`me/qr.tsx:61`, un `fileUri`), et il **fonctionne** (voir §6).

Caractères du message FR (relevé codepoints) : `à/é/ê/ô` (Latin-1), **`—` U+2014 (cadratin)**, **`'` U+2019 (apostrophe typographique, uniquement dans le repli « Quelqu'un »)**, plus un **`\n`** et une URL `https://`. Tous sont de l'UTF-8 valide ; `Share.share`/WhatsApp les acceptent normalement (mécanisme de crash faible — voir hypothèse H2).

---

## 3. try/catch autour de l'appel

- `relation/[id].tsx:688` est dans un `try { … } catch (error) { … }` (`:692-699`) : une **rejection JS** de `Share.share` est attrapée → `Alert('Inviter à révéler', 'Le partage n'est pas disponible…')` (`:698`). Le succès marque la livraison seulement si `result.action === Share.sharedAction` (`:689-690`) ; sur `dismissedAction` (annulation) rien.
- `phone-invite-sheet.ts:56` (« More options ») : `void Share.share(...)` **sans** `.catch` → une rejection y serait non gérée (mais une rejection ≠ crash natif).

**Point clé** : un `try/catch` JS n'intercepte **pas** un **crash natif** (exception Objective-C / SIGABRT dans `UIActivityViewController` ou l'extension WhatsApp, ou plantage au retour au premier plan). Le terrain décrit un crash dur → il **contourne** ce `try/catch`, ce qui oriente vers une cause **native**, pas une promesse rejetée.

Si l'utilisateur choisit une app tierce : `Share.share` résout avec `action: sharedAction` au retour ; le code ne fait alors que `markInviteDeliveryOpened` (`:690`).

---

## 4. Ce chemin a-t-il changé depuis le build 32 natif (`8cd688b`, 05/08) ?

`git log 8cd688b..HEAD` sur les fichiers du chemin :

| Commit | Effet sur le chemin |
|---|---|
| `598e205` **B42-bis** | réécrit le **message** (`relationship-invite.ts:33`) en FR (— cadratin, apostrophe typo, accents) |
| `dea9172` B42 | wording |
| `52ab4f5` / `6a7b4c1` B43/B43-bis | palette EgoGraph/index |
| `09bf84f` **B45** | **animation de respiration** continue des nœuds (EgoGraph, `useNativeDriver:false`) |
| `bba363c` **B46** | **fond réactif animé** de l'écran Liens (`NetworkBackground`, `Animated` + `addListener`→`setState`) |

⚠️ **Le build 32 (05/08) précède TOUT B42→B46.** Le message FR **et** les deux animations neuves de l'écran Liens sont donc livrés **par OTA** par-dessus le natif. La corrélation « après B42-bis » **n'isole pas** le message : l'OTA a apporté simultanément le message ET les animations B45/B46. (`format-inviter-identity.ts` a aussi été réécrit mais **n'est pas dans le chemin d'envoi** — voir §1 ; il ne sert que l'écran d'arrivée `invite/[relationId].tsx`.)

---

## 5. Le crash vient-il du RETOUR au premier plan plutôt que du partage ?

Fortement plausible :
- **Chaque** retour à `'active'` relance un resync : `app/_layout.tsx:371-373` `AppState.addEventListener('change', next => { if (next !== 'active') return; void resyncSharedRelations(); })`. Choisir WhatsApp met l'app en arrière-plan ; au retour, ce resync se déclenche → il peut appeler `bootstrapSharedRelations` (`_layout.tsx:227`) → **mutation de `state.relations`** → re-render de l'écran au premier plan.
- Ce re-render touche des **animations neuves depuis le build 32** : `NetworkBackground` (B46) recalcule `networkTemperature` sur changement de `relations`, relance une `Animated.timing` et pousse un `setState` par frame via un listener (`components/ui/NetworkBackground.tsx`, `useNativeDriver:false`) ; `EgoGraph` (B45) fait tourner 3 `Animated.loop` en continu tant que l'accueil est monté (`useNativeDriver:false`). `relation/[id].tsx:4` importe lui-même `Animated` **et** `AppState`.
- Un `Animated` JS-driven qui tourne/rejoue pendant la transition arrière-plan→premier-plan, ou un `setState`/listener qui frappe un arbre en cours de ré-hydratation, est une surface de crash native classique en RN.

Nettoyage : `NetworkBackground` retire son listener et stoppe l'anim au démontage ; `EgoGraph` `clearTimeout` + `loop.stop()` au démontage — **le code de nettoyage lu semble correct**, donc si crash il y a, il viendrait de l'**interaction** (foreground + JS-driver + SVG + resync) plutôt que d'une fuite évidente. **NON PROUVÉ sans log device.**

---

## 6. Autre chemin de partage qui fonctionne — comparaison

| | **Partage QR (fonctionne)** | **Partage invitation (crashe)** |
|---|---|---|
| Appel | `Share.share({ url: fileUri, message })` puis repli `{ message }` | `Share.share({ message: fullMessage })` |
| Fichier | `me/qr.tsx:61` (+ `:63`, `:70`) | `relation/[id].tsx:688` (+ `phone-invite-sheet.ts:56`) |
| Champ `url` | **présent** (un `fileUri` local valide) | **absent** |
| Écran de départ/retour | modale **Profil/QR** — **aucune** animation B45/B46 | fiche **relation** (`Animated`+`AppState`, `:4`), avec l'**accueil Liens monté dessous** (respiration B45 + fond réactif B46) |
| Message | `message` (peut contenir le même texte) | même famille de texte FR |

**La différence la plus parlante n'est pas l'appel `Share` lui-même** (le QR passe *plus* — un `url` — et ne crashe pas) **mais le contexte de retour** : le partage QR revient sur un écran sans les animations neuves, le partage d'invitation revient sur/au-dessus de l'écran Liens animé (B45/B46). Cela pointe vers §5 plutôt que vers le contenu du message.

---

## Hypothèses classées (chacune avec l'observation terrain qui la confirmerait)

**H1 — Crash au RETOUR au premier plan (resync + animations neuves B45/B46). RANG : HAUT.**
Mécanisme : choisir WhatsApp met l'app en arrière-plan ; au retour, `_layout.tsx:371-373` relance `resyncSharedRelations` → mutation `relations` → re-render de l'écran Liens avec la respiration B45 et le fond réactif B46 (deux `Animated` JS-driven neufs depuis le build 32, livrés OTA). Le crash est **natif** (il contourne le `try/catch` du §3) et post-date exactement l'OTA qui a ajouté ces animations ; le partage Qui-marche (QR) diffère surtout par l'écran de retour (§6).
*Confirme si* : (a) l'app crashe aussi en revenant de **n'importe quelle** app (Messages, ou simple arrière-plan/retour), pas seulement WhatsApp ; (b) le log device montre une pile native `RCTView`/`Animated`/SVG ou une erreur JS dans `NetworkBackground`/`EgoGraph` ; (c) le crash disparaît si l'accueil Liens n'est pas monté ; (d) le crash disparaît en désactivant temporairement le fond réactif (B46) ou la respiration (B45).

**H2 — Contenu du message FR passé à `Share.share` (suspect prioritaire). RANG : MOYEN-BAS.**
Mécanisme : le message B42-bis (`relationship-invite.ts:33`) mélange `—` (U+2014), `'` (U+2019, repli seul), accents, un `\n` et une URL `https://` (`fullMessage`, `:663`). Tous valides en UTF-8 ; `Share.share`/WhatsApp les acceptent normalement — mécanisme causal **faible**, mais c'est le changement corrélé et le suspect annoncé.
*Confirme si* : (a) partager la **même** invitation vers une cible **non-WhatsApp** (Notes, Mail, Messages depuis la feuille) crashe **aussi** → texte en cause ; s'il n'y a que WhatsApp → extension WhatsApp + URL/texte ; (b) un message **ASCII pur** de test supprime le crash ; (c) l'utilisateur **avec** un `displayName` (pas d'apostrophe repli) vs sans.

**H3 — `url` undefined/invalide dans `Share.share` (crash iOS classique). RANG : ÉCARTÉ pour ce chemin.**
Preuve : le partage d'invitation passe **`{ message }` seul** (`relation/[id].tsx:688`, `phone-invite-sheet.ts:56`) ; `url` (potentiellement undefined) est plié dans le texte avec garde (`:663`), jamais passé comme champ. Seul `me/qr.tsx:61` passe un champ `url` (fichier) — et il fonctionne (§6).

**H4 — Deep link WhatsApp du sheet téléphone. RANG : BAS / probablement hors de ce parcours.**
`phone-invite-sheet.ts:38-49` ouvre `whatsapp://send?phone=…&text=…` via `Linking.openURL`, **gardé** par `canOpenURL` — et c'est une **Alerte** (boutons nommés), pas la **feuille iOS** décrite au terrain.
*Confirme si* : le testeur a vu une **grille d'apps iOS** (→ pas ce chemin) ou une **alerte Messages/WhatsApp/More/Cancel** (→ ce chemin) ; et si la relation testée avait un ancrage téléphone.

*Discriminant principal entre H1 et H2* : reproduire le partage vers **une cible non-WhatsApp**. Si ça crashe aussi → H2 (contenu). Si seul le **retour** crashe (quelle que soit l'app choisie) → H1. Un **log device** (Xcode/TestFlight crash) tranchera la pile native vs JS.

*Aucun correctif proposé — audit d'abord.*
