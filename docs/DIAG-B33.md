# Rapport de diagnostic — B33 (ghost bar, la vraie cause)

> Le fix B32 (`cfb6355`, OTA `019fd298`) n'a PAS résolu le symptôme. Nouvelles preuves terrain :
> - rangée grise présente **dès le cold start** (kill + relaunch ×2), **sans navigation** → ce n'est PAS la pile,
>   et `navigate` n'y change rien ;
> - au **tiers supérieur** de l'écran (cadre de l'atlas), pas en bas ;
> - **les deux rangées portent le soulignement doré sous « Jardin »** → deux instances de `PrimaryNavBar` avec le
>   même état actif (pas une tabBar native + une custom).
>
> **Diagnostic seul — aucune ligne de production modifiée, aucun fix, aucun OTA, aucun SQL.** Preuves `fichier:ligne`.
> STOP.

---

## VERDICT

**La source rend exactement UNE `PrimaryNavBar` sur l'accueil au cold start** — c'est prouvé statiquement
(§1-§2). L'hypothèse « accueil monté deux fois par la config » (route déclarée deux fois / deux navigateurs /
onglet monté d'office) est **RÉFUTÉE** par la config. Donc la 2ᵉ barre **n'est pas produite par le code** : c'est
un **écart runtime / bundle**, pas un défaut du JSX ni des layouts.

Ce symptôme a maintenant **survécu à B30** (montage unique) **et à B32** (conteneurs opaques + `navigate`), tous
deux corrects en source — signature typique d'un **correctif qui n'atteint pas le device**. Deux possibilités
runtime subsistent, **toutes deux tranchées par la même instrumentation on-screen** (§3) :
- **P1 — le bundle exécuté ≠ la source commitée** (OTA non appliqué, ou bundle Metro périmé) ;
- **P2 — une double-instanciation runtime réelle** (edge react-native-screens / expo-router) qu'aucune lecture
  statique ne peut voir.

L'instrumentation distingue P1 de P2 sans build natif. **À faire avant tout fix.**

---

## 1. Arbre des layouts — la route `/` n'est déclarée qu'une fois

**Fichiers de route `/` :** un seul → `app/(tabs)/index.tsx`. **Pas de `app/index.tsx`** (vérifié :
`ls app/index.tsx` = absent). `app/place/index.tsx` = `/place`, `app/reveals/index.tsx` = `/reveals`
(routes distinctes). Un seul autre navigateur : `app/(tabs)/_layout.tsx`.

**Root Stack — `app/_layout.tsx` :**
- `RootLayout` retourne **un seul `<Stack>`** (`:436-437`). **Pas de `<Slot>`, pas de second navigateur, pas de
  wrapper rendant `children` deux fois, pas d'`unstable_settings`/`initialRouteName`/`anchor`** (grep : aucun).
- Le groupe est déclaré **une seule fois** : `<Stack.Screen name="(tabs)" options={{ headerShown: false }} />`
  (`:449`). Le Stack déclare le **groupe** `(tabs)`, **pas** `index` directement.

**Tabs — `app/(tabs)/_layout.tsx` :**
- `index` déclaré **une fois** (`:15`), `garden` (`:16-21`, `href:null`), `circle` (`:23`, `href:null`).

**Chaîne de montage de l'accueil (unique) :** root `<Stack>` → écran `(tabs)` → `<Tabs>` → onglet `index`.
L'accueil **n'est pas** atteignable par deux chemins : il n'est **pas** déclaré dans le Stack ET dans les Tabs
(le Stack ne connaît que le groupe). **Il ne peut donc pas être monté par deux navigateurs à la fois.** →
sous-hypothèse « déclarée deux fois » **RÉFUTÉE**.

## 2. Les onglets non-focalisés ne montent pas au cold start (donc pas une 2ᵉ barre depuis les Tabs)

