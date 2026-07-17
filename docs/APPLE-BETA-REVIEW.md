# APPLE-BETA-REVIEW — kit de soumission TestFlight (build 31, distribution externe)

> Préparé 2026-07-17. Aucune modification d'app/SQL — document seul.
> Cible : Beta App Review pour distribution externe du build 31.

---

## 1. DIAGNOSTIC AUTH

**Mode Supabase utilisé : (b) magic link / OTP par email** — `signInWithOtp` + `verifyOtp`.
Un second chemin **Apple Sign In** existe en alternative.

Preuves code :

- Écran : `app/auth/sign-in.tsx`
  - `handleSendCode` → `requestEmailOtp(email)` (ligne 55)
  - `handleVerify` → `verifyEmailOtp(email, code)` (ligne 74) — saisie d'un **code à 6 chiffres** (ligne 194-208)
  - `handleApple` → `signInWithApple()` (ligne 39) — bouton « Continue with Apple »
- Implémentation : `lib/supabase-auth.ts`
  - `requestEmailOtp` → `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })` (≈ ligne 102-105)
  - `verifyEmailOtp` → `supabase.auth.verifyOtp({ email, token, type: 'email' })` (≈ ligne 116-120)
  - `signInWithApple` → `supabase.auth.signInWithIdToken({ provider: 'apple', ... })` (≈ ligne 69-72)

