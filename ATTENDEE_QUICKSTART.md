# RSAC Attendee Quick Start

Use GitHub Codespaces. Do not spend the first 10 minutes on local setup.

## What you need

- A GitHub account
- The GitHub Classroom invite link shared by the instructors
- A modern browser

Your repo and coding environment come from GitHub Classroom and GitHub Codespaces.

## Recommended path: GitHub Codespaces

1. Open the GitHub Classroom invite and accept the assignment.
2. If GitHub shows a repository invitation, accept it before continuing.
   - If you see `Repository Access Issue`, open the repo invitation from GitHub notifications or the repo page and accept it.
3. Open the new repository GitHub creates for you.
4. Click `Code` -> `Codespaces` -> `Create codespace on main`.

![Open in Codespaces](assets/student_open_in_codespace.png)

5. Wait for the Codespace setup to finish.
   - This repo's dev container already runs `pnpm install -r --frozen-lockfile` and `pnpm env:setup`.
6. In the Codespaces terminal, run:

```bash
pnpm dev
```

Keep that terminal running. Open a second Codespaces terminal for any `curl` commands from the labs.

If you see `tsx: not found` or `node_modules missing`, run:

```bash
pnpm install -r --frozen-lockfile && pnpm env:setup
pnpm dev
```

7. Open the forwarded ports for:
   - `3001` (`Issuer`)
   - `3002` (`Verifier`)
   - You should see small service landing pages. They confirm the servers are up; the lab itself continues in the README and lab docs.
   - If the external `https://...app.github.dev/` page looks stale, use the `http://localhost:3001` or `http://localhost:3002` link from the Codespaces terminal instead and keep going.
8. Open [labs/README-lab-00-start.md](labs/README-lab-00-start.md) and follow Lab 00.

## Alternative path: local terminal

Use this only if GitHub Codespaces is unavailable or a facilitator asks you to switch.

1. Open your GitHub Classroom repo on your own machine.
2. Install the prerequisites:
   - macOS: `./scripts/bootstrap-mac.sh`
   - Windows PowerShell: `powershell -ExecutionPolicy Bypass -File .\\scripts\\bootstrap-windows.ps1`
3. Create local env files:

```bash
pnpm env:setup
```

4. Install dependencies:

```bash
pnpm install -r --frozen-lockfile
```

5. Start the lab services:

```bash
pnpm dev
```

6. Open:
   - `http://localhost:3001`
   - `http://localhost:3002`
7. Open [labs/README-lab-00-start.md](labs/README-lab-00-start.md) and follow Lab 00.

## First 10 minutes checklist

- Your GitHub Classroom repo exists under your GitHub account.
- Either your Codespace is running on `main` or your local prerequisites are installed.
- `pnpm dev` is running without errors.
- You can open both app ports, either through Codespaces forwarding or on `localhost`.
- You have Lab 00 open in another tab.

## If you get stuck

- Bring a facilitator your repo URL and the exact terminal error.
- If you want to compare against the working state for the current lesson, use [WORKING_SOLUTIONS.md](WORKING_SOLUTIONS.md).
- If GitHub shows `Repository Access Issue`, accept the pending repository invitation first.
- If `pnpm dev` fails with `tsx: not found`, run `pnpm install -r --frozen-lockfile && pnpm env:setup` once, then retry.
- If the lab asks for `curl` while `pnpm dev` is already running, open a second terminal instead of stopping the dev servers.
- If the forwarded `app.github.dev` page looks out of date but `http://localhost:3001` works in the codespace, keep going and use the localhost links from the terminal.
- If a port does not open, confirm `pnpm dev` is still running.
- If local setup fails, stop and switch back to GitHub Codespaces unless a facilitator tells you otherwise.

## Facilitator support lane

Use this order for quick triage:

1. Confirm the student accepted the correct GitHub Classroom invite.
2. Confirm the student accepted any pending repository invitation and no longer sees `Repository Access Issue`.
3. Confirm the Codespace finished booting before they ran anything manually.
4. If `pnpm dev` reports missing `tsx` or `node_modules`, run `pnpm install -r --frozen-lockfile && pnpm env:setup`, then retry.
5. If `app.github.dev` looks stale, verify the service via `http://localhost:3001` or `http://localhost:3002` inside the codespace and continue.
6. Confirm `pnpm dev` is running and ports `3001` and `3002` are forwarded.
7. If Codespaces is unavailable, move them to the local terminal path and keep them on Lab 00.
8. If the student is still blocked, pair them with a facilitator instead of improvising a different setup path.