- bottom-tabs v7 : **`lazy = true` par défaut** (`node_modules/@react-navigation/bottom-tabs/lib/module/views/BottomTabView.js:174`).
- Un écran lazy **n'est pas rendu** tant qu'on n'y a pas navigué ni préchargé :
  `if (lazy && !loaded.includes(route.key) && !isFocused && !isPreloaded) return null` (`:180-181`).
- `detachInactiveScreens` actif sur iOS (`:53`).

⇒ Au **cold start**, seul l'onglet focalisé (`index`) est monté. **`garden` et `circle` ne montent pas** — donc
la 2ᵉ barre **n'est pas** la `PrimaryNavBar` de `garden` (qui, sinon, verrait aussi `pathname='/'` et
soulignerait « Jardin » — ce qui aurait collé aux preuves, mais le lazy l'exclut). `circle` = `<Redirect>`
(rend `null`, aucune barre de toute façon). → sous-hypothèse « onglet monté d'office » **RÉFUTÉE**.

**La tabBar native** : `<Tabs>` n'a **pas** de prop `tabBar` custom ; la tabBar par défaut est rendue puis
**masquée** par `screenOptions.tabBarStyle = { display: 'none' }` (`app/(tabs)/_layout.tsx:10`). Elle ne rend
**pas** `PrimaryNavBar`. La 2ᵉ rangée (soulignée « Jardin ») est donc bien une **2ᵉ `PrimaryNavBar`**, pas la
tabBar native — cohérent avec ta preuve des deux soulignements, et cohérent avec le fait qu'**aucune** de ces
deux barres ne peut provenir de la source au cold start.

**`PrimaryNavBar` elle-même ne se rend qu'une fois par instance** : `components/ui/PrimaryNavBar.tsx` = un seul
`<View style={styles.bar}>` (`:66`), un seul `.map` (`:67`), actif calculé via `usePathname()` (`:48`). Et
`app/(tabs)/index.tsx` monte `<PrimaryNavBar />` **une fois** (`:385`).

**Conclusion §1-§2 : la source = 1 barre au cold start. Le double-montage n'est pas dans le code.**

## 3. Instrumentation décisive (à publier, PAS encore appliquée) — compter les instances au lancement

Comme la source dit « 1 » et le device montre « 2 », **seul un compteur runtime tranche**. Sonde minimale, dans
`components/ui/PrimaryNavBar.tsx` :

```tsx
// ── SONDE B33 (temporaire) ──────────────────────────────────────────
let __b33_seq = 0;                       // portée module : compteur global d'instances
// dans le composant :
const __b33_id = useRef(0);
if (__b33_id.current === 0) { __b33_seq += 1; __b33_id.current = __b33_seq; }
// rendu, en tête de la barre :
<Text style={{ position:'absolute', top:-14, left:6, fontSize:9, color:'red' }}>
  {`#${__b33_id.current}/${__b33_seq} @${usePathname()}`}
