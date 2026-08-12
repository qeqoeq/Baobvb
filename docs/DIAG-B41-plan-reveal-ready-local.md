# DIAG-B41 — Plan : bootstrap `revealed` sans `firstViewedAt` local → statut local `reveal_ready`

> **Diagnostic d'implémentation. Aucun code écrit.** Décision produit actée (non rediscutée) : au bootstrap, une
> relation dont le statut serveur est `revealed` mais dont le `firstViewedAt` LOCAL est absent doit être mappée en
> statut local `reveal_ready`, pour rendre la cérémonie au 2ᵉ participant. Chaque réponse : `fichier:ligne` ou « NON PROUVÉ ».

---

## 1. `reveal_ready` local exige-t-il d'autres champs ?

**Non — le statut seul suffit ; les champs manquants sont sans danger.**
- **Listing Révélations** : `readyEntries` filtre `status === 'reveal_ready'` (`app/reveals/index.tsx:57`) — aucun
  autre champ requis.
- **Fiche `relation/[id]`** : `getReadingCardVariant` renvoie `'reveal_ready'` sur le seul `status`
  (`lib/relation-detail-helpers.ts:387,389`) → carte **non-révélante** avec CTA. Le **countdown** utilise `unlockAt`
  mais **uniquement en `cooking_reveal`** (`app/relation/[id].tsx:103-104`, effets gardés cooking `:215-217,:244-247`)
  → non lu en `reveal_ready`.
- **Cérémonie** : `openMutualRevealInState` appelle d'abord `markRevealReadyIfUnlockedInState`, qui **retourne
  `false` proprement** si `status !== 'cooking_reveal'` (`store:1903`) ou `!unlockAt` (`:1904`) — pas de crash ; puis
  la branche `reveal_ready` (`store:1957-1975`) transite sans besoin de `unlock_at`/`ready_at`/payloads.

⇒ Un `reveal_ready` bootstrappé sans `ready_at`/`unlock_at`/payloads : **rendu OK, cérémonie OK, aucun crash**.

## 2. Quel `nextAction`/`ctaKind` produit la fiche ? Le CTA `reveal` apparaît-il ?

**Le CTA existe déjà — mais il est gouverné par `nameRevealed`, et l'overlay le remet à `true` → CTA MASQUÉ.**
- `getRelationNextAction` : **si `nameRevealed` → `ctaKind: null`** (`lib/relation-detail-helpers.ts:272-278`,
  court-circuit) ; **sinon si `revealStatus === 'revealed'` → `ctaKind: 'reveal'`** (`:284-290`, « Ouvre ce que
  Baobab a trouvé », commentaire `:281-283` : conçu pour le 2ᵉ participant, « no score info exposed ») ; idem
  `reveal_ready` (`:295-301`).
- Donc le CTA `reveal` s'affiche **ssi `nameRevealed === false`**.
- Or `nameRevealed` (`app/relation/[id].tsx:387-390`) se calcule sur `relationForDisplay = effectiveRelation`
  (`:384`), et `getEffectiveRevealSnapshot` (`lib/relationship-reveal-precedence.ts:28-49`, branche `else`) **adopte
  le serveur en bloc** : `status = sharedReveal.status` (`revealed`), `firstViewedAt = sharedReveal.first_viewed_at`
  (`:37` — **non-null**, valeur globale posée par le 1ᵉʳ participant, cf. faits), `relationship_name_revealed = true`
  (`:47`). ⇒ **`nameRevealed = true`** dès que `sharedReveal` est chargé → **`ctaKind = null` → CTA NON affiché**.

**Conclusion (le caveat était juste)** : avec le seul mapping store→`reveal_ready`, la fiche **n'affiche PAS** le
CTA, car l'overlay `sharedReveal` reflète `first_viewed_at` serveur → `nameRevealed=true`. **Il faut aussi corriger
`getEffectiveRevealSnapshot`** (cf. Q5 fuite + plan §3), sinon B41 échoue sur la fiche.

## 3. Chemin si l'utilisateur tape « révéler » (en supposant le CTA affiché, cf. §2/plan)

Prouvé, séquence :
1. `handleOpenReveal` (`app/relation/[id].tsx:514`) déclenché par `ctaKind==='reveal'` (`:716-718`).
2. `sharedReveal` non-null → `openSharedReveal(relationshipId)` (`:539`) → **serveur retourne early, `status='revealed'`
   inchangé** (fait établi).
