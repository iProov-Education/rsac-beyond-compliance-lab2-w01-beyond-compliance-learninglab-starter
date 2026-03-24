# Build The Wallet

This is the shortest student-facing path for the optional mobile wallet track.

Use this guide if your goal is:

- clone exactly one wallet repo
- open it in Xcode or Android Studio
- point it at the workshop backend
- scan the verifier QR code
- watch the iProov gate run before presentation

If you want the deeper explanation of the patch points, also read [STUDENT_WALLET_RUNBOOK.md](STUDENT_WALLET_RUNBOOK.md).

## What the clone helper actually gives you

`node scripts/setup-wallet-forks.js` does not clone the untouched upstream reference wallets.

It clones the workshop forks:

- `johan-sellstrom/eudi-app-ios-wallet-ui`
- `johan-sellstrom/eudi-app-android-wallet-ui`

Those forks already contain the iProov presentation-gate work for this lab.

That means:

- you are not expected to add the iProov SDK from scratch
- you are not expected to create `IProovPresentationGate.swift` or `IProovPresentationGate.kt`
- you are not expected to invent the `eudi-wallet://iproov` callback handling yourself
- your job is to point the fork at the workshop backend, run it, and inspect the small number of files that were changed

## Use your laptop

Do not do this inside GitHub Codespaces.

You need:

- a local terminal on your laptop
- Xcode for iOS or Android Studio for Android
- a backend URL your simulator, emulator, or device can actually reach

## Workshop URLs

Use these by default:

- issuer: `https://issuer.ipid.me`
- verifier API: `https://verifier.ipid.me`
- wallet RP page: `https://verifier.ipid.me/wallet`

The verifier preregistration values are:

- client ID: `verifier.ipid.me`
- verifier API URI: `https://verifier.ipid.me`
- verifier legal name: `iProov Verifier`

## Step 1: clone your local LearningLab checkout

If you only used Codespaces so far:

```bash
git clone <your-learninglab-repo-url> LearningLab
cd LearningLab
```

If you already have a local checkout, just `cd` into it.

## Step 2: clone exactly one wallet fork

From the local `LearningLab` folder:

```bash
node scripts/setup-wallet-forks.js --platform ios
```

or:

```bash
node scripts/setup-wallet-forks.js --platform android
```

Preview only:

```bash
node scripts/setup-wallet-forks.js --dry-run
```

Expected layout:

```text
<workspace-root>/
  LearningLab/
  eudi-app-ios-wallet-ui/
  eudi-app-android-wallet-ui/
```

The cloned repos already contain the workshop iProov files.

For example:

- iOS already contains `Modules/feature-presentation/Sources/IProov/IProovPresentationGate.swift`
- iOS already contains the iProov Swift package wiring
- Android already contains `presentation-feature/src/main/java/eu/europa/ec/presentationfeature/iproov/IProovPresentationGate.kt`

## Step 3: build the iOS wallet

Use this path only on macOS with Xcode installed.

1. Open `eudi-app-ios-wallet-ui/EudiReferenceWallet.xcodeproj` in Xcode.
2. Select the `EUDI Wallet Dev` scheme.
3. Use `Debug` when running from Xcode.
4. Choose a concrete Apple Silicon simulator, for example `iPhone 17 Pro`.
5. Open `eudi-app-ios-wallet-ui/Wallet/Wallet.plist`.
6. Set:
   - `IProov Enabled = true`
   - `IProov Issuer Base URL = https://issuer.ipid.me`
7. Open `eudi-app-ios-wallet-ui/Modules/logic-core/Sources/Config/WalletKitConfig.swift`.
8. In the OpenID4VP `clientIdSchemes`, add or keep the preregistered verifier entry:

```swift
.preregistered(
  [
    PreregisteredClient(
      clientId: "verifier.ipid.me",
      verifierApiUri: "https://verifier.ipid.me",
      verifierLegalName: "iProov Verifier"
    )
  ]
)
```

9. Press Run in Xcode.

Notes:

- Do not add new iProov source files here. The workshop fork already contains them.
- Do not use `Any iOS Simulator Device`.
- For a physical iPhone, you also need your own signing configuration in Xcode.
- If you use a different backend, replace only the issuer URL and verifier URL values above.

## Step 4: build the Android wallet

1. Open `eudi-app-android-wallet-ui` in Android Studio.
2. Select the `devDebug` build variant.
3. Open `eudi-app-android-wallet-ui/core-logic/src/dev/java/eu/europa/ec/corelogic/config/WalletCoreConfigImpl.kt`.
4. In `configureOpenId4Vp`, add or keep the preregistered verifier entry:

```kotlin
withClientIdSchemes(
    listOf(
        ClientIdScheme.Preregistered(
            preregisteredVerifiers =
                listOf(
                    PreregisteredVerifier(
                        clientId = "verifier.ipid.me",
                        legalName = "iProov Verifier",
                        verifierApi = "https://verifier.ipid.me"
                    )
                )
        )
    )
)
```

5. Open `eudi-app-android-wallet-ui/presentation-feature/build.gradle.kts`.
6. Set:
   - `IPROOV_GATE_ENABLED = true`
   - `IPROOV_ISSUER_BASE_URL = "https://issuer.ipid.me"`
7. Run the app from Android Studio on an emulator or device.

If you are using a local laptop backend instead of the workshop backend:

- Android emulator issuer URL: `http://10.0.2.2:3001`
- local verifier URL: the matching `3002` host you are running

Do not add new iProov gate code here. The workshop fork already contains it.


## Step 5: add a PID document in the wallet

Before you scan the verifier QR code, make sure the wallet actually contains a PID the verifier can request.

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
5. save the document and return to the wallet home/documents screen

If you want the least friction for the workshop, add both PID variants so the verifier can use whichever format the wallet prefers.

## Step 6: start the presentation

On your laptop, open:

```text
https://verifier.ipid.me/wallet
```

Then:

1. scan the QR code with the wallet
2. accept the request in the wallet
3. let the iProov step run
4. return to the verifier session page and confirm the presentation arrived

## What should happen

The presentation flow should look like this:

1. wallet reads the verifier request from the QR code
2. wallet prepares the presentation
3. wallet hits the iProov gate before sending
4. browser or native iProov flow completes
5. wallet sends the presentation to the verifier
6. the verifier session page updates with the result

## Common failures

`The wallet clone helper says Codespaces`
- Run `node scripts/setup-wallet-forks.js` from a local terminal on your laptop.

`The app cannot reach the issuer`
- Use `https://issuer.ipid.me` for the workshop backend.
- Use `http://10.0.2.2:3001` only for an Android emulator talking to a local backend on your laptop.
- Use `http://localhost:3001` only for an iOS simulator talking to a local backend on the same Mac.

`The QR scans but nothing useful happens`
- Confirm the preregistered verifier values match exactly:
  - `verifier.ipid.me`
  - `https://verifier.ipid.me`
  - `iProov Verifier`
- Confirm the wallet already contains a PID added through `EU Form`.
- The required fields are name, date of birth, and nationality.

`iOS does not run on the simulator`
- Use a concrete arm64 simulator target.
- Do not use `Any iOS Simulator Device`.

`The app never comes back after browser-based iProov`
- Check the wallet callback handling in the files referenced in [STUDENT_WALLET_RUNBOOK.md](STUDENT_WALLET_RUNBOOK.md).

## If you need the deeper explanation

Use [STUDENT_WALLET_RUNBOOK.md](STUDENT_WALLET_RUNBOOK.md) for:

- why these files were changed
- the exact upstream patch points
- the wallet-specific iProov flow details
- extra troubleshooting
