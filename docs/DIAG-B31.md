# Rapport de diagnostic — B31

> Constat device (OTA B30 `461674d`, accueil, capture) :
> (1) la barre de nav apparaît **deux fois** sur l'accueil — une rangée grise mi-hauteur dans le cadre de
> l'atlas + la barre du bas correcte (entrée active soulignée) ; (2) **deux nœuds « iPhoneBB »** sur l'atlas
> alors que l'en-tête compte 2.
>
> **Diagnostic seul — aucune ligne de production modifiée, aucun fix, aucun OTA, aucun SQL.** Preuves `fichier:ligne`.
> STOP : attente du GO Samo.

---

## Issue 1 — « double barre de nav » sur l'accueil

### Ce que la SOURCE `461674d` contient réellement (preuves)

**A. `PrimaryNavBar` est monté EXACTEMENT une fois par écran.**
`grep -rc "<PrimaryNavBar"` sur `app/` : `index`=1, `garden`=1, `place/index`=1, `reveals`=1, `profile`=1 ; tous
les autres = 0. Aucun layout (`app/_layout.tsx`, `app/(tabs)/_layout.tsx`) ne le monte.

**B. L'ancien bloc `primaryNav` a bien été RETIRÉ du JSX (pas seulement ses styles).**
`app/(tabs)/index.tsx` : un seul `<PrimaryNavBar />` (`:385`), précédé du commentaire B23+B30 (`:382-384`).
`grep "primaryNav" app/(tabs)/index.tsx` → **aucune** occurrence : ni `styles.primaryNav*`, ni
`getPrimaryNavItems`, ni `routeByKey`. L'ancien bloc `<View style={[styles.primaryNav…]}>{getPrimaryNavItems().map(...)}</View>`
n'existe plus. L'arbre de rendu de l'accueil (`index.tsx:202-387`) est :
`screen > [glowAccent(abs), header, atlasWrap(flex:1){worldCard}, PlaceReceivedSheet(Modal), Modal, PrimaryNavBar]`
→ **un seul** nœud de barre, en dernier.

**C. `PrimaryNavBar` est EN FLUX (pas `absolute`), et ne rend qu'UNE rangée.**
`components/ui/PrimaryNavBar.tsx` : `styles.bar` = `flexDirection:'row' + borderTopWidth:1`, **sans**
`position:absolute` ni `bottom` (`:106-113`). Le seul `position:'absolute'` du fichier est le **badge** (`:133`,
un pastille sur « Révélations »). Le rendu est **un seul** `<View style={styles.bar}>` avec **un seul** `.map`
sur 5 items (`:66-101`). Les items sont des cellules `flex:1` **sans séparateur** — la barre **ne met aucun
middot** entre les libellés.

**D. La rangée grise mi-atlas n'est AUCUN de ces composants.**
- Ce n'est pas le `worldsStrip` (`index.tsx:292-333`) : il rend des **libellés de mondes** —
  `Vie locale / Apprentissage / Créatif / Sport / Voyage / Culture` (`lib/relation-open-worlds.ts:18-25`),
  séparés par « · ». Jamais les libellés de nav.
- Ce n'est pas `EgoGraph` : il rend des **noms de nœuds** (initiales/prénoms des counterparts), pas de rangée de nav.
- **Seul `PrimaryNavBar` produit les libellés `Jardin/Rechercher/Lieux/Révélations/Toi`** — et il est monté une
  seule fois, en bas, sans middot.

**E. Les 4 autres écrans : même schéma, une seule barre.**
`garden`, `place/index`, `reveals`, `profile` montent chacun `<PrimaryNavBar />` **une fois**, enveloppé
`<View flex:1><ScrollView/><PrimaryNavBar/></View>`. Aucun double montage nulle part.

### Conclusion issue 1