3. `if (!updatedRecord || updatedRecord.status !== 'revealed')` (`:540`) est **FAUX** (c'est `revealed`) → la branche
   interne (`syncSharedRevealToReady`+`revealMutualRelationship`, `:545-546`) est **sautée**.
4. Après `Promise.all`, `:587` **`revealMutualRelationship(relation.id)`** (« stamp on every success path ») →
   `openMutualReveal` (`store:2092-2093`) → `openMutualRevealInState` (`store:1930`).
5. Le **store** local a `status='reveal_ready'` (mapping B41) → `markRevealReadyIfUnlockedInState` renvoie false
   (pas cooking) → on tombe dans la branche `snapshot.status === 'reveal_ready'` (`store:1955-1975`) → **pose
   `status='revealed'`, `revealed:true`, `firstViewedAt: ... ?? now`** (`:1970`) + `revealedAt`.

⇒ **Oui, `openMutualRevealInState` pose bien `firstViewedAt` local** (via la branche reveal_ready). La cérémonie
joue et le champ est stampé. **Pré-requis : que le CTA soit affiché (Q2 → plan §3).**

## 4. Risque de boucle ?

**Pas de boucle SI la condition lit le `firstViewedAt` LOCAL de l'existant — ce qui impose de décider dans l'upsert,
pas dans le mapping pur.**
- Le mapping pur `buildSharedRevealLocalState` **ne connaît pas** le local (fonction de `data` seul,
  `store:2722`), et **la RPC ne renvoie pas `first_viewed_at`** (colonnes B38 : jusqu'à `mutual_score`, pas de
  `first_viewed_at`). ⇒ La bascule « → reveal_ready si firstViewedAt local absent » **doit vivre dans
  `upsertBootstrappedSharedRelations`**, où `existing` est disponible (`store:2829`).
- Persistance/relecture de `firstViewedAt` : écrit par la cérémonie (`store:1970`) → **persisté** (`persist()`
  sérialise `state.relations`, gardé `hydrated` `store:1511`) → **relu à l'hydratation** (`applyHydratedState`
  mappe `rawReveal.firstViewedAt`, `store:1485-1487`). ⇒ après cérémonie, `existing.firstViewedAt` est présent →
  le prochain bootstrap **ne re-bascule pas**. **Prouvé, pas de boucle.**
- ⚠️ Obstacle : `mergeBootstrappedRevealSnapshot` **interdit tout downgrade** (`server rank <= local rank →
  return local`, `store:2768` région) — or `revealed(3) → reveal_ready(2)` EST un downgrade. La bascule B41 devra
  **contourner cette garde** pour le seul cas « existant/nouveau sans `firstViewedAt` local ».

## 5. Effets de bord & FUITE (la question la plus importante)

**Sur les écrans qui lisent le STORE nu, aucune fuite — le `reveal_ready` local ferme bien les portes :**
- **Jardin / nœud** : `isRevealedNetworkMember` exige `status==='revealed'` (`lib/relation-visibility.ts:` fonction)
  → un `reveal_ready` **quitte l'atlas** (nœud disparaît, `networkCount` baisse) jusqu'à la cérémonie. `deriveLinkQualityBand`
  reste `'faint'` de toute façon (`circle-node-state:227`). **Effet visible (nœud absent), PAS de fuite de score.**
- **Rechercher (ligne)** : `isRevealed = status==='revealed' && firstViewedAt` (`garden.tsx:432`) → `false` → ligne
  non-révélante.
- **Santé / Liens partagés** : `getRevealedLinkStrength` exige `status==='revealed'` (`garden.tsx:84`) → exclu →
  reste vide jusqu'à la cérémonie (intention).
- **Lexique** : `isLexiconDiscoverable` exige `revealed + firstViewedAt` (`relation-visibility.ts:36`) → exclu.
- **Notifications** : `reveal_ready` local est un état **client** ; n'enqueue rien côté serveur. Effet : la relation
  entre dans le **badge « Révélations »** (`getPrimaryNavItems` compte reveal_ready+forming) — intentionnel.

**⚠️ LA FUITE réelle est sur `relation/[id]` via l'overlay** : `getEffectiveRevealSnapshot` (branche `else`,
`precedence:28-49`) renvoie `status='revealed'`, `mutualScore`, `tier`, `firstViewedAt` serveur **dès que
`sharedReveal` est chargé** → `nameRevealed=true` → `getReadingCardVariant` renvoie `'revealed'`
(`relation-detail-helpers.ts:384`) → **la carte affiche tier + score SANS cérémonie**. Le mapping store seul ne
protège pas la fiche. **C'est l'item bloquant du plan (§3) : `getEffectiveRevealSnapshot` doit respecter un
`reveal_ready` local (firstViewedAt local absent) et ne PAS exposer status revealed/score/first_viewed_at avant la
cérémonie.** Sans ça, B41 fuit précisément là où la cérémonie devait se jouer.

## 6. Les 2 doublons PhoneA↔iPhoneBB (51ed8b2b, 08ae6e54, score 26)

