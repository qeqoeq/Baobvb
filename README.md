# Baobab

iOS-first [Expo](https://expo.dev) / React Native app. Routes live in **`app/`** ([Expo Router](https://docs.expo.dev/router/introduction/)).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start Metro

   - **Development build** (Sign in with Apple, native modules): `npm run start:dev-client`, then open the dev client on Simulator or device.
   - Generic: `npx expo start`

3. Run on iOS Simulator (local native build)

   ```bash
   npm run ios
   ```

See [docs/simulator-and-invite-qa.md](./docs/simulator-and-invite-qa.md) for simulator vs device truth, deep links (`baobab://`), and invite QA.

## QA & validation

| Doc | Purpose |
|-----|---------|
| [docs/simulator-and-invite-qa.md](./docs/simulator-and-invite-qa.md) | Simulator / dev client, deep links, invite + auth |
| [docs/shared-reveal-day4-checklist.md](./docs/shared-reveal-day4-checklist.md) | Shared reveal lifecycle |
| [docs/day7-notification-runner-validation.md](./docs/day7-notification-runner-validation.md) | Push runner (real device for end-to-end push) |

```bash
npm run -s typecheck
set -a && source .env && set +a && npm run -s check:invite-claim-flow
set -a && source .env && set +a && npm run -s check:shared-reveal-flow
```

([Development builds](https://docs.expo.dev/develop/development-builds/introduction/), [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/), [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/). **Expo Go** is limited vs a dev client here.)

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
