# Lab 05 — Revocation with a Bitstring Status List

Lab ID: `05` · Timebox: 20 minutes

Goal: mark an issued credential as revoked and make the verifier reject it after that.

If you want to compare against the working implementation for this lab or jump ahead, use [WORKING_SOLUTIONS.md](../WORKING_SOLUTIONS.md).

## What this lab is really about

Think of the status list as a long row of bits:

- `0` means the credential is still valid
- `1` means the credential is revoked

Each issued credential gets one index in that list.

The flow is:

1. issue a credential and assign it a `statusListIndex`
2. publish the status list
3. let the verifier read that list
4. flip the bit later through a revoke endpoint

## Before you start

- Finish Lab 01 first.
- Finish Lab 02 as well if you want to test the BBS path too.
- Keep `pnpm dev` running.

If needed, set `STATUS_LIST_ID` in your `.env` files.

## Files you will edit

- `issuer/src/index.ts`
- `verifier/src/index.ts`

## Part 1: make sure a status list exists

From the repo root, run:

```bash
pnpm --filter status-list run generate
```

That creates the default list file in `status-list/data/`.

## Part 2: publish the status list from the issuer

### 1. Implement `GET /statuslist/:id.json`

In plain English:

- if the requested id is the wrong one, return `404`
- otherwise return the JSON status list

The response should include:

- `statusPurpose`
- `bitstringLength`
- `encodedList`

## Part 3: put status metadata into each issued credential

### 2. Add `credentialStatus` during issuance

When you issue a credential, add:

- `statusListIndex`
- `statusListCredential`

That tells the verifier:

- which list to fetch
- which bit to check

## Part 4: make the verifier enforce revocation

### 3. Check the status bit during verification

In plain English:

- fetch the status list JSON
- decode the base64 bitstring
- read the bit at `statusListIndex`
- fail verification if that bit is set

This should run for both:

- SD-JWT verification
- BBS verification

## Part 5: add the revoke endpoint

### 4. Implement `POST /revoke/:id`

This route should:

- require `x-admin-token`
- find the issued credential by id
- flip its status-list bit to revoked
- persist the updated list

The important part is that the same credential verifies before revocation and fails after revocation.

## Part 6: smoke test

### 1. Issue a credential

Use either the Lab 01 SD-JWT flow or the Lab 02 BBS flow.

Copy the returned:

- `credentialId`
- `credential` or proof payload

### 2. Verify it once before revocation

Expected result:

- verification succeeds

### 3. Revoke it

```bash
curl -s -X POST http://localhost:3001/revoke/<credentialId> \
  -H 'x-admin-token: <ADMIN_TOKEN>' | jq
```

Expected result:

- the issuer returns `ok: true`

### 4. Verify it again

Expected result:

- verification now fails

## You are done when

- verification succeeds before revocation
- verification fails after revocation
- `/statuslist/:id.json` reflects the change

## If something fails

- status list `404`: check that `STATUS_LIST_ID` matches the generated file name
- revocation appears to do nothing: make sure you updated both the in-memory buffer and the file on disk
- verifier still accepts the credential: restart it or clear any status-list cache
