# Student Wallet Runbook

This is the optional mobile-wallet track for students who have already finished the core labs.

Use this runbook to connect one of the external wallet forks to a reachable `LearningLab` backend.

If you just want the fastest build-and-run path, start with [BUILD_THE_WALLET.md](BUILD_THE_WALLET.md).

The point is not to rebuild the entire wallet.
The point is to see the small number of patch points that add the iProov gate to an otherwise vanilla wallet.

## What the clone helper actually clones

`node scripts/setup-wallet-forks.js` clones the workshop forks, not the untouched upstream vanilla wallets.

For this workshop, those are:

- `johan-sellstrom/eudi-app-ios-wallet-ui`
- `johan-sellstrom/eudi-app-android-wallet-ui`

Those forks already contain the iProov gate code and callback handling.

You are not expected to:

- add the iProov SDK from scratch
- create the gate files from scratch
- invent the `eudi-wallet://iproov` callback flow yourself

You are expected to:

- clone one workshop fork
- set the issuer and verifier values
- run it locally
- inspect the exact files that were changed

## Important: use your laptop, not the Codespace

This runbook is for:

- a local terminal on your laptop
- Xcode or Android Studio on your laptop
- a backend URL that your simulator, emulator, or device can reach

This runbook is not for:

- cloning the wallet repo inside GitHub Codespaces
- building the wallet inside GitHub Codespaces
- pasting iProov credentials into the wallet repo

## What runs where

- Local terminal:
  - clone your own `LearningLab` repo if needed
  - run `node scripts/setup-wallet-forks.js --platform ios` or `--platform android`
- Local IDE:
  - Xcode for iOS
  - Android Studio for Android
- Backend:
  - either a local `pnpm dev` on your laptop
  - or the forwarded/public URL of a running backend elsewhere

The wallet only needs a backend URL it can actually reach.

## Step 1: make sure you have a local `LearningLab` checkout

If you only used GitHub Codespaces so far, clone your own student repo onto your laptop first:

```bash
git clone <your-learninglab-repo-url> LearningLab
cd LearningLab
```

If you already have a local checkout, just `cd` into it.

## Step 2: clone exactly one wallet fork

From the local `LearningLab` folder on your laptop, run one of these:

```bash
node scripts/setup-wallet-forks.js --platform ios
```

```bash
node scripts/setup-wallet-forks.js --platform android
```

Preview only:

```bash
node scripts/setup-wallet-forks.js --dry-run
```

Expected workspace layout:

```text
<workspace-root>/
  LearningLab/
  eudi-app-ios-wallet-ui/
  eudi-app-android-wallet-ui/
```

Important:

- clone only the platform you need
- the cloned repo is already the workshop fork with the iProov gate wired in
- if the script says you are in Codespaces, stop and rerun it from your laptop terminal

## Step 3: decide which backend URL the wallet should use

For this workshop, use the public backend by default:

- issuer: `https://issuer.ipid.me`
- verifier API: `https://verifier.ipid.me`
- wallet RP page: `https://verifier.ipid.me/wallet`

Only switch to Codespaces or a laptop-local backend if you are intentionally testing your own instance.

Other supported issuer URL choices:

- Backend in Codespaces:
  - open the backend Codespace
  - open the `PORTS` panel
  - copy the forwarded Port `3001` URL
  - it will look like `https://<codespace-name>-3001.app.github.dev`
- Backend on your laptop:
  - iOS simulator: `http://localhost:3001`
  - Android emulator: `http://10.0.2.2:3001`
  - physical device on the same Wi-Fi: `http://<your-mac-lan-ip>:3001`
- Shared workshop backend:
  - issuer: `https://issuer.ipid.me`
  - verifier: `https://verifier.ipid.me`
  - RP page: `https://verifier.ipid.me/wallet`

Only use `localhost` when the issuer is running on the same laptop as the simulator.

If you need the verifier URL directly, use the same rule with Port `3002`.