</Text>
```

**Lecture SANS build natif** : c'est du **JS pur** → publiable en **OTA sur le canal `production`**
(`eas update`, zéro build). La sonde s'affiche **à l'écran** : Samo regarde simplement.
- S'il voit **deux barres** marquées p.ex. `#1/2 @/` et `#2/2 @/` → **double-montage réel confirmé (P2)**, avec la
  route de chaque instance (le `@…` dit d'où vient le doublon).
- S'il ne voit **qu'une** barre `#1/1 @/` mais toujours le fantôme au-dessus → la 2ᵉ rangée **n'est pas une
  `PrimaryNavBar` vivante** → **snapshot natif figé** (react-native-screens), piste P2-bis.
- **Si la sonde n'apparaît nulle part** après publication → l'OTA **ne s'applique pas** sur ce device → **P1
  confirmée** (bundle exécuté ≠ source ; c'est LA raison pour laquelle B30 et B32 n'ont rien changé). Vérifier
  alors l'update ID exécuté et republier avec `--clear-cache`.

_(Variante console si un dev client est dispo : `useEffect(() => console.log('[B33]', __b33_id.current, pathname), [])` — mais sur un build **production** Hermes les logs ne sont pas lisibles sans dev client/Metro ; l'affichage on-screen est la voie « sans build natif ».)_

## 4. Le contenu de l'accueil est-il rendu dans deux conteneurs ? Hauteurs/insets

**Statique : non.** `index.tsx` est rendu **une seule fois**, dans la scène du `<Tabs>`, elle-même dans la carte
`(tabs)` du root `<Stack>` — **une seule chaîne imbriquée** (carte Stack → scène Tabs → index), pas « une fois
dans le Stack ET une fois dans les Tabs ».

Hauteurs en jeu (pour expliquer le **tiers supérieur** si P2) :
- `index.tsx` : `styles.screen` `flex:1` ; header `paddingTop:40` ; `atlasWrap` `flex:1` +
  `paddingBottom: Math.max(spacing.md, bottomInset)` ; `PrimaryNavBar` **en flux**, ancrée en bas, avec
  `paddingBottom: bottomInset + spacing.xs` (`PrimaryNavBar.tsx:66`). → la barre légitime est au **bas**.
- Depuis B32, carte Stack `contentStyle` et scène Tabs `sceneStyle` sont **opaques** (`background.primary`). Si les
  deux instances étaient **empilées** (Stack) ou **onglet-sur-onglet** (Tabs), l'opaque **masquerait** celle du
  dessous → **le fantôme aurait disparu**. Il **persiste** ⇒ les deux barres **ne sont pas** dans une relation
  dessus/dessous couverte par un fond opaque : soit elles vivent dans **le même plan** (P2, même conteneur), soit
  la 2ᵉ est un **résidu de rendu** hors conteneur normal (snapshot figé), soit le **bundle n'a pas changé** (P1).
- Le **tiers supérieur** implique que l'instance fantôme a une **hauteur de conteneur différente** (sa barre
  ancrée en bas tombe plus haut). La sonde §3, en ajoutant `onLayout` sur la barre pour afficher son `y` et la
  hauteur du parent, **mesurera** cet écart et dira quel conteneur est court.

Ajout `onLayout` suggéré à la sonde :
```tsx
onLayout={(e) => console/*ou <Text>*/ (`#${__b33_id.current} y=${Math.round(e.nativeEvent.layout.y)} h=${Math.round(e.nativeEvent.layout.height)}`)}
```

---

## Synthèse & prochaine action

| Point | Résultat |
|---|---|
| Route `/` déclarée 2× ? | **Non** — 1 seul fichier, Stack déclare le groupe `(tabs)` 1×, index 1× (§1) |
| Accueil montable par 2 navigateurs ? | **Non** — chaîne unique Stack→(tabs)→Tabs→index (§1) |
| Onglets montés au cold start ? | **Seul `index`** — `lazy=true`, garden/circle non montés (§2) |
| tabBar native = 2ᵉ barre ? | **Non** — masquée `display:none`, ne rend pas `PrimaryNavBar` ; la 2ᵉ rangée soulignée est bien une 2ᵉ `PrimaryNavBar` (§2) |
| Contenu rendu dans 2 conteneurs ? | **Non (statique)** — une seule chaîne imbriquée (§4) |
| Pourquoi B32 opaque n'a rien changé ? | Les 2 barres **ne sont pas** dessus/dessous couvrables → même plan (P2) **ou** bundle inchangé (P1) (§4) |

**La source est propre ; le double n'en vient pas.** La cause est **runtime ou bundle**, et **l'instrumentation
on-screen (§3), publiable en OTA sans build natif, tranche P1 vs P2** et, si P2, nomme la route du doublon.
Recommandation : publier la sonde (sur ton GO), lire à l'écran, puis retirer. En parallèle, **confirmer l'update
ID réellement exécuté** sur le device — si la sonde n'apparaît pas, c'est P1 (l'OTA n'atteint pas le device),
ce qui expliquerait à lui seul pourquoi B30 et B32 n'ont rien changé.

_Diagnostic seul. Aucune modification de code de production, aucun OTA, aucun SQL. STOP — attente du GO de Samo._
