# Lab 01 — SD-JWT Issuance

Lab ID: `01` · Timebox: 20 minutes

Goal: make the issuer mint one SD-JWT credential, then make the verifier accept it.

## Before you start

- Stay on `main`.
- Keep `pnpm dev` running in one terminal.
- Use a second terminal for `curl` commands.

## Files you will edit

- `issuer/src/index.ts`
- `verifier/src/index.ts`

## What you are building

By the end of this lab, these requests should work in order:

1. `POST /credential-offers`
2. `POST /token`
3. `POST /credential`
4. `POST /verify`

## Part 1: fix the issuer

Open `issuer/src/index.ts`.

If you see the comment `// --- Offers, tokens, credentials ---`, start there.
If you do not, use the `POST /credential-offers`, `POST /token`, and `POST /credential` stubs instead.

### 1. Publish the JWKS

Implement `GET /.well-known/jwks.json`.

Return the issuer public key in this shape:

```json
{ "keys": [/* public JWK here */] }
```

### 2. Implement `POST /credential-offers`

This route should:

- read `credentials` from the request body
- create one UUID pre-authorized code
- store it in memory with a 10 minute expiry
- return a `credential_offer` containing:
  - `credential_issuer`
  - `credential_configuration_ids`
  - `grants["urn:ietf:params:oauth:grant-type:pre-authorized_code"]["pre-authorized_code"]`

### 3. Implement `POST /token`

This route should:

- accept `grant_type = urn:ietf:params:oauth:grant-type:pre-authorized_code`
- read the pre-authorized code from the body
- find that code in memory
- mint:
  - `access_token`
  - `c_nonce`
- store both in memory
- delete the one-time offer code
- return the token response

Use:

- token expiry: 10 minutes
- `c_nonce` expiry: 5 minutes

### 4. Implement `POST /credential`

This route should:

- require `Authorization: Bearer <access_token>`
- reject missing or expired tokens
- read `proof.jwt`
- decode that JWT and check:
  - `nonce === c_nonce`
  - `aud` matches the issuer
- issue an SD-JWT for the requested claims
- return:
  - `credential`
  - `sd_jwt`
  - `disclosures`
  - `payload`
- store the issued credential in memory so `/debug/issued` can show it

For this lab, focus on the SD-JWT path only.

## Part 2: fix the verifier

Open `verifier/src/index.ts`.

### 5. Implement SD-JWT verification

Make the `vc+sd-jwt` branch verify the credential by doing this:

- split `credential` into the signed JWT and the disclosures
- fetch the issuer JWKS
- verify the JWT signature
- hash each disclosure
- confirm each disclosure hash appears in `_sd`
- rebuild the disclosed claims object

`/debug/credential` should return the last verified payload.

## Part 3: smoke test

### 6. Start the services

```bash
pnpm dev
```

### 7. Create an offer

```bash
curl -s -X POST http://localhost:3001/credential-offers \
  -H 'content-type: application/json' \
  -d '{"credentials":["AgeCredential"]}' | jq
```

Copy the pre-authorized code from the response.

### 8. Exchange the code for a token

```bash
curl -s -X POST http://localhost:3001/token \
  -H 'content-type: application/json' \
  -d '{"grant_type":"urn:ietf:params:oauth:grant-type:pre-authorized_code","pre-authorized_code":"<code_from_offer>"}' | jq
```

Copy:

- `access_token`
- `c_nonce`

### 9. Build a simple proof JWT

Replace `<c_nonce>` with the value from `/token`.

```bash
PROOF_JWT=$(node -e "const h=Buffer.from('{\"alg\":\"none\"}').toString('base64url');const p=Buffer.from(JSON.stringify({nonce:'<c_nonce>',aud:'http://localhost:3001/credential'})).toString('base64url');console.log(`${h}.${p}.`)")
```

### 10. Request the credential

Replace `<access_token>` with the value from `/token`.

```bash
curl -s -X POST http://localhost:3001/credential \
  -H "authorization: Bearer <access_token>" \
  -H 'content-type: application/json' \
  -d "{\"format\":\"vc+sd-jwt\",\"claims\":{\"age_over\":21,\"residency\":\"SE\"},\"proof\":{\"proof_type\":\"jwt\",\"jwt\":\"${PROOF_JWT}\"}}" | jq
```

Copy the returned `credential`.

### 11. Verify the credential

```bash
curl -s -X POST http://localhost:3002/verify \
  -H 'content-type: application/json' \
  -d '{"format":"vc+sd-jwt","credential":"<sd_jwt~disclosures>"}' | jq
```

### 12. Check the verifier debug output

```bash
curl -s http://localhost:3002/debug/credential | jq
```

## You are done when

- `/verify` returns `ok: true`
- the verified claims include `age_over` and `residency`
- `/debug/credential` shows the last verified payload

## If something fails

- `invalid_grant`: the pre-authorized code was wrong, expired, or already used
- `invalid_proof`: the `proof.jwt` nonce does not match the latest `c_nonce`
- signature or JWKS errors: check that the issuer JWKS URL matches the issuer base URL
