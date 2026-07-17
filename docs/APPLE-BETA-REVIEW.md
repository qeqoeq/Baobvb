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
  - `requestEmailOtp` → `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })` (ligne 102-105)
  - `verifyEmailOtp` → `supabase.auth.verifyOtp({ email, token, type: 'email' })` (ligne 116-120)
  - `signInWithApple` → `supabase.auth.signInWithIdToken({ provider: 'apple', ... })` (ligne 69-72)

**Il n'y a NI mot de passe, NI étape de confirmation d'email préalable.** `shouldCreateUser: true` :
l'inscription est libre et se fait **dans l'app** — l'utilisateur saisit un email, reçoit un code à
6 chiffres, le saisit, et il est connecté (le code EST l'authentification). Aucun `signInWithPassword`,
aucun `signUp` mot de passe, aucun écran « confirmez votre email avant de vous connecter ».

### Stratégie reviewer : Sign in with Apple

Un compte OTP **pré-rempli ne peut pas être ouvert par un reviewer** (le code part dans une boîte mail
qu'il ne possède pas), et **Supabase n'a PAS de "Test OTP" pour l'email** — cette fonctionnalité
n'existe que pour le provider **Phone** (vérifié doc + discussions Supabase ; le chemin
Authentication → Email → Test OTPs n'existe pas). N'improvise donc rien sur `auth.users` en prod.

→ **Chemin reviewer = « Sign in with Apple »** (déjà présent, `sign-in.tsx:39`) : **zéro config**, un
compte frais est créé instantanément — parfaitement acceptable pour une **beta review**. Le reviewer
verra l'état vide + les fonctionnalités solo (profil, lieux, invitation) ; le cœur reveal nécessite
deux personnes connectées, ce qui est **attendu** et expliqué dans les Review Notes.

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
User Name: (N/A — use Sign in with Apple, see Review Notes)
Password:  (N/A — passwordless)
```
*(Baobab est sans mot de passe. Le reviewer se connecte via « Sign in with Apple » — aucun identifiant à fournir.)*

### Review Notes (coller tel quel)
```
Sign-in: please use Sign in with Apple - creates an account instantly, no credentials needed. Alternative: email one-time code (open sign-up, any email works). The invitation/reveal flow requires two connected users - a fresh reviewer account will see the empty state plus profile, places, and invitation features, which is expected.
```

---

## 3. CHECKLIST DEVICE (OPTIONNELLE — non nécessaire pour la beta review)

> **Non requis pour la beta review.** Le reviewer se connecte via Sign in with Apple sur un compte
> frais et voit l'état vide + les fonctionnalités solo, ce qui suffit. Cette section n'est utile que si
> tu veux, en plus, montrer un compte déjà peuplé (démo perso) — elle ne conditionne pas la soumission.

**Chemin le plus rapide (si tu le fais quand même) : deux iPhones physiques sur le build 31 TestFlight.**
- **PhoneA** = ton iPhone habituel (déjà peuplé) → émet l'invitation.
- **Second compte** = le second iPhone (iPhoneBB), connecté via Sign in with Apple (ou email code).

Faire le seed sur le vrai build 31 (même binaire + backend prod que le reviewer) est plus fidèle qu'un
simulateur. *(Alternative simulateur : `eas build --profile development-simulator` — plus lent, et Apple
Sign In n'y fonctionne pas.)*

Ordre :
1. **iPhoneBB** : ouvrir Baobab → Réglages → **Se déconnecter** si besoin → « Sign in with Apple ».
2. **Setup profil** : nom + handle (ex. `@demo`) → enregistrer (vérifier le suffixe B16).
3. **PhoneA** : ouvrir/créer une relation → **générer le lien d'invitation** (ou QR).
4. **iPhoneBB** : ouvrir le lien → **claim** → **lecture privée** → save.
5. **PhoneA** : compléter **sa** lecture privée → le **reveal mutuel** devient ouvrable des deux côtés.
6. **iPhoneBB** : ouvrir le reveal (nom + tier réels).
7. **Lieux + pass** : PhoneA garde un lieu (kept) → « Who came to mind? » → le partager au second compte
   → iPhoneBB voit le lieu reçu et le garde.

---

## Récapitulatif à cocher avant envoi
- [ ] §2 collé dans App Store Connect (Description, Feedback Email, Sign-In Info, Review Notes)
- [ ] Build 31 sélectionné pour la review externe
- [ ] « Sign in with Apple » testé une fois sur un compte frais (build 31) — fonctionne
- [ ] (optionnel) compte démo peuplé si souhaité — pas requis
