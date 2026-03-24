# Privacy-First ID

Starter repo for the Beyond Compliance learning lab.

Most students only need GitHub Classroom, GitHub Codespaces, and the lab docs below.

## Start Here

1. Accept the GitHub Classroom invite shared by the instructors.
2. If GitHub shows a repository invitation, accept it before opening the repo.
3. Open your new repo in GitHub Codespaces.
4. Follow [ATTENDEE_QUICKSTART.md](ATTENDEE_QUICKSTART.md).
5. Start with [labs/README-lab-00-start.md](labs/README-lab-00-start.md).

## Quickstart

Recommended path:

- Use GitHub Codespaces and follow [ATTENDEE_QUICKSTART.md](ATTENDEE_QUICKSTART.md).
- If `pnpm dev` reports `tsx: not found`, run `pnpm install -r --frozen-lockfile && pnpm env:setup`, then retry.

Local terminal fallback:

- macOS: `./scripts/bootstrap-mac.sh`
- Windows PowerShell: `powershell -ExecutionPolicy Bypass -File .\\scripts\\bootstrap-windows.ps1`
- Create local env files: `pnpm env:setup`
- Install dependencies: `pnpm install -r --frozen-lockfile`
- Start the lab services: `pnpm dev`
- Open:
  - `http://localhost:3001`
  - `http://localhost:3002`
- These are service landing pages, not the full exercise flow.
- If the external `app.github.dev` port URL looks stale, trust the `localhost` links from the Codespaces terminal.

## Labs

- Lab 00: [labs/README-lab-00-start.md](labs/README-lab-00-start.md)
- Lab 01: [labs/README-lab-01-issuance.md](labs/README-lab-01-issuance.md)
- Lab 02: [labs/README-lab-02-bbs.md](labs/README-lab-02-bbs.md)
- Lab 03: [labs/README-lab-03-ohttp.md](labs/README-lab-03-ohttp.md)
- Lab 04: [labs/README-lab-04-iproov.md](labs/README-lab-04-iproov.md)
- Lab 05: [labs/README-lab-05-revocation.md](labs/README-lab-05-revocation.md)
- Optional Lab 06: [labs/README-lab-06-mobile-wallets.md](labs/README-lab-06-mobile-wallets.md) for the laptop-only mobile wallet track
- Public wallet RP demo: `https://verifier.ipid.me/wallet`

## Docs

Student docs:

- Quick start: [ATTENDEE_QUICKSTART.md](ATTENDEE_QUICKSTART.md)
- Wallet build guide: [BUILD_THE_WALLET.md](BUILD_THE_WALLET.md)
- Optional mobile wallet runbook: [STUDENT_WALLET_RUNBOOK.md](STUDENT_WALLET_RUNBOOK.md) for local terminal + Xcode/Android Studio
- Deeper technical reference: [TECHNICAL_REFERENCE.md](TECHNICAL_REFERENCE.md)
