# Lab 04 — iProov Liveness Gate

Lab ID: `04` · Timebox: 20 minutes

Goal: do not issue or accept the protected credential flow until an iProov session has passed.

If you want to compare against the working implementation for this lab or jump ahead, use [WORKING_SOLUTIONS.md](../WORKING_SOLUTIONS.md).

## What this lab is really about

The main idea is simple:

1. create an iProov session
2. remember that session in memory
3. mark it passed when the webhook says it passed
4. block the protected flow until that session is marked passed

For the workshop, a simple in-memory map is enough.
You do not need a full production integration.

## Before you start

- Finish Labs 01 and 02 first.
- Keep `pnpm dev` running.
- This workshop uses a Codespaces-only setup for Lab 04.

For students in Codespaces:

- the instructor has already provided the required iProov credentials
- you do not need to edit `issuer/.env`
- you do not need to paste any iProov secret into the repo

For this workshop, treat the Codespace as the only supported path for the real iProov flow.
If you are working outside Codespaces, use the demo-mode webhook path unless the instructor has explicitly given you a separate local setup.

## Files you will edit

- `issuer/src/index.ts`
- If you continue into Optional Lab 06 later, the wallet-specific code lives in the separate iOS or Android wallet repo, not inside `LearningLab`.

## Part 1: create a session endpoint

### 1. Implement `GET /iproov/claim`

In plain English:

- create a session id
- store it in memory with `passed: false`
- return enough data for the client to start the ceremony

For demo mode, returning a simple session object is fine.

The response should include at least:

- `session`
- `mode`
- `token`
- `streamingURL`

## Part 2: accept the webhook result

### 2. Implement `POST /iproov/webhook`

In plain English:

- read the incoming session id
- read whether the result passed or failed
- update the stored session state

The most important field is:

```json
{ "signals": { "matching": { "passed": true } } }
```

After this webhook runs, your in-memory session map should know whether that session passed.

## Part 3: block the protected flow until liveness passes

### 3. Add the gate

Pick the place this lab should protect in your current flow.

For the workshop repo, that is usually:

- before issuing the protected credential, or
- before verifying the protected BBS disclosure flow

The behavior should be:

- no session or failed session -> return `403`
- passed session -> continue normally

## Part 4: optional wallet hook

If you continue into Optional Lab 06, the external wallet fork should:

1. call `/iproov/claim`
2. launch the iProov SDK
3. continue only after success

The minimal Swift shape is:

```swift
IProov.launch(streamingURL: URL(string: claim.streamingURL)!, token: claim.token) { event in
  switch event {
  case .success(_): onResult(true)
  case .failure(_): onResult(false)
  default: break
  }
}
```

## Part 5: smoke test

### 1. Create an iProov session

```bash
curl -s http://localhost:3001/iproov/claim | jq
```

Copy the `session`.

### 2. Try the protected flow before the webhook

Attempt the protected credential or disclosure step you are gating.

Expected result:

- it should fail with `403`

### 3. Simulate a passed webhook

```bash
curl -s -X POST http://localhost:3001/iproov/webhook \
  -H 'content-type: application/json' \
  -d '{"session":"<session>","signals":{"matching":{"passed":true}}}' | jq
```

### 4. Retry the protected flow

Expected result:

- it now succeeds without other code changes

## You are done when

- the protected flow is blocked before the webhook
- the same flow succeeds after the webhook marks the session passed

## If something fails

- still getting `403`: check that you used the same session id in the webhook and in the protected flow
- session not found: make sure `/iproov/claim` stored it in memory
- real iProov setup failing: use the demo webhook path first, then come back to the real integration