**La source livrée `461674d` rend exactement UNE barre par écran.** Une seconde rangée identique de libellés de
nav n'est **pas productible** depuis ce code : pas de double montage, ancien bloc supprimé, composant en flux et
à rangée unique. Le symptôme « deux barres » est donc un **écart entre la source et l'artefact réellement exécuté
sur le device** — pas une régression de montage dans le JSX.

Deux causes candidates, **discriminables par un test simple** (à faire par Samo) :

1. **OTA pas appliqué proprement / résidu de transition.** `expo-updates` swappe le bundle au **cold start
   suivant** le téléchargement. Si l'app a été consultée pendant l'application de l'update, un frame résiduel de
   l'ancien rendu peut coexister le temps d'un lancement.
   → **Test décisif** : tuer complètement Baobab (balayer dans le multitâche) et relancer **deux fois** ;
   re-capturer. Vérifier l'update ID exécuté = **`019fd148`** (B30). Si la 2ᵉ barre disparaît → artefact de
   transition, **rien à corriger dans le code**.
2. **Bundle OTA périmé (cache de transform Metro).** `eas update` a été lancé juste après les Edits ; si Metro a
   embarqué un transform en cache d'`index.tsx` **antérieur** au retrait du bloc, le bundle publié pourrait ne pas
   refléter la source (qui, elle, est propre). L'ancien bloc était `position:absolute, bottom:0` **4 entrées**
   (Jardin·Lieux·Révélations·Toi, **sans** « Rechercher ») → il se superposerait en bas ; couplé à la nouvelle
   barre en flux, on obtiendrait deux rangées.
   → Si le test 1 montre que la 2ᵉ barre **persiste** sur un cold start propre confirmé `019fd148`, la cause est
   celle-ci.

### Chiffrage du fix (NON appliqué)

| Cause confirmée | Fix | Fichiers | OTA-able |
|---|---|---|---|
| (1) transition/stale device | relancer l'app (kill + cold start ×2) | **0** | — (pas même un OTA) |
| (2) bundle Metro périmé | **republier** l'OTA avec cache propre : `eas update --channel production --platform ios --clear-cache` | **0** source | Oui (OTA, **GO Samo requis**) |
| (hypothétique) vrai double-montage source | retirer le doublon | 1 | Oui |

**La source étant prouvée propre, le fix le plus probable est (2) : une republication OTA `--clear-cache`, zéro
changement de code.** À valider par le test décisif ci-dessus **avant** toute republication. Je n'applique rien.

---

## Issue 2 — deux nœuds « iPhoneBB » (en-tête = 2)

### Source des nœuds (preuves)

- **Dérivation** : `app/(tabs)/index.tsx:62-85` — `graphMembers = readings.filter(isRevealedNetworkMember).map(...)`,
  chaque membre `id: r.relation.id` (**id LOCAL**), `name: getRelationSheetIdentity(...).primaryTitle`.
- **Compteur d'en-tête** : `networkCount = graphMembers.length` (`:94`) → l'en-tête affiche **2** ⇒ il y a **2
  membres** dans `graphMembers`.
- **Rendu** : `EgoGraph` keye les nœuds par `node.id` (= `r.relation.id`). Si les deux avaient le **même** id,
  React collapserait la clé (un seul nœud + warning de clé dupliquée). Or **deux** nœuds s'affichent **et** le
  compteur = 2.

### Verdict de lecture