## Step 4: sanity-check the backend

Before opening the wallet, make sure the issuer responds.

If the backend is local:

```bash
cd LearningLab
pnpm dev
```

Then check:

```bash
curl -s http://localhost:3001/.well-known/openid-credential-issuer | jq
curl -s http://localhost:3001/iproov/config | jq
```

If the backend is in Codespaces or on a shared public URL, replace `http://localhost:3001` with the real issuer URL from Step 3.

Interpret `/iproov/config` like this:

- `realCeremonyEnabled=false`
  - the issuer is in demo mode
  - the wallet should use the web fallback flow
- `realCeremonyEnabled=true`
  - the issuer has real iProov credentials
  - the iOS native SDK path can be used on a physical iPhone

For this workshop, the real iProov credentials stay in the backend, not in the wallet repo.

## Step 5: add a PID document in the wallet

Do this before you try to scan the verifier QR code.

In the wallet app:

1. tap `+`
2. choose `EU Form`
3. add at least one PID document:
   - `PID (MSO Mdoc)`, or
   - `PID (SD-JWT VC)`
4. fill in at least:
   - name
   - date of birth
   - nationality
5. save the document

If you want the least workshop friction, add both PID variants so the verifier can accept either the SD-JWT VC or the mdoc path.

## Step 6: use the verifier RP page

Open this page on your laptop:

```text
https://verifier.ipid.me/wallet
```

That page gives you:

- the QR code to scan with the wallet
- the exact verifier preregistration values
- the live result page that shows whether the presentation arrived

If you are testing your own backend, open that verifier's `/wallet` page instead.

## Step 7: set the verifier preregistration values

For this workshop, use these preregistered verifier values:

- client ID: `verifier.ipid.me`
- verifier API URI: `https://verifier.ipid.me`
- verifier legal name: `iProov Verifier`

Use those exact values in the wallet config files below.


## iOS track

Wallet repo:

- `<workspace-root>/eudi-app-ios-wallet-ui`

Key files:

- `eudi-app-ios-wallet-ui/Wallet/Wallet.plist`
- `eudi-app-ios-wallet-ui/Modules/logic-core/Sources/Config/WalletKitConfig.swift`
- `eudi-app-ios-wallet-ui/Modules/feature-presentation/Sources/IProov/IProovPresentationGate.swift`
- `eudi-app-ios-wallet-ui/Modules/logic-ui/Sources/Controller/DeepLinkController.swift`

The cloned workshop iOS fork already contains:

- the `IProov Enabled` and `IProov Issuer Base URL` keys in `Wallet.plist`
- the preregistered `verifier.ipid.me` OpenID4VP entry in `WalletKitConfig.swift`
- `IProovPresentationGate.swift`
- the `eudi-wallet://iproov` callback handling in `DeepLinkController.swift`
- the iProov Swift package dependency

Reference only: if you were patching the upstream vanilla wallet yourself, these are the exact places to change:

- `Wallet/Wallet.plist`
  - add the `IProov Enabled` toggle
  - add the `IProov Issuer Base URL`
- `WalletKitConfig.swift`
  - add `.preregistered([...])` to the OpenID4VP `clientIdSchemes`
  - use `clientId = "verifier.ipid.me"`
  - use `verifierApiUri = "https://verifier.ipid.me"`
  - use `verifierLegalName = "iProov Verifier"`
- `IProovPresentationGate.swift`
  - call `/iproov/config`
  - decide whether to use the native SDK or the web fallback flow
  - call `/iproov/claim` or `/iproov/mobile/claim`
  - block the presentation flow until the session passes
- `DeepLinkController.swift`
  - handle the `eudi-wallet://iproov` callback
  - resume the pending presentation flow after the browser fallback returns

Important plist keys:

- `IProov Enabled`
- `IProov Issuer Base URL`

Expected callback URL:

- `eudi-wallet://iproov`

### iOS prerequisites

