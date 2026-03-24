# Lab 06 — Mobile Wallet Track (Optional)

Lab ID: `06` · Timebox: 30-45 minutes

Goal: run one mobile wallet fork from your laptop against a reachable `LearningLab` backend so you can see the iProov gate in a real wallet presentation flow.

This is an advanced optional track.
It is not required for Labs 00-05.

## What this lab really is

Keep the scope small.

You are not rewriting a wallet from scratch.

You are identifying the exact places where a vanilla wallet needs an iProov gate:

- one config change to turn the gate on and point at the issuer
- one presentation-gate file that pauses the flow until iProov succeeds
- one callback or resume path that lets the wallet continue after the ceremony

The workshop wallet forks already contain those changes.
Your job is to run one fork locally and inspect the small set of files that differ from the vanilla wallet.

`node scripts/setup-wallet-forks.js` clones the workshop forks, not the untouched upstream vanilla wallets.
You are not expected to add the iProov SDK or invent the gate from scratch in this lab.

## Important: this lab is laptop-only

Do not try to run the wallet track entirely inside GitHub Codespaces.

For this lab:

- the wallet clone helper runs in a local terminal on your laptop
- the wallet app runs in Xcode or Android Studio on your laptop
- the backend can be either:
  - a running local `LearningLab` checkout on your laptop, or
  - a running backend in Codespaces or on a public URL

The wallet only needs a backend URL it can actually reach.

## Choose one platform

Clone and run only one wallet:

- iOS
- Android

Do not clone both unless an instructor asks you to.

## Step 1: make sure you have a local `LearningLab` checkout

If you have only used Codespaces so far, clone your own student repo onto your laptop first:

```bash
git clone <your-learninglab-repo-url> LearningLab
cd LearningLab
```

If you already have a local checkout, just open a terminal there.

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

What this does:

- clones the chosen wallet beside `LearningLab`
- clones the workshop fork with the iProov gate already wired
- keeps the mobile repo separate from the Node lab repo
- avoids submodules and nested repos

If the script tells you that you are in Codespaces, stop and rerun it from a local terminal on your laptop.

## Step 3: choose the backend URL

For this workshop, use the public backend by default unless an instructor tells you otherwise:

- issuer: `https://issuer.ipid.me`
- verifier API: `https://verifier.ipid.me`
- wallet RP page: `https://verifier.ipid.me/wallet`

Only fall back to a Codespaces or laptop URL if you are explicitly testing your own backend.

Other supported backend options:

- backend in Codespaces:
  - copy the forwarded Port `3001` URL from the `PORTS` panel
  - it will look like `https://<codespace-name>-3001.app.github.dev`
- backend on your laptop:
  - iOS simulator: `http://localhost:3001`
  - Android emulator: `http://10.0.2.2:3001`
  - physical device on the same Wi-Fi: `http://<your-mac-lan-ip>:3001`
- shared workshop backend:
  - issuer: `https://issuer.ipid.me`
  - verifier: `https://verifier.ipid.me`
  - RP page: `https://verifier.ipid.me/wallet`

Only use `localhost` when the issuer is running on the same laptop as the simulator.

If you need the verifier URL directly, use the same rule with Port `3002`.

## Step 4: make sure the backend is alive

Before opening the wallet, confirm the issuer is reachable.

For a local backend:

```bash
pnpm dev
curl -s http://localhost:3001/.well-known/openid-credential-issuer | jq
curl -s http://localhost:3001/iproov/config | jq
```

For a Codespaces or public backend, replace `http://localhost:3001` with the actual issuer URL you copied in Step 3.

Interpret `/iproov/config` like this:

- `realCeremonyEnabled=false`
  - the issuer is in demo mode
  - the wallet should use the web fallback flow
- `realCeremonyEnabled=true`
  - the issuer has real iProov credentials
  - the iOS native SDK path can be used on a physical iPhone

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

## Step 6: open the wallet RP page

On your laptop, open:

```text
https://verifier.ipid.me/wallet
```

That page gives you three things:

- the QR code to scan with the wallet
- the exact verifier client settings for preregistered mode
- the live result page that shows whether the presentation was received

If you are using your own backend instead of the workshop backend, open that verifier's `/wallet` page instead.


## Step 6: follow the platform runbook

After cloning the wallet, open these in order:

- [BUILD_THE_WALLET.md](../BUILD_THE_WALLET.md)
- [STUDENT_WALLET_RUNBOOK.md](../STUDENT_WALLET_RUNBOOK.md)

Use the build guide for:

- the shortest path to getting one wallet running
- exact Xcode and Android Studio setup steps
- the workshop issuer/verifier URLs
- the verifier preregistration values

Use the runbook for:

- platform-specific file locations
- the exact vanilla-wallet patch points to inspect
- expected iProov flow
- troubleshooting

## Codespaces note

For this workshop, the real iProov credentials stay in the backend, not in the wallet repo.

That means:

- do not paste iProov secrets into the wallet repos
- do not edit wallet repos to add backend secrets
- if your backend is running in Codespaces, copy the forwarded HTTPS URL from that backend Codespace

## You are done when

- the wallet reaches the presentation loading step
- the iProov gate runs before the presentation is sent
- the presentation resumes only after the iProov step succeeds

## If something fails

- wallet clone/setup issues:
  - use `node scripts/setup-wallet-forks.js --dry-run` first
- wallet script says Codespaces:
  - move to a local terminal on your laptop and rerun the command there
- simulator or emulator cannot reach the issuer:
  - use the base URL rules in [STUDENT_WALLET_RUNBOOK.md](../STUDENT_WALLET_RUNBOOK.md)
- phone app cannot reach the backend:
  - use a public HTTPS URL or your Mac LAN IP, not `localhost`
- iProov confusion:
  - backend secrets stay in the backend repo or Codespace, never in the wallet repo
- the QR scans but the wallet says no matching document:
  - add a PID via `EU Form` first
  - fill in name, date of birth, and nationality
  - if needed, add both `PID (MSO Mdoc)` and `PID (SD-JWT VC)`
