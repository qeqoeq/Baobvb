# Simulator, dev client, and invite / deep-link QA

This doc is **honest about what you can validate without a paid Apple Developer account** and a physical device. Baobab is **iOS-first**; Sign in with Apple and push behave differently on simulator vs device.

## Validated now (no paid Apple account required)

| Area | How |
|------|-----|
| **Supabase invite + shared reveal lifecycle** | `npm run -s check:invite-claim-flow` and `npm run -s check:shared-reveal-flow` (requires `.env` with `EXPO_PUBLIC_SUPABASE_*`) |
| **Type safety** | `npm run -s typecheck` |
| **Deep link URL shape** | Scheme `baobab` (see `app.json` → `expo.scheme`). Test with **Simulator → Safari** or `xcrun simctl openurl booted 'baobab://…'` |
| **Auth gate + invite redirect** | Run dev client, open invite URL unauthenticated → sign-in → return to invite with `relationId` / `token` preserved (see flows below) |
| **Dev-only linking logs** | In `__DEV__`, Metro shows `[Baobab][linking] …` (ids/tokens masked) |

## Not yet validated (requires paid Apple Developer + real device)

| Area | Why |
|------|-----|
| **Production APNs push** | Needs Apple program + device token pipeline |
| **Sign in with Apple in all production configurations** | Simulator often works for dev; TestFlight / App Store and some entitlements need the paid account |
| **Universal Links / associated domains** | Optional future; custom scheme `baobab://` works for manual QA |

---

## 1) App startup

1. Install dependencies: `npm install`
2. Start Metro for a **development build** (not Expo Go if you use native modules like Apple auth as configured):
   ```bash
   npm run start:dev-client
   ```
3. Open the iOS **Simulator** (from Xcode or `npx expo run:ios` after a local prebuild).

**Expected:** App boots to Garden or auth, no crash.

---

## 2) Auth gate behavior

1. With **no** Supabase session, navigate to any protected route (e.g. open a deep link to `/invite/...` or browse to a tab that requires auth — behavior follows `app/_layout.tsx`).
2. **Expected:** Redirect to `/auth/sign-in` with `redirectPath` (and for invite URLs, `relationId` + optional `token`).

**Dev:** Metro logs `auth-gate → sign-in …`.

---

## 3) Invite deep-link open (authenticated)

1. Build or use a URL: `baobab://invite/<RELATION_ID>` or add `?token=<invite_token>` when testing claim.
2. **Simulator:** Safari address bar → enter the `baobab://…` URL, or:
   ```bash
   xcrun simctl openurl booted 'baobab://invite/YOUR_RELATION_ID'
   ```

**Expected:** Invite arrival screen loads with that `relationId` (and token in params if provided).

---

## 4) Redirect to sign-in and back (invite preservation)

### Arrival invite (`/invite/[relationId]`)

1. Sign out (or use a cold install).
2. Open `baobab://invite/<RELATION_ID>?token=<optional>`.
3. **Expected:** Auth screen, then after Sign in with Apple, navigation to `/invite/[relationId]` with same `relationId` and `token`.

### Identity invite (`/invite/identity/[relationId]`)

1. Sign out.
2. Open `baobab://invite/identity/<RELATION_ID>?token=<optional>`.
3. **Expected:** Auth screen, then after sign-in, **`/invite/identity/[relationId]`** (not only arrival). This path is required so “create your card” context is preserved.

**Dev:** Logs show `inviteKind: 'identity'` or `'arrival'` on auth gate.

---

## 5) Relation open after valid context

1. From Garden, open a relationship that **exists in local state** with id `X`, or navigate programmatically to `baobab://relation/X` if wired.
2. **Expected:** `relation/[id]` shows detail for that id.

If the id is unknown locally, the screen may navigate back; **dev** logs `relation detail: no local relation for id`.

---

## 6) Reveal lifecycle route continuity

1. Complete shared-reveal steps per `docs/shared-reveal-day4-checklist.md` (automated script covers server lifecycle).
2. In app, open the relation after `reveal_ready` / `revealed` per product rules.
3. **Expected:** No leaked score/tier/name before reveal; routes stay consistent (relation → evaluate flows as implemented).

---

## EAS / iOS simulator build (optional)

For a **simulator .app** via EAS (reusable after you add a paid account for device builds):

```bash
eas build --profile development-simulator --platform ios
```

Install the artifact on the Simulator, then:

```bash
npm run start:dev-client
```

Profiles in `eas.json`:

- **`development`** — dev client, internal distribution (typical **device** install).
- **`development-simulator`** — same, with `ios.simulator: true` for Simulator builds.

Local iteration without EAS:

```bash
npx expo run:ios
# or
npm run ios
```

---

## Commands summary

| Command | Purpose |
|---------|---------|
| `npm run start:dev-client` | Metro with dev client |
| `npm run ios` | Local native build + run iOS |
| `npm run -s typecheck` | TypeScript |
| `set -a && source .env && set +a && npm run -s check:invite-claim-flow` | Server invite + claim |
| `set -a && source .env && set +a && npm run -s check:shared-reveal-flow` | Shared reveal lifecycle |

---

## Push notifications (truthful)

- **Simulator:** Do not expect reliable push delivery; token registration may fail or be a simulator token — **not** a substitute for device QA.
- **Expo Go:** Push capabilities differ from a development/production build; treat as **non-authoritative** for push.
- After Apple Developer enrollment, re-validate on a **physical iPhone** with a dev or TestFlight build (`docs/day7-notification-runner-validation.md`).
