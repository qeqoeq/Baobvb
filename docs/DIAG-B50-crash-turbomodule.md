# DIAG-B50 — Crash SIGABRT au partage (TurboModule / Nouvelle Architecture) — LECTURE SEULE

> Diagnostic seul. Aucun correctif. `fichier:ligne` ou « NON PROUVÉ ». N'infère pas.

**Faits prouvés par le rapport de crash** (baobab 1.0.0 build 32, iOS 26.5.2, 13/08 18:24, iPhone 15 Pro, TestFlight) — non remis en cause :
- `EXC_CRASH / SIGABRT`, `abort() called`, exception ObjC non rattrapée.
- Relancée depuis `facebook::react::ObjCTurboModule::performVoidMethodInvocation`.
- Thread fautif : `com.meta.react.turbomodulemanager.queue` (PAS le principal).
- Thread 0 (principal) simultanément dans `-[RCTMountingManager performTransaction:]`.
- Aucun `lastExceptionBacktrace` : le message d'origine est perdu.

**Verdict court** : le crash est une **exception ObjC non rattrapée dans une méthode native `void`** invoquée sur la **queue TurboModule**, **pendant** qu'une **transaction de montage Fabric** tourne sur le thread principal. C'est un motif de **course Nouvelle Architecture** (confirmée active, §4). Fait notable (§1-3) : **aucun** appel natif de notre chemin de partage n'est une méthode *void* — la méthode fautive n'est donc **vraisemblablement pas** un appel de partage direct, mais un module **concurrent** (candidat : l'animation native / `NativeAnimatedModule`, ou un émetteur d'événements). Le module précis est **NON PROUVÉ** (`lastExceptionBacktrace` perdu).

---

## 1. Tous les appels de modules natifs sur le chemin « fin d'évaluation → fiche → partage »

**`app/relation/evaluate/[id].tsx`** :
- `Haptics.selectionAsync()` `:128`, `:197` (promesse, `void … .catch`)
- `Haptics.notificationAsync(Success)` `:229` (promesse)
- `Alert.alert(...)` `:223`, `:309` (callback)
- → `showPhoneInviteSheet(...)` (relation téléphone)

**`lib/phone-invite-sheet.ts`** :
- `Alert.alert(...)` `:21`, `:29`, `:45`, `:48` (callback)
- `Linking.openURL(...)` `:28`, `:43` (promesse) · `Linking.canOpenURL(...)` `:39` (promesse)
- `Share.share({ message })` `:56` (promesse ; via `RCTActionSheetManager`)

**`app/relation/[id].tsx`** :
- `Haptics.impactAsync(...)` `:338`, `:520`, `:711` (promesse) · `Haptics.notificationAsync(...)` `:622`, `:675` (promesse)
- `Alert.alert(...)` `:578`, `:582`, `:695`, `:698`, `:722` (callback)
- **`Share.share({ message: fullMessage })` `:688`** (promesse ; `RCTActionSheetManager.showShareActionSheetWithOptions`)
- `setTimeout(...)` `:191`, `:272` = timers de reveal (JS, **pas** natif, sans rapport avec le partage)

Modules natifs touchés : **Haptics (expo-haptics), Alert (RCTAlertManager), Linking (RCTLinkingManager), Share (RCTActionSheetManager)**. **Clipboard : absent** du chemin. **expo-contacts : absent** de ce chemin (il vit dans `relation/add`, B47).

**Point critique** : `performVoidMethodInvocation` invoque une méthode **`void`** (ni retour, ni promesse, ni callback). Or **tous** les appels ci-dessus sont **non-void** — Share/Alert ont des callbacks, Linking/Haptics renvoient des **promesses** (→ `performPromiseMethodInvocation`, pas `void`). **Aucun** de nos appels de partage ne correspond donc à la signature `void` du frame fautif.

---

## 2. Sont-ils appelés depuis un handler React (thread JS) ? Garde de thread ?