- Xcode installed
- Apple Silicon simulator for demo-mode testing, or
- physical iPhone for the native iProov SDK path

Important:

- use a concrete arm64 simulator destination such as `iPhone 17 Pro`
- do not use `Any iOS Simulator Device`
- the current upstream PoDoFo dependency is not a good generic x86_64 simulator path

### iOS setup

1. Open `eudi-app-ios-wallet-ui/EudiReferenceWallet.xcodeproj` in Xcode.
2. Choose your normal dev scheme.
3. Open `eudi-app-ios-wallet-ui/Wallet/Wallet.plist`.
4. Make sure:
   - `IProov Enabled` is `true`
   - `IProov Issuer Base URL` is the exact issuer URL from Step 3
5. Open `Modules/logic-core/Sources/Config/WalletKitConfig.swift`.
6. Add the preregistered verifier entry with:
   - `clientId: "verifier.ipid.me"`
   - `verifierApiUri: "https://verifier.ipid.me"`
   - `verifierLegalName: "iProov Verifier"`

Do not create new iProov source files here.
For the workshop fork, you are only changing configuration values and then running the app.

Use these issuer URLs:

- backend in Codespaces:
  - paste the exact `https://<codespace-name>-3001.app.github.dev` URL
- iOS simulator with a local backend on the same Mac:
  - `http://localhost:3001`
- physical iPhone with a local backend on the same Wi-Fi:
  - `http://<your-mac-lan-ip>:3001`
- shared public workshop backend:
  - paste the exact public HTTPS URL the instructor gives you

Do not use `localhost` on a physical iPhone.

Before you scan the verifier QR code, confirm the wallet already contains a PID added through `EU Form`.
The minimum useful fields are name, date of birth, and nationality.

Use this verifier page to start the presentation:

- `https://verifier.ipid.me/wallet`

### iOS expected flow

When the wallet reaches the presentation loading step:

1. it checks `/iproov/config`
2. if real iProov is enabled and the app is on a physical device:
   - it calls `/iproov/claim`
   - it launches the native iProov SDK
   - it calls `/iproov/validate`
3. otherwise:
   - it calls `/iproov/mobile/claim`
   - it opens the returned `launchUrl`
   - it waits for the `eudi-wallet://iproov` callback
   - it checks `/iproov/session/:session`
4. only then does it continue the presentation flow

### iOS troubleshooting

- build fails on generic simulator target:
  - switch to a concrete arm64 simulator or use a physical iPhone
- app never returns from web fallback:
  - check the callback URL in `Wallet.plist`
  - check `DeepLinkController.swift`
- phone or simulator cannot reach the issuer:
  - make sure `IProov Issuer Base URL` matches the actual backend location
  - do not use `localhost` unless the issuer is local on the same Mac
- the QR scans but the wallet says no matching document:
  - add a PID via `EU Form` first
  - fill in name, date of birth, and nationality
  - if needed, add both `PID (MSO Mdoc)` and `PID (SD-JWT VC)`

## Android track

Wallet repo:

- `<workspace-root>/eudi-app-android-wallet-ui`

Key files:

- `eudi-app-android-wallet-ui/core-logic/src/dev/java/eu/europa/ec/corelogic/config/WalletCoreConfigImpl.kt`
- `eudi-app-android-wallet-ui/presentation-feature/build.gradle.kts`
- `eudi-app-android-wallet-ui/presentation-feature/src/main/java/eu/europa/ec/presentationfeature/iproov/IProovPresentationGate.kt`
- `eudi-app-android-wallet-ui/presentation-feature/src/main/java/eu/europa/ec/presentationfeature/ui/loading/PresentationLoadingViewModel.kt`

The cloned workshop Android fork already contains:

- the preregistered `verifier.ipid.me` OpenID4VP entry in `WalletCoreConfigImpl.kt`
- `presentation-feature/.../IProovPresentationGate.kt`
- the `eudi-wallet://iproov` callback path
- the presentation-loading hook that pauses until the iProov step completes

