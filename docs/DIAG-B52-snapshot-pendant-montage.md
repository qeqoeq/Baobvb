# DIAG-B52 — Qui déclenche une capture de vue pendant le montage ? (LECTURE SEULE)

> Diagnostic seul. Aucun correctif. `fichier:ligne` ou « NON PROUVÉ ». N'infère pas.

**Faits prouvés** (crash 14/08 01:48, build 32, iOS 26.5.2, **après OTA B51**) :
- `EXC_CRASH / SIGABRT`, exception ObjC non rattrapée, relancée depuis `ObjCTurboModule::performVoidMethodInvocation` sur `com.meta.react.turbomodulemanager.queue`. **Aucun `lastExceptionBacktrace`** → la méthode fautive n'est pas nommable (on n'y perd pas de temps).
- **NOUVEAU** : thread principal bloqué dans `-[UIView resizableSnapshotViewFromRect:afterScreenUpdates:withCapInsets:]` → `_UISnapshotViewRectAfterCommit` → `CARenderServerSnapshot` → attente `mach_msg`, **à l'intérieur de `-[RCTMountingManager performTransaction:]`**, appelé depuis deux frames de notre binaire (imageOffset 3551964 / 3603604).
- **B51 (arrêt des animations hors premier plan) est en place et n'a pas corrigé.**

**Verdict court** : la capture de vue est faite par **`react-native-screens`** (seule lib du projet qui appelle `resizableSnapshotViewFromRect`, `RNSScreen.mm`). Elle survient **pendant une transition/activation d'écran** confondue avec l'ouverture de la feuille de partage. Le snapshot `afterScreenUpdates:YES` attend le serveur de rendu (`CARenderServerSnapshot`/`mach_msg`) qui **ne peut pas commiter** pendant que l'app présente l'`UIActivityViewController` et passe inactive/arrière-plan → **blocage du thread principal** → SIGABRT. B51 n'y touchait pas (ce n'était pas les animations, mais la **navigation**).

---

## 1. Quelle lib appelle une capture de vue UIKit ?