**Oui, tous depuis des handlers JS** (onPress / handlers async de sauvegarde et d'invitation). **Aucune garde** :
- **Aucun `InteractionManager.runAfterInteractions`** autour de `Share.share`, `Haptics.*`, `Linking.*`, `Alert.*` (grep : absent des 3 fichiers).
- **Aucun `setTimeout`/`requestAnimationFrame` de report** avant `Share.share` (`:688`) : appel direct, `await`. (Les seuls `setTimeout` du chemin, `relation/[id].tsx:191,272`, sont des timers de reveal sans rapport.)
- **Aucun dispatch de queue explicite** côté JS.

Les `Haptics.*` sont *fire-and-forget* (`void … .catch`) ; `Share.share` est `await`é (`:688`).

---

## 3. Implémentation native de `Share.share` + version RN

- **Version RN exacte** : **`react-native@0.81.5`** (React 19.1.0, Expo ~54.0.35 — `package.json`).
- **Implémentation** : `Share.share` (mode `message`) passe par **`RCTActionSheetManager`** (`node_modules/react-native/React/CoreModules/RCTActionSheetManager.mm`), méthode `showShareActionSheetWithOptions` (`:215`).
- **`methodQueue`** : **AUCUNE déclaration** (`grep methodQueue` → **0 occurrence** dans le fichier). À la place, **chaque méthode s'auto-dispatch sur le main** : `dispatch_async(dispatch_get_main_queue(), ^{ … })` (`:237` pour `showShareActionSheetWithOptions`, aussi `:105`, `:209`). Sous TurboModule, `RCTTurboModule.mm` honore encore un `methodQueue` s'il est déclaré (support ascendant, `RCTTurboModule.mm:334-337`) ; ici il n'y en a pas → la méthode s'exécute sur la queue TM puis **re-dispatch sur le main** avant tout UIKit.

**Conséquence** : `RCTActionSheetManager` est **main-safe par auto-dispatch**, et sa méthode a des **callbacks** (donc **non-`void`**). Le frame fautif `performVoidMethodInvocation` (`RCTTurboModule.mm:412`) **n'est donc probablement pas l'ActionSheet**.

---

## 4. Nouvelle Architecture (Fabric/TurboModules) ? — DÉCISIF

**OUI, active — et déjà dans le build 32** :
- `app.json:10` `"newArchEnabled": true`.
- `ios/Podfile.properties.json` `"newArchEnabled": "true"`.
- `git show 8cd688b:app.json` (build 32) → `newArchEnabled: true` (`:10`).

C'est cohérent avec le **nom du thread fautif** `com.meta.react.turbomodulemanager.queue` et le frame `ObjCTurboModule::performVoidMethodInvocation` : **les TurboModules sont bien actifs**. Sous l'ancienne architecture, ce chemin de code n'existerait pas.

---

## 5. Une animation (respiration B45, fond réactif B46) peut-elle provoquer une transaction de montage au moment du partage ?

**Oui, très plausiblement — et rien ne les arrête en arrière-plan** :
- **B45 `EgoGraph`** : 3 `Animated.loop` **`useNativeDriver:false`**, tournant en continu tant que l'accueil Liens est monté. Nettoyage **au démontage seulement** (`EgoGraph.tsx:174-175` `clearTimeout` + `loop.stop()`). **Aucun `AppState`**.
- **B46 `NetworkBackground`** : `Animated` + `addListener` → **`setState` par frame**, **`useNativeDriver:false`**. Nettoyage **au démontage seulement** (`NetworkBackground.tsx:27,45`). **Aucun `AppState`**.
- `app/(tabs)/index.tsx` (écran Liens) : **aucun `AppState`** non plus (grep).

Donc quand l'utilisateur choisit une app de partage et que **l'app passe en arrière-plan**, ces animations **continuent** : un `Animated` **`useNativeDriver:false`** est piloté par le JS et **commit via le montage Fabric** → exactement `-[RCTMountingManager performTransaction:]` sur le **Thread 0**. La transaction de montage concurrente du rapport de crash est **pleinement cohérente** avec ces animations non arrêtées.

⚠️ Nuance : une animation `useNativeDriver:**false**` ne fait **pas** d'appel `NativeAnimatedModule` (elle monte côté Fabric = Thread 0). Une animation `useNativeDriver:**true**` (reveal/`RevealCardLab`, etc.) appellerait, elle, des méthodes **`void`** de `NativeAnimatedModule` **sur la queue TM** — ce serait un candidat direct au frame `performVoidMethodInvocation`. **NON PROUVÉ** laquelle est active à l'instant du crash.

---

## 6. Options OTA-safe pour fiabiliser le partage (SANS les implémenter)

1. **Différer le partage après les interactions** : envelopper `Share.share` (`relation/[id].tsx:688`, `phone-invite-sheet.ts:56`) dans `InteractionManager.runAfterInteractions(...)`.
2. **Différer d'un tick** : `requestAnimationFrame`/`setTimeout(0)` avant d'ouvrir la feuille, pour laisser tout `setState`/montage en cours se poser.
3. **Arrêter les animations sur `AppState` ≠ 'active'** : ajouter un écouteur `AppState` qui `stop()` les boucles B45 et l'anim B46 (et toute anim native-driven) en `'background'`/`'inactive'`, pour qu'aucune transaction de montage / appel `NativeAnimated` ne tourne pendant le passage en arrière-plan.
4. **Réduire le bruit de montage pendant le partage** : différer le `resyncSharedRelations` de retour au premier plan (`_layout.tsx:371-373`) et éviter de recalculer `networkTemperature` (B46) pendant la transition.
5. **Alléger B46** : le `setState` par frame (`useNativeDriver:false`) est coûteux — le remplacer par une interpolation sans re-render JS réduirait les commits Fabric.
6. **Limite honnête** : la **cause racine** (exception dans une méthode `void` TurboModule sous Nouvelle Architecture) peut n'être **corrigeable qu'en natif** (montée RN/Expo, ou patch du module fautif). Les options 1-5 ne font que **réduire la fenêtre de course** ; elles n'éliminent pas nécessairement le crash.

---

## Hypothèses classées (avec l'observation terrain qui la confirmerait)

**H1 — Course Nouvelle Architecture : montage Fabric concurrent (animations B45/B46 non arrêtées) pendant un appel `void` TurboModule à l'arrière-plan. RANG : HAUT.**
Prouvé : New Arch active (§4), B45/B46 `useNativeDriver:false` sans arrêt sur `AppState` (§5) → montage sur Thread 0 au moment du passage en arrière-plan pour le partage. Une méthode `void` TM lève une exception sur la queue TM en même temps. C'est exactement la configuration à deux threads du rapport.
*Confirme si* : (a) le frame TM **symbolisé** nomme un module (`NativeAnimated`, un émetteur…) ; (b) le crash disparaît en **arrêtant B45/B46** avant/pendant le partage ; (c) le partage QR (écran **sans** B45/B46, §comparaison B48) ne crashe pas ; (d) reproduction uniquement avec animations actives.

**H2 — `NativeAnimatedModule` (méthode `void`) lève une exception car la transaction Fabric concurrente a détruit son nœud. RANG : MOYEN.**
Une animation `useNativeDriver:true` (reveal / `RevealCardLab`) appelle une méthode `void` de `NativeAnimated` sur la queue TM ; le montage concurrent (Thread 0) invalide le nœud référencé → exception. Cohérent avec `performVoidMethodInvocation` (§5 nuance).
*Confirme si* : le frame symbolisé pointe `RCTNativeAnimated*` ; désactiver les animations native-driven de l'écran supprime le crash.

**H3 — Un module natif du partage lève l'exception. RANG : BAS-MOYEN (argument contraire fort).**
`performVoidMethodInvocation` cible une méthode **`void`** ; or **aucun** de nos appels (Share/Alert = callbacks, Linking/Haptics = promesses) n'est `void` (§1-3), et l'ActionSheet s'auto-dispatch sur le main (§3). La signature du frame **contredit** un appel de partage direct.
*Confirme si* : le frame symbolisé nomme malgré tout `RCTActionSheetManager`/`RCTAlertManager` → réexaminer.

**H4 — Contenu du message (piste B48). RANG : BAS.**
L'ActionSheet s'auto-dispatch sur le main et n'est pas `void` ; un message string valide ne fait pas lever `performVoidMethodInvocation`.
*Confirme si* : un message ASCII supprime le crash (peu attendu vu §3).

*Discriminant unique* : **symboliser le frame de la queue TurboModule** (dSYM du build 32) pour **nommer le module `void`** — sans quoi tout le reste est inférence. Le co-occurrent (montage Fabric non arrêté en arrière-plan, §5) est, lui, **prouvé** dans le code.

*Aucun correctif proposé — audit d'abord.*
