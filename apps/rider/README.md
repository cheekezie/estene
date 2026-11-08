# Estene Rider (`apps/rider`)

The rider app for iOS and Android, built with Expo (SDK 58) and Expo Router.

- **Online / offline:** while online, the phone shares its location about every 20 seconds, also in the
  background, so dispatch can offer nearby jobs. Going offline stops it.
- **Offers:** a push notification plus a card with a 45-second countdown. While the app is open it
  also checks for offers every 5 seconds.
- **Jobs, step by step:**
  1. Start trip.
  2. At pickup: scan the QR tag, then confirm size and weight.
  3. Start delivery.
  4. At drop-off: collect any cash due, rescan the tag, then prove delivery with the recipient's PIN
     or a photo. If it fails, report why, then try again or return the parcel.
  5. Office jobs: collect the parcel at the counter, or hand it in.
- **No in-app map:** each stop has **Navigate**, which opens Google Maps directions using the
  stop's coordinates when it has them, or its address. The rider's GPS is sent with every pickup and
  delivery, so stops without coordinates get them.
- **Earnings:** available balance, payouts and recent jobs. **Account:** profile, password, sign out.

## Run it locally

Background location, push and the camera scanner use native modules, so the app runs in a
**development build**, not Expo Go.

1. Build the dev client once per platform. This needs an Expo account (`npx eas-cli@latest login`).

   ```sh
   cd apps/rider
   npx eas-cli@latest build --profile development --platform android   # or ios / all
   ```

   With Android Studio or Xcode installed you can build locally instead:
   `pnpm exec expo run:android` / `pnpm exec expo run:ios`.

2. Start the API (`pnpm dev:api`), then start Metro pointing at your computer's LAN IP. The phone
   can't reach `localhost`.

   ```sh
   EXPO_PUBLIC_API_URL=http://<your-LAN-ip>:4000 pnpm dev:rider
   ```

   Delivery photos upload straight to R2, so fill in the `R2_*` settings in `apps/api/.env`
   before testing pickup or delivery.

3. Open the dev build on the phone and sign in with a seeded rider: `08030000001` or
   `08030000002`, password `rider1234`.

## Builds for testers and the stores

```sh
npx eas-cli@latest build --platform all --profile preview      # Android APK + iOS ad-hoc build
npx eas-cli@latest build --platform all --profile production   # store builds
npx eas-cli@latest submit --platform all --profile production  # upload to Play Console / App Store Connect
```

`EXPO_PUBLIC_API_URL` is set per profile in `eas.json`. Production points at `https://api.estene.ng`.
For the development profile, change the IP to your machine's LAN IP.

## Push notifications (offers)

1. `npx eas-cli@latest init` creates the EAS project. Put the printed project ID in the environment
   as `EAS_PROJECT_ID` (an EAS environment variable, or `.env.local` for local runs).
   `app.config.ts` reads it.
2. **Android:** add Firebase Cloud Messaging credentials with `npx eas-cli@latest credentials`
   (Android → push notifications: upload the FCM V1 service-account key).
3. **iOS:** EAS creates the APNs key on the first iOS build.

Without a project ID the app still works, but offers arrive by polling only, while the app is open.

## Permissions

- **Location:** "Always" on iOS and "Allow all the time" on Android. While online, Android shows an
  "Estene is sharing your location" notification.
- **Camera:** scanning tags and taking delivery photos.
- **Notifications:** job offers.

Store review needs a short explanation of background location. The rider is online on purpose,
location is used only while online, and it's used for dispatching nearby jobs.

## Layout

```
index.ts                  entry: registers the background location task, then Expo Router
app.config.ts             names, bundle IDs (ng.estene.rider), permissions, plugins
src/app/                  screens (login, tabs: Jobs / Earnings / Account, job/[id])
src/components/           UI kit (theme tokens from @estene/theme/tokens), job cards, QR scanner
src/hooks/                auth, online state, TanStack Query hooks
src/lib/                  API client (token refresh), location task, push, uploads, Google Maps links
```

`pnpm --filter @estene/rider typecheck` checks the types. `pnpm --filter @estene/rider doctor` checks
the Expo setup.
