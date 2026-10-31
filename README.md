# Base44 Project

Use this repository to run and edit the app locally, then publish changes back through Base44.

Any change pushed to the repo will also be reflected in the Base44 Builder.

## Prerequisites

1. Clone the repository using the project's Git URL.
2. Navigate to the project directory.
3. Install dependencies: `npm install`.
4. Install the Base44 CLI: `npm install -g base44@latest`.
5. Install [Deno](https://docs.deno.com/runtime/getting_started/installation/) — the local Base44 backend runs on it.

Run `base44 --help` (or see the [CLI reference](https://docs.base44.com/developers/references/cli/commands/introduction)) for the full command surface.

## Run Locally

Three commands, from the project root:

```bash
base44 login   # one-time per machine
base44 link    # one-time per clone
base44 dev     # local backend + frontend together
```

Open the frontend URL that `base44 dev` prints (typically `http://localhost:5173`).

Notes:

- **Every fresh clone needs `base44 link`.** It writes `base44/.app.jsonc` (the app-id pointer), which is deliberately gitignored. Your app id is in the Builder URL (`app.base44.com/apps/<id>/...`); `base44 link --help` shows the non-interactive flags.
- **`base44 dev` runs the frontend for you** (via `site.serveCommand` in this repo's `base44/config.jsonc`) — never run `npm run dev` yourself: alone it serves a UI with no backend behind it (`[base44] Proxy not enabled`, every `/api` call fails), and alongside `base44 dev` the second Vite silently takes the next port and you end up looking at the wrong one.
- **The app must be published at least once for the UI to load under `base44 dev`.** The frontend boots by fetching app settings from the hosted app; before the first publish that fails and every page redirects to login. The local API works regardless.
- Entities, functions, and auth run locally — entity data is **in-memory only**, wiped when `base44 dev` restarts. Everything else (Core integrations, OAuth login) is forwarded to your deployed app. Full breakdown: [Local development overview](https://docs.base44.com/developers/backend/overview/local-dev/local-development-overview).

## Checks

Run `npm run lint` to check the JavaScript/JSX application and `npm run typecheck`
to check TypeScript source files. JavaScript/JSX is linted rather than type-checked.

## Frontend Only, Hosted Backend

To work on just the frontend against your app's live hosted backend:

```bash
base44 dev --remote
```

⚠️ In this mode writes go to your app's **production data** — plain `base44 dev` keeps everything local.

## Publish Your Changes

After pushing your changes to git, open the Base44 dashboard and publish the app:

```bash
base44 dashboard open
```

This repo syncs to Base44 through git, so publish from the dashboard rather than `base44 deploy` — a CLI deploy ships your local tree directly, bypassing the sync, and the deployed state silently diverges from the repo.

## Android APK Now Playing controls

The Android APK uses a native media session and foreground service to expose the
active player's artwork, metadata, progress, and playback controls in Android's
notification shade. Changes to the Android native project require rebuilding
and reinstalling the APK; publishing the web app in the Base44 dashboard alone
does not update an already-installed APK. Android controls notification
visibility and output routing, so its notification permission and device
settings can affect what is displayed. The in-app `PullDownMediaBar` is only a
web overlay: Android reserves the swipe from the status bar for its system
notification shade, so that gesture cannot reveal a React component. The native
media notification appears in the shade while playback is active, provided app
and media-notification permissions are enabled. Android may show media controls
in its media player/quick settings rather than as a heads-up popup.
MP3 and MP4 playback in the Android app uses Media3 ExoPlayer; Web and iPhone
continue using browser playback.

## Android push notifications

Android push uses Firebase Cloud Messaging through Capacitor's
`@capacitor/push-notifications` plugin. The Android application ID is
`io.chay.app` in both `capacitor.config.json` and `android/app/build.gradle`.
Register an Android app with this exact package name in the Firebase project
whose service account is configured as the Base44 `FIREBASE_SERVICE_ACCOUNT`
secret, then download its `google-services.json`.

For a local Gradle build, put that file at
`android/app/google-services.json`. The build checks that the file exists and
contains a Firebase Android client for `io.chay.app`; it fails early with a
specific error rather than producing an APK without Firebase configuration.
When generating the Android app through Base44 Publish, enable **Add push
notifications** and provide the same Firebase `google-services.json` when
prompted. Rebuild and reinstall the generated APK/AAB after changing this
configuration; publishing the web app alone does not update an installed
Android app.

On Android 13 and later, the app requests notification permission after login.
After granting it, open **Settings → Notifications** in the app and confirm
that Android reports the device as registered. The FCM token is stored in
Base44's `DeviceToken` entity for the signed-in user; use the Android push
test there to check delivery. The native app must be online for initial token
registration, and a fresh native build must contain Firebase configuration.

## Docs & Support

GitHub integration: [https://docs.base44.com/developers/app-code/local-development/github](https://docs.base44.com/developers/app-code/local-development/github)

Local development: [https://docs.base44.com/developers/backend/overview/local-dev/local-development-overview](https://docs.base44.com/developers/backend/overview/local-dev/local-development-overview)

Support: [https://app.base44.com/support](https://app.base44.com/support)