Ils réapparaîtront en `reveal_ready` (listés + badge). **Risque au-delà du bruit visuel : aucun risque
fonctionnel prouvé.** Pas de mutation serveur (openSharedReveal early-return sur `revealed` ; `reveal_ready` local
n'écrit rien côté serveur) ; ouvrir la cérémonie stampe juste leur `firstViewedAt` local (idempotent). Seuls effets :
**bruit dans Révélations + inflation du badge**. (Rappel B34 : ce sont des relations d'appareils de test ; leur
exclusion serait un chantier distinct, hors décision B41.)

## 7. Tests à adapter

Cassent tous les tests qui bootstrappent une ligne `revealed` **sans `firstViewedAt` local** et attendent un
statut local `revealed` :
- `store/useRelationsStore.test.ts` — **`makeBootstrapRow` (`:790-793`, `status:'revealed'`, sans firstViewedAt)**
  utilisé aux `:817,836,882,899,922,931,968,1059` (T7/T8/T12/T14/B25/x2/x5) : ceux qui vérifient `revealed`/
  éligibilité-pass casseront (deviendront `reveal_ready`).
- **Y1** (`:1429-1436`, existing waiting → bootstrap revealed → `expect status 'revealed'` `:1433`) : existant sans
  firstViewedAt → deviendra `reveal_ready` → **casse**.
- **Y5** (`:1463-`, waiting → revealed → « pass-eligible ») et **Y6** (`:1471-`, brand-new revealed → « creates a
  revealed relation ») : **cassent** (deviennent reveal_ready).
- **Y8** (B38 backfill, `injectExisting({revealed, mutualScore:42})` **sans** firstViewedAt) : le statut basculera
  → à ajuster (ajouter `firstViewedAt` au fixture pour garder l'intention « déjà révélé »).
- **OK sans changement** : Y2/Y3/Y4/Y7 (leur existant porte déjà `firstViewedAt`) → restent `revealed`.
- Précédence : `lib/relationship-reveal-precedence.test.ts` — si §3 modifie `getEffectiveRevealSnapshot`, ajouter
  un cas « local reveal_ready + firstViewedAt absent → ne pas exposer revealed » (nouveau test, pas une casse).

**Règle d'adaptation** : là où le test veut « déjà révélé et ouvert », **ajouter `firstViewedAt` au fixture** ; là
où il veut « 2ᵉ participant / non ouvert », **attendre `reveal_ready`**.

---

## PLAN D'IMPLÉMENTATION (ordonné — aucun code écrit ici)

1. `store/useRelationsStore.ts` — `upsertBootstrappedSharedRelations` (`:2818`) : si la ligne serveur est `revealed`
   ET que le local n'a pas de `firstViewedAt` (nouvelle relation, ou `existing.…revealSnapshot.firstViewedAt`
   undefined), matérialiser/garder le statut local **`reveal_ready`** au lieu de `revealed`.
2. `store/useRelationsStore.ts` — `mergeBootstrappedRevealSnapshot` (`:2764` région) : autoriser le downgrade
   `revealed → reveal_ready` pour ce seul cas (la garde no-downgrade actuelle le bloque), en préservant l'absorption
   ultérieure de `mutualScore`/`tier`.
3. `lib/relationship-reveal-precedence.ts` — `getEffectiveRevealSnapshot` (`:5`) : quand le local est `reveal_ready`
   avec `firstViewedAt` absent, **ne pas** laisser l'overlay `sharedReveal` flipper en `revealed` ni exposer
   `first_viewed_at`/`mutualScore`/`tier` — garder la porte fermée jusqu'à la cérémonie. **(Item bloquant : sans lui,
   pas de CTA + fuite sur la fiche, cf. Q2/Q5.)**
4. (vérifié, aucun changement) `getRelationNextAction` (`relation-detail-helpers.ts:284-301`) et `getReadingCardVariant`
   (`:387`) produisent déjà le CTA/variant `reveal_ready` quand `nameRevealed=false` ; `handleOpenReveal`+`:587`
   stampent déjà `firstViewedAt` (Q3). Rien à modifier une fois §3 fait.
5. `store/useRelationsStore.test.ts` — mettre à jour fixtures/attentes (Q7) : ajouter `firstViewedAt` là où
   l'intention est « déjà révélé », attendre `reveal_ready` là où c'est « 2ᵉ participant » (Y1/Y5/Y6/Y8 + les
   `makeBootstrapRow`).
6. `lib/relationship-reveal-precedence.test.ts` — ajouter le cas de non-exposition (local reveal_ready + firstViewedAt
   absent) introduit en §3.

_Diagnostic seul. Aucun code écrit, aucun SQL, aucun correctif appliqué._