Reference only: if you were patching the upstream vanilla wallet yourself, these are the exact places to change:

- `WalletCoreConfigImpl.kt`
  - add `ClientIdScheme.Preregistered(...)`
  - use `clientId = "verifier.ipid.me"`
  - use `verifierApi = "https://verifier.ipid.me"`
  - use `legalName = "iProov Verifier"`
- `presentation-feature/build.gradle.kts`
  - add `IPROOV_GATE_ENABLED`
  - add `IPROOV_ISSUER_BASE_URL`
- `IProovPresentationGate.kt`
  - call `/iproov/config`
  - request `/iproov/mobile/claim`
  - open the returned browser URL
  - wait for the callback and session status before continuing
- `PresentationLoadingViewModel.kt`
  - call the iProov gate before `sendRequestedDocuments()`
  - resume the normal presentation flow only after the gate returns success

Important build config fields:

- `IPROOV_GATE_ENABLED`
- `IPROOV_ISSUER_BASE_URL`

Expected callback URL:

- `eudi-wallet://iproov`

### Android prerequisites

- Android Studio
- emulator or physical Android device

### Android setup

1. Open `eudi-app-android-wallet-ui` in Android Studio.
2. Open `core-logic/src/dev/java/eu/europa/ec/corelogic/config/WalletCoreConfigImpl.kt`.
3. Add the preregistered verifier entry with:
   - `clientId = "verifier.ipid.me"`
   - `verifierApi = "https://verifier.ipid.me"`
   - `legalName = "iProov Verifier"`
4. Open `presentation-feature/build.gradle.kts`.
5. Make sure:
   - `IPROOV_GATE_ENABLED` is `true`
   - `IPROOV_ISSUER_BASE_URL` is the exact issuer URL from Step 3

Do not add new iProov gate code here.
For the workshop fork, you are only setting config values and then running the app.

Use these issuer URLs:

- backend in Codespaces:
  - paste the exact `https://<codespace-name>-3001.app.github.dev` URL
- Android emulator with a local backend:
  - `http://10.0.2.2:3001`
- physical Android device with a local backend on the same Wi-Fi:
  - `http://<your-mac-lan-ip>:3001`
- shared public workshop backend:
  - use `https://issuer.ipid.me`

Before you scan the verifier QR code, confirm the wallet already contains a PID added through `EU Form`.
The minimum useful fields are name, date of birth, and nationality.

Use this verifier page to start the presentation:

- `https://verifier.ipid.me/wallet`

### Android expected flow

The current Android fork uses the web-based mobile fallback path.

When the wallet reaches the presentation loading step:

1. it calls `/iproov/mobile/claim`
2. it receives a `launchUrl`
3. it opens that URL in the browser
4. it waits for the `eudi-wallet://iproov` callback
5. it checks `/iproov/session/:session`
6. only then does it continue `sendRequestedDocuments()`

### Android troubleshooting

- emulator cannot reach the issuer:
  - use `10.0.2.2` only for a local backend on your laptop
  - use the public or Codespaces HTTPS URL for remote backends
- app never resumes after browser fallback:
  - check the deep link scheme and callback host
- session never passes:
  - inspect issuer logs
  - check `GET /iproov/session/:session`
- the QR scans but the wallet says no matching document:
  - add a PID via `EU Form` first
  - fill in name, date of birth, and nationality
  - if needed, add both `PID (MSO Mdoc)` and `PID (SD-JWT VC)`

## Instructor short answers

- "Do students need the wallet to pass Labs 00-05?"
  - No. This is the optional advanced track.
- "Should students build the wallet iProov integration from scratch?"
  - No. They should receive wallet forks with the gate already wired.
- "Where do students clone the wallets?"
  - From a local terminal inside their local `LearningLab` checkout, using `node scripts/setup-wallet-forks.js`.