⇒ **Deux enregistrements de relation LOCAUX distincts** (deux `r.relation.id` différents), **pas** un seul
enregistrement rendu deux fois par clé dupliquée. Les deux résolvent vers le même `primaryTitle` = « iPhoneBB »
(le `display_name` du counterpart — vraisemblablement un nom d'appareil par défaut ; **le nom n'est pas le bug,
la duplication l'est**).

Reste **une** question, tranchée par la lecture serveur ci-dessous :
- **(A) Duplication SERVEUR** : deux lignes `shared_relationship_reveals` distinctes (deux `relationship_id`)
  pointant vers le **même** counterpart — p.ex. invite réclamée/créée deux fois, ou résidu d'identité orpheline
  (cf. B11). Chaque ligne bootstrappe un enregistrement local ⇒ 2 nœuds.
- **(B) Duplication LOCALE** : une **seule** ligne serveur, mais **deux** enregistrements locaux non dédupliqués
  (l'un via claim `id: r-…` + `canonicalRelationId`, l'autre via bootstrap ; si la clé de merge
  `canonicalRelationId` diffère/est nulle sur l'un, le dédup par `canonicalRelationId` les rate).

La requête ci-dessous **distingue** : 2 lignes même counterpart → cas (A) ; 1 seule ligne → cas (B).

### Requête de LECTURE SEULE pour Samo (SELECT — à exécuter par lui, aucun DELETE)

Schéma confirmé : `public.shared_relationship_reveals` (PK `relationship_id text`, `side_a_user_id uuid`,
`side_b_user_id uuid`, `status`, `mutual_score`, `tier`, `created_at`) ; counterpart via
`public.user_public_profiles (user_id, display_name, handle)`.

```sql
-- LECTURE SEULE. Liste toutes les relations de Samo + le counterpart de chacune.
-- Deux lignes avec le MÊME counterpart_user_id => duplication SERVEUR (cas A).
-- Une seule ligne => la duplication est LOCALE côté device (cas B).
with me as (
  select id from auth.users where email = 'mpksam@gmail.com'   -- ajuster si besoin
)
select
  r.relationship_id,
  r.status,
  r.mutual_score,
  r.tier,
  r.created_at,
  case when r.side_a_user_id = (select id from me)
       then r.side_b_user_id else r.side_a_user_id end          as counterpart_user_id,
  cp.display_name                                                as counterpart_display_name,
  cp.handle                                                      as counterpart_handle
from public.shared_relationship_reveals r
left join public.user_public_profiles cp
  on cp.user_id = case when r.side_a_user_id = (select id from me)
                       then r.side_b_user_id else r.side_a_user_id end
where (select id from me) in (r.side_a_user_id, r.side_b_user_id)
order by counterpart_display_name nulls last, r.created_at;
```

Lecture du résultat :
- **≥ 2 lignes avec le même `counterpart_user_id`** (ou même `counterpart_display_name` « iPhoneBB ») ⇒ **cas (A)**,
  duplication serveur : deux `relationship_id`, regarde `created_at` pour distinguer l'ancienne de la récente.
- **1 seule ligne** ⇒ **cas (B)**, duplication purement locale (dédup client) : le fix vit côté app (merge par
  `canonicalRelationId`), pas côté base.

_(Optionnel, pour confirmer le counterpart si `iPhoneBB` est ambigu :_
`select user_id, display_name, handle from public.user_public_profiles where display_name = 'iPhoneBB';`_)_

**Aucun `DELETE`, aucune mutation proposée** : le nettoyage éventuel (cas A) et le fix de dédup (cas B) sont des
sujets séparés, à cadrer **après** lecture et **sur ton GO**.

---

## Synthèse

| # | Constat | Verdict de lecture | Fix (non appliqué) |
|---|---|---|---|
| 1 | Double barre accueil | **Source `461674d` = 1 seule barre** (preuves A-E). Écart source↔artefact device | Test décisif kill+relaunch / update id ; si persistant → republier OTA `--clear-cache` (0 fichier, GO requis) |
| 2 | 2 nœuds « iPhoneBB », compteur 2 | **Deux relations LOCALES distinctes** (pas une clé dupliquée). Serveur-ou-local tranché par le SELECT | Après lecture : cas (A) nettoyage base / cas (B) dédup client — **STOP, GO requis** |

_Diagnostic seul. Aucune modification de code de production, aucun SQL exécuté, aucun DELETE proposé.
STOP — attente du GO de Samo._
