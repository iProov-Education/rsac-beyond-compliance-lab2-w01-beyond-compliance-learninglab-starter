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

The missing idea here is: you need an issuer signing keypair before this route can return anything useful.

Create that keypair once at startup near the top of `issuer/src/index.ts`:

- add the jose imports:
  - `import { generateKeyPair, exportJWK } from 'jose'`
- generate an ES256 keypair
- keep the private key for signing credentials later
- export the public key as a JWK
- save all of that in something like `issuerKeys`

In plain English:

- `issuerKeys.privateKey` is used later when you sign the SD-JWT
- `issuerKeys.publicJwk` is what this route returns to the verifier

The minimal shape is:

```ts
import { generateKeyPair, exportJWK } from 'jose'

const issuerKeys = await createIssuerKeys()

async function createIssuerKeys() {
  const { publicKey, privateKey } = await generateKeyPair('ES256')
  const publicJwk = await exportJWK(publicKey)
  publicJwk.kid = 'issuer-es256'
  return { publicKey, privateKey, publicJwk }
}
```

Return the issuer public key in this shape:

```json
{ "keys": [/* public JWK here */] }
```

So the route itself is small:

```ts
app.get('/.well-known/jwks.json', (_req, res) => {
  res.json({ keys: [issuerKeys.publicJwk] })
})
```

### 2. Implement `POST /credential-offers`

This route starts the issuance flow.

In plain English: the client asks, "I want an `AgeCredential`." Your server replies, "Here is a one-time code. Use that code on `/token` next."

This route should:

- read `credentials` from the request body
- create one UUID pre-authorized code
- store it in memory with a 10 minute expiry
- return a `credential_offer` containing:
  - `credential_issuer`
  - `credential_configuration_ids`
  - `grants["urn:ietf:params:oauth:grant-type:pre-authorized_code"]["pre-authorized_code"]`

Example request:

```json
{ "credentials": ["AgeCredential"] }
```

Example response shape:

```json
{
  "credential_offer": {
    "credential_issuer": "http://localhost:3001",
    "credential_configuration_ids": ["AgeCredential"],
    "grants": {
      "urn:ietf:params:oauth:grant-type:pre-authorized_code": {
        "pre-authorized_code": "123e4567-e89b-12d3-a456-426614174000",
        "user_pin_required": false
      }
    }
  },
  "expires_in": 600
}
```

### 3. Implement `POST /token`

This route swaps the one-time code for a real access token.

In plain English: if the client sends back the pre-authorized code from `/credential-offers`, give it a bearer token and a `c_nonce`.

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

Example response shape:

```json
{
  "access_token": "7a0e6f34-4e7e-4f30-8fd6-dc2e2e1d9380",
  "token_type": "Bearer",
  "expires_in": 600,
  "c_nonce": "9d2d06a0-38df-4e55-8e36-a0d22ce5871b",
  "c_nonce_expires_in": 300
}
```

### 4. Implement `POST /credential`

This route is where the issuer finally creates the credential.

In plain English: the client proves it has the access token and the latest `c_nonce`, then you mint an SD-JWT credential and return it.

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