**Il n'y a NI mot de passe, NI étape de confirmation d'email préalable.** `shouldCreateUser: true` :
l'inscription est libre et se fait **dans l'app** — l'utilisateur saisit un email, reçoit un code à
6 chiffres, le saisit, et il est connecté (le code EST l'authentification). Aucun `signInWithPassword`,
aucun `signUp` mot de passe, aucun écran « confirmez votre email avant de vous connecter ».

### ⚠️ Conséquence pour la review Apple (à traiter — voir §3 prérequis)

Un compte OTP **pré-rempli ne peut pas être ouvert par un reviewer** : le code part dans une boîte
mail que le reviewer ne possède pas. Deux solutions, par ordre de préférence :

- **(recommandé) Test OTP fixe** (config dashboard Supabase, action Samo) : mapper
  `mpksam+baobab.review@gmail.com` → code fixe **`424242`**. Le reviewer saisit l'email + ce code,
  et atterrit sur le **compte review pré-seedé** (relation révélée, lieux, pass) sans accès à la boîte.
  *Supabase → Authentication → (Providers/Email) → Test OTPs → ajouter la paire email/code.*
- **(repli)** Le reviewer s'inscrit avec **sa propre** adresse (onboarding complet) et ouvre un
  **lien d'invitation live** collé dans les Review Notes (généré depuis PhoneA juste avant soumission).

Le reste du kit suppose l'option recommandée (Test OTP `424242`).

---

## 2. FICHE FORMULAIRE APPLE (copier-coller)

### Beta App Description (FR)
```
Baobab est une app privée pour prendre soin de ses vraies relations — l'inverse d'un réseau social : pas de followers, pas d'inconnus. À tester : création du profil (nom + @pseudo), connexion avec un proche via lien d'invitation ou QR code, lecture privée de la relation, ouverture du reveal mutuel quand les deux côtés ont répondu, ajout de lieux favoris, et partage d'un lieu à un contact. Signalez tout ce qui est bloquant, incompréhensible ou inattendu, même minuscule.
```

### Feedback Email
```
mpksam@gmail.com
```

### Sign-In Information
```
Sign-In required: YES
User Name: mpksam+baobab.review@gmail.com
Password:  OTP-see-notes
```
*(Baobab n'a pas de mot de passe — le champ Password est un marqueur ; le vrai code est dans les Review Notes ci-dessous.)*

### Review Notes (bilingue FR / EN — coller tel quel)
```
FR —
Baobab utilise une connexion SANS mot de passe (code par email), pas de mot de passe classique.

Pour vous connecter au compte de test :
1. Ouvrez l'app, « Continue with email ».
2. Email : mpksam+baobab.review@gmail.com
3. « Send code », puis saisissez le code : 424242
   (code de test fixe configuré pour la review — pas besoin d'accéder à une boîte mail)
Ce compte est déjà configuré (profil @baobab.review, une relation révélée, des lieux, un lieu partagé) — vous avez tout de suite du contenu réel à explorer.

Alternative : « Continue with email » avec VOTRE propre adresse crée un compte vierge (démo de l'inscription libre). « Continue with Apple » fonctionne aussi mais démarre vide.
Note : le cœur de l'app (reveal mutuel) nécessite deux personnes ; le compte de test contient déjà une relation complétée pour que vous puissiez l'ouvrir immédiatement.

EN —
Baobab uses PASSWORDLESS sign-in (email code) — there is no traditional password.

To sign in to the test account:
1. Open the app, tap "Continue with email".
2. Email: mpksam+baobab.review@gmail.com
3. Tap "Send code", then enter code: 424242
   (fixed test code configured for review — no mailbox access needed)
This account is pre-set (profile @baobab.review, one revealed relationship, saved places, a shared place) — real content is available immediately.

Alternative: "Continue with email" with YOUR OWN address creates a fresh empty account (shows the free sign-up). "Continue with Apple" also works but starts empty.
Note: the core feature (mutual reveal) requires two people; the test account already contains a completed relationship so you can open it right away.
```

---

## 3. CHECKLIST DEVICE — créer le compte review avec une connexion active

**Chemin le plus rapide : deux iPhones physiques sur le build 31 TestFlight.**
- **PhoneA** = ton iPhone habituel (déjà peuplé) → émet l'invitation.
- **Compte review** = le second iPhone (iPhoneBB), déconnecté puis reconnecté sur l'alias review.

Faire le seed sur le **vrai build 31** (même binaire + même backend prod que le reviewer) est plus fidèle
qu'un simulateur. *(Alternative simulateur : `eas build --profile development-simulator` puis l'installer —
plus lent, et Apple Sign In n'y fonctionne pas ; à éviter sauf si pas de 2ᵉ device.)*

### Prérequis (Samo, dashboard — une fois)
0. Supabase → Authentication → Email → **Test OTPs** : ajouter
   `mpksam+baobab.review@gmail.com` → `424242`. (Sans ça, le reviewer ne pourra pas se connecter.)

### Seed du compte review (ordre exact)
1. **iPhoneBB** : ouvrir Baobab (build 31) → Réglages → **Se déconnecter** (si un compte est actif).
2. **S'inscrire en review** : « Continue with email » → `mpksam+baobab.review@gmail.com` → « Send code »
   → saisir `424242` (Test OTP) → connecté.
3. **Setup profil** : nom « Baobab Review », handle suggéré **`@baobab.review`** → enregistrer.
   Vérifier l'affichage `@baobab.review·xxxxxx` (suffixe B16).
4. **PhoneA** : créer/ouvrir une relation → **générer le lien d'invitation** (ou afficher le QR).
5. **Ouvrir le lien sur iPhoneBB** (compte review) → « Continue and read » → **claim** → faire la
   **lecture privée** (répondre à l'évaluation) → save. La relation passe en attente de l'autre côté.
6. **PhoneA** : ouvrir la même relation → compléter **sa** lecture privée. Dès que les deux côtés sont
   « in », le **reveal mutuel** devient ouvrable des deux côtés.
7. **iPhoneBB** : ouvrir le reveal (cinématique + nom + tier) → confirme que le compte review a une
   relation **révélée** réelle.
8. **Lieux + pass** (pour couvrir la description) : sur PhoneA, garder un lieu (kept) puis **le partager**
   (« Who came to mind? » → Baobab Review). Sur iPhoneBB, le lieu **reçu** apparaît → le garder.
   Optionnel : iPhoneBB garde aussi un lieu à lui.
9. **Vérif finale iPhoneBB** : Garden montre la relation révélée avec nom réel ; barre de navigation
   permanente (Garden/Places/Reveals/You) ; au moins un lieu ; un reveal ouvrable/ouvert.
10. **Laisser iPhoneBB connecté** sur l'alias — le reviewer rejoindra le **même compte** via le Test OTP.

### Au moment de soumettre
- Générer un **lien d'invitation frais** depuis PhoneA et le coller dans les Review Notes **uniquement**
  si tu choisis le repli (self-signup) au lieu du Test OTP. Avec le Test OTP, inutile.
- Vérifier build 31 en « Ready to Submit », remplir §2, cocher les capacités de chiffrement/export
  (usage standard), soumettre.

---

## Récapitulatif à cocher avant envoi
- [ ] Test OTP `mpksam+baobab.review@gmail.com` → `424242` configuré (Supabase)
- [ ] Compte review seedé (profil @baobab.review + relation révélée + lieux + pass)
- [ ] iPhoneBB laissé connecté sur l'alias
- [ ] §2 collé dans App Store Connect (Description, Feedback Email, Sign-In Info, Review Notes bilingues)
- [ ] Build 31 sélectionné pour la review externe