| Lib | Version JS (package.json) | Version native (Podfile.lock) | Capture de vue ? |
|---|---|---|---|
| **react-native-screens** | **~4.16.0** | **RNScreens 4.16.0** | **OUI** — `resizableSnapshotViewFromRect` / `snapshotViewAfterScreenUpdates` / `drawViewHierarchyInRect` dans `node_modules/react-native-screens/ios/RNSScreen.mm` et `RNSScreenStackHeaderConfig.mm` |
| react-native-view-shot | **absent** (package.json + node_modules) | — | n/a |
| expo-blur | **absent** (package.json + node_modules) | — | n/a |
| react-native-safe-area-context | ~5.6.0 | SafeAreaContext | non (mesure d'insets, pas de snapshot) |
| @react-navigation/native · bottom-tabs · elements | 7.1.8 · 7.4.0 · 2.6.3 | — | non directement (délègue le rendu de pile à react-native-screens) |
| react-native-reanimated | ~4.1.1 | RNReanimated 4.1.6 | non pour ce frame (`resizableSnapshotViewFromRect` est UIKit/RNScreens) |
| expo-router | ~6.0.24 | — | utilise le **native-stack** = react-native-screens |

→ **Le snapshotteur est `react-native-screens`**, invoqué via le native-stack d'expo-router. Cohérent avec les deux frames de notre binaire dans `performTransaction` (montage Fabric de `RNSScreen`).

---

## 2. react-native-screens : version, configuration

- **Version** : `~4.16.0` (natif 4.16.0).
- **Configuration : défauts.** Aucun appel `enableFreeze` / `enableScreens` / `freezeOnBlur` dans `app/` (grep exhaustif → **rien**). `enableScreens` est **actif par défaut** en RN-screens 4.x ; `enableFreeze` est **inactif** tant qu'on ne l'appelle pas (jamais appelé) → le « freeze » (react-freeze) n'est **vraisemblablement pas** la source ; ce sont les **transitions de pile**.
- **Transitions = snapshots** : en native-stack, chaque `push`/`replace`/présentation joue une **animation de transition**, pendant laquelle `RNSScreen` capture la vue sortante/entrante. Sous Nouvelle Architecture (build 32, cf. DIAG-B50), ce snapshot se fait **dans la phase de montage Fabric** (`performTransaction`) — exactement le frame du crash.
- **NON PROUVÉ** si react-navigation active en interne un `freezeOnBlur` par défaut (non fixé par nous). À vérifier sur la config effective.

---

## 3. Navigation concurrente entre le tap « partager » et l'ouverture de la feuille

**Chemin téléphone** (relation `invite_number`) : fin d'éval → `showPhoneInviteSheet` (`evaluate/[id].tsx:257`). L'alerte a des boutons dont **« More options »** (`phone-invite-sheet.ts:53-59`) :
```
onPress: () => {
  void Share.share({ message: fullMessage });  // :56 — fire-and-forget (non attendu)
  onDeliveryChannelOpened();                    // :57
  onDismiss();                                  // :58 → router.replace (voir ci-dessous)
}
```
`onDismiss` vient de `evaluate/[id].tsx:262-264` → **`router.replace('/relation/[id]')`** (ou `/reveals`). Donc **`router.replace` s'exécute immédiatement, en même temps que la feuille de partage s'ouvre** (le partage n'est pas `await`é). Idem pour les boutons **WhatsApp** (`onDismiss` à `:50`, hors du `.then`) et **Messages** (`:32`).

**Chemin non-téléphone** : `relation/[id].tsx:688` `await Share.share({ message })` — **attendu**, **pas** de `router.replace` immédiat après (`:690` = `markInviteDeliveryOpened`, une maj de store → re-render, pas une navigation).

→ **Navigation concurrente PROUVÉE dans le chemin téléphone** : un `router.replace` (transition de pile react-native-screens) est déclenché à l'instant précis où la feuille de partage se présente.

---

## 4. Un écran se démonte/remonte-t-il pendant que la feuille s'ouvre ? Et au retour ?

- **Chemin téléphone** : `router.replace` (§3) **démonte l'écran `evaluate/[id]`** (une **carte** de pile — `_layout.tsx:538`, sans `presentation:'modal'`) et **monte `relation/[id]`** (carte, `:521`) via une **transition react-native-screens** → **snapshot** — pendant que l'`UIActivityViewController` se présente. C'est la collision montage↔snapshot↔présentation.
- **Chemin non-téléphone** : pas de démontage au moment du partage (relation/[id] reste montée). Mais **au RETOUR de WhatsApp** : `AppState:'active'` → `resyncSharedRelations()` (`_layout.tsx:371-373`) → maj de store → **re-render** de la pile montée → react-native-screens **ré-active/ré-affiche** les écrans → snapshot possible pendant que le serveur de rendu se resynchronise après le retour au premier plan.
- Les **onglets** (`index`/`garden`) restent montés (scènes opaques, B32) sous les cartes de pile poussées.

---

## 5. Options JS-only pour supprimer le snapshot pendant le partage (listées, non implémentées)

1. **Désactiver l'animation de transition** sur `relation/[id]` et `evaluate/[id]` : `animation: 'none'` dans leurs `Stack.Screen options` (`app/_layout.tsx`). *Risque* : plus d'animation de navigation (rendu abrupt) ; ne couvre pas un éventuel snapshot de freeze.
2. **Ne pas naviguer pendant l'ouverture de la feuille** : dans `showPhoneInviteSheet`/evaluate, ne déclencher `router.replace` qu'**après** retour de la feuille (pas dans `onDismiss` synchrone). *Risque* : change le timing/UX post-partage ; c'est une modif du chemin de partage (hors périmètre B51, mentionné ici seulement).
3. **`freezeOnBlur: false`** en `screenOptions` global. *Risque* : sans effet si le freeze n'est pas la cause (ce sont les transitions) ; perte de l'optimisation de gel.
4. **Différer le resync de retour** : ne pas lancer `resyncSharedRelations` (`_layout:371-373`) tant que `AppState` n'est pas stabilisé sur `'active'`. *Risque* : données légèrement plus fraîches en retard.
5. **`detachInactiveScreens={false}` / `enableScreens(false)`** (désactiver react-native-screens, revenir à des vues RN classiques). *Risque* : **lourd** — perte du native-stack, régressions de perf/comportement ailleurs ; à éviter.
6. **Garder la feuille de partage sur une modale stable** (comme le QR, §6) plutôt que de la lancer au bord d'une transition de carte. *Risque* : restructuration du parcours d'invitation.

---

## 6. QR (ne crashe pas) vs invitation (crashe) — navigation & montage

| | **Partage QR (OK)** | **Partage invitation (crashe)** |
|---|---|---|
| Écran hôte | `me/qr` — **modale** (`_layout.tsx:456` `presentation:'modal'`), montée seule et **stable** | `relation/[id]` (carte) ou fin d'`evaluate` (carte) |
| Navigation au partage | **AUCUNE** — `Share.share` appelé depuis la modale (`me/qr.tsx:61,63,70`), pas de `router.push/replace` autour ; `router.back` (`:142`) = croix, `router.push` (`:229`) = éditer, non liés au partage | **`router.replace`** concurrent (chemin téléphone, `phone-invite-sheet.ts:58` → `evaluate:262-264`) **ou** re-render de pile au retour (chemin non-téléphone, §4) |
| Transition de pile pendant le partage | **non** (modale déjà présentée, pas de transition en cours) | **oui** (transition react-native-screens → **snapshot**) |
| Montage concurrent | non | `performTransaction` + snapshot RNScreens |

**La différence n'est pas le partage, c'est la navigation/le montage** : le partage QR se fait sur une **modale stable sans transition concurrente**, alors que le partage d'invitation coïncide avec une **transition de pile react-native-screens** (chemin téléphone) ou un **re-render de pile au retour** (chemin non-téléphone), tous deux déclencheurs de snapshot. → cause probable.

---

## Hypothèses classées (avec l'observation terrain qui la confirmerait)

**H1 — Snapshot de transition react-native-screens déclenché par une navigation concurrente au partage (chemin téléphone). RANG : HAUT.**
Prouvé : `showPhoneInviteSheet` lance `Share.share`/`Linking` en fire-and-forget puis `onDismiss()` → `router.replace` **immédiat** (`phone-invite-sheet.ts:56-58`, `evaluate:262-264`) → transition de pile RNScreens (snapshot) pendant la présentation de la feuille → `resizableSnapshotViewFromRect`/`mach_msg` bloque le thread principal.
*Confirme si* : (a) le crash suit un partage **depuis une relation téléphone** (chemin `showPhoneInviteSheet`) ; (b) `animation:'none'` sur `relation/[id]`/`evaluate` supprime le crash ; (c) ne pas appeler `router.replace` dans `onDismiss` supprime le crash ; (d) le QR (sans navigation) ne crashe jamais.

**H2 — Snapshot de ré-activation de pile au RETOUR de WhatsApp (chemin non-téléphone). RANG : MOYEN.**
`await Share.share` (`relation/[id]:688`) sans nav ; au retour, `resyncSharedRelations` (`_layout:371-373`) re-render la pile → RNScreens ré-affiche/snapshotte pendant que le serveur de rendu se resynchronise.
*Confirme si* : le crash survient **au retour** (pas à l'ouverture) ; différer le resync de retour l'évite.

**H3 — `freezeOnBlur` (si activé par react-navigation en interne). RANG : BAS-MOYEN.**
Nous ne l'activons pas (défauts), mais le native-stack pourrait le faire.
*Confirme si* : inspecter la config effective ; `freezeOnBlur:false` global change quelque chose.

**H4 — Le frame TurboModule est un leurre. RANG : contexte.**
Le rapport dit la pile du lanceur déroulée (méthode non nommable) ; le **vrai blocage prouvé** est le **snapshot main-thread en attente `mach_msg`** dans `performTransaction`. L'action porte sur le **snapshot pendant la navigation**, pas sur un module natif précis.

*Discriminant principal* : reproduire un partage **avec** vs **sans** navigation concurrente (relation téléphone vs QR), et tester `animation:'none'` sur les écrans du chemin. Le co-occurrent (navigation concurrente au partage) est **prouvé** dans le code (§3-4).

*Aucun correctif proposé — audit d'abord.*
