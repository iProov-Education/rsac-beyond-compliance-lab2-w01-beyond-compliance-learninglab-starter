# Lab 00 — Start

Lab ID: `00` · Timebox: 10 minutes

Goal: boot the starter repo, confirm the services are alive, and confirm the unfinished endpoints still return `501`.

If you want to compare against the working implementation for this lab or jump ahead, use [WORKING_SOLUTIONS.md](../WORKING_SOLUTIONS.md).

## What this lab is for

Do not build anything yet.

This lab is only a health check:

1. start the issuer and verifier
2. make sure the metadata page works
3. make sure the unfinished routes still return `501`

## Before you start

- Stay on `main`.
- Open two terminals.
- Keep `pnpm dev` running in Terminal 1.
- Use Terminal 2 for `curl` checks.

If you are in Codespaces, setup is usually already done for you.
If you are running locally and this is a fresh clone, run:

```bash
pnpm env:setup
pnpm install -r --frozen-lockfile
```

## Terminal 1: start the services

Run:

```bash
pnpm dev
```

Expected result:

- issuer starts on `http://localhost:3001`
- verifier starts on `http://localhost:3002`

You can also open these in the browser:

- `http://localhost:3001/`
- `http://localhost:3002/`

Those pages are only landing pages. They are not the full lab flow.

## Terminal 2: run the checks

### 1. Check issuer metadata

Run:

```bash
curl -s http://localhost:3001/.well-known/openid-credential-issuer | jq
```

Expected result:

- you get JSON back
- it mentions `/token` and `/credential`

### 2. Confirm the unfinished routes still return `501`

Run:

```bash
curl -i -X POST http://localhost:3001/credential-offers \
  -H 'content-type: application/json' \
  -d '{}'
```

```bash
curl -i -X POST http://localhost:3001/token \
  -H 'content-type: application/json' \
  -d '{}'
```

```bash
curl -i -X POST http://localhost:3001/credential \
  -H 'content-type: application/json' \
  -d '{}'
```

```bash
curl -i -X POST http://localhost:3002/verify \
  -H 'content-type: application/json' \
  -d '{}'
```

Expected result:

- these endpoints should return `501 Not Implemented`
- that is correct for Lab 00

## Files to open

Open these files so you know where later labs will happen:

- `issuer/src/index.ts`
- `verifier/src/index.ts`
- `bbs-lib/src/index.ts`

Do not worry about understanding every TODO yet.

## You are done when

- both servers start without crashing
- metadata returns JSON
- the unfinished credential and verify routes return `501`

## If something fails

- port already in use: change `ISSUER_PORT` or `VERIFIER_PORT` in your `.env` files
- metadata returns `404`: make sure `pnpm dev` is still running
- `pnpm` or Node missing locally: use the bootstrap instructions in the root `README.md`
