# Lab 03 — OHTTP Relay

Lab ID: `03` · Timebox: 20 minutes

Goal: make outbound fetches go through a relay instead of going straight from the verifier to the issuer.

If you want to compare against the working implementation for this lab or jump ahead, use [WORKING_SOLUTIONS.md](../WORKING_SOLUTIONS.md).

## What this lab is really about

This lab is mostly wiring, not cryptography.

The idea is simple:

- when OHTTP is off, fetch directly
- when OHTTP is on, send the same request to the relay URL instead

In this repo, the easiest place to see that behavior is the verifier fetch helper.

## Before you start

- Finish Lab 01 first.
- Keep `pnpm dev` running.
- If you want a real relay, use Cloudflare.
- If you only want to see the wiring path, the local `ohttp/` stub is fine.

## Files you will edit

- `verifier/src/index.ts`
- `issuer/.env`
- `verifier/.env`

## Part 1: get a relay URL

You have two options:

### Option A: use a real worker

Deploy the worker in `ohttp/` and keep its URL, for example:

```text
https://your-worker.workers.dev
```

### Option B: use the local stub

Run:

```bash
pnpm -F ohttp dev
```

This is enough to prove that requests are routed through the relay path.

## Part 2: turn the relay on

In both `issuer/.env` and `verifier/.env`, set:

```dotenv
USE_OHTTP=true
OHTTP_RELAY_URL=<your-relay-url>
```

Restart the dev servers after editing `.env`.

## Part 3: route fetches through the relay

Open `verifier/src/index.ts`.

Look for the fetch helper used by:

- JWKS fetches
- BBS public key fetches
- status-list fetches

The logic should be:

```ts
if (!USE_OHTTP || !OHTTP_RELAY_URL) {
  return await fetch(url, init)
}

return await fetch(`${OHTTP_RELAY_URL}?target=${encodeURIComponent(url)}`, init)
```

In plain English:

- if the flag is off, do nothing special
- if the flag is on, call the relay instead of the target URL directly

## Part 4: smoke test

### 1. Restart the app

```bash
pnpm dev
```

### 2. Run a normal credential flow

Reuse the Lab 01 or Lab 02 commands to:

- issue a credential
- verify a credential

The important part here is not the credential itself.
The important part is that verifier fetches should now go through the relay.

### 3. Confirm the relay is being used

Check one of these:

- worker logs
- local `ohttp` stub logs
- the verifier landing page / console output showing OHTTP is on

## You are done when

- the app still issues and verifies credentials
- outbound fetches use the relay URL when `USE_OHTTP=true`
- outbound fetches go direct again when `USE_OHTTP=false`

## If something fails

- relay URL wrong: requests will fail before the verifier can load JWKS or status lists
- nothing changed after editing `.env`: restart `pnpm dev`
- requests still go direct: check that your fetch helper reads `USE_OHTTP` and `OHTTP_RELAY_URL`
