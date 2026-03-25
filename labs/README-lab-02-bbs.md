# Lab 02 — BBS+ Selective Disclosure

Lab ID: `02` · Timebox: 25 minutes

Goal: issue a BBS credential, reveal only one claim from it, and verify that selective disclosure proof.

If you want to compare against the working implementation for this lab or jump ahead, use [WORKING_SOLUTIONS.md](../WORKING_SOLUTIONS.md).

## What this lab changes

Lab 01 issued an SD-JWT.

Lab 02 adds a second credential format:

- `vc+sd-jwt` for the SD-JWT path
- `di-bbs` for the BBS selective-disclosure path

The big idea:

- the issuer signs a fixed list of messages
- later the holder reveals only some of those messages
- the verifier checks the proof without seeing everything

## Before you start

- Finish Lab 01 first.
- Keep `pnpm dev` running.
- Use a second terminal for `curl`.

## Files you will edit

- `issuer/src/index.ts`
- `verifier/src/index.ts`

## Part 1: teach the issuer about the BBS credential

### 1. Add the BBS credential configuration

In `issuer/src/index.ts`, add a second supported credential:

- `id: "AgeCredentialBBS"`
- `format: "di-bbs"`
- `scope: "age_bbs"`

This makes `/credential-offers` and `/credential` aware of the BBS format.

## Part 2: issue a BBS credential

### 2. Add the `di-bbs` branch inside `POST /credential`

In plain English:

- if the request asks for `di-bbs`, do not build an SD-JWT
- instead, build a fixed message array and sign it with the BBS keypair

The important rule in this lab is message order.

Pick one order and keep it fixed, for example:

1. subject
2. `age_over`
3. `residency`
4. status-list entry

If that order changes, the reveal indexes stop matching and the proof breaks.

Return a response shaped like this:

- `credentialId`
- `format: "di-bbs"`
- `credentialStatus`
- `credential`
- `signature`
- `messages`
- `nonce`
- `publicKey`
- `revealIndexes`

The minimal mental model is:

```ts
const messages = [
  subject,
  `age_over:${claims.age_over}`,
  `residency:${claims.residency}`,
  `status:${credentialStatus.statusListIndex}`
]

const signature = await signMessages(messages, bbsKeys.secretKey, bbsKeys.publicKey)
```

## Part 3: add the demo proof helper

### 3. Implement `POST /bbs/proof`

This helper is only for the workshop.

In plain English:

- the issuer already signed all messages
- this helper takes that signature plus the original messages
- it returns a BBS proof that reveals only the selected indexes

The request should accept:

- `signature`
- `messages`
- `reveal`
- `nonce`

The response should return:

- `proof`
- `revealedMessages`
- `nonce`
- `publicKey`

The minimal mental model is:

```ts
const proof = await deriveProof(signatureBytes, bbsKeys.publicKey, messages, reveal, nonce)
```

## Part 4: verify the BBS proof

### 4. Implement the BBS branch in `POST /verify`

In plain English:

- fetch the issuer BBS public key
- decode the submitted proof
- verify that proof against the revealed messages and nonce

For this lab, the verifier only needs to return success when the proof checks out.

If the request also contains `credentialStatus`, keep it around for Lab 05.

## Part 5: smoke test

### 5. Create a BBS offer

```bash
curl -s -X POST http://localhost:3001/credential-offers \
  -H 'content-type: application/json' \
  -d '{"credentials":["AgeCredentialBBS"]}' | jq
```

Copy the pre-authorized code.

### 6. Exchange the offer for a token

```bash
curl -s -X POST http://localhost:3001/token \
  -H 'content-type: application/json' \
  -d '{"grant_type":"urn:ietf:params:oauth:grant-type:pre-authorized_code","pre-authorized_code":"<code_from_offer>"}' | jq
```

Copy:

- `access_token`
- `c_nonce`

### 7. Build the proof JWT for `/credential`

Replace `<c_nonce>` with the real value:

```bash
PROOF_JWT=$(node -e "const h=Buffer.from('{\"alg\":\"none\"}').toString('base64url');const p=Buffer.from(JSON.stringify({nonce:'<c_nonce>',aud:'http://localhost:3001/credential'})).toString('base64url');console.log(`${h}.${p}.`)")
```

### 8. Request the BBS credential

```bash
curl -s -X POST http://localhost:3001/credential \
  -H "authorization: Bearer <access_token>" \
  -H 'content-type: application/json' \
  -d "{\"format\":\"di-bbs\",\"claims\":{\"age_over\":25,\"residency\":\"SE\"},\"proof\":{\"proof_type\":\"jwt\",\"jwt\":\"${PROOF_JWT}\"}}" | jq
```

Copy:

- `signature`
- `messages`

### 9. Derive a proof that reveals only `age_over`

```bash
curl -s -X POST http://localhost:3001/bbs/proof \
  -H 'content-type: application/json' \
  -d '{"signature":"<signature>","messages":<messages_array>,"reveal":[1],"nonce":"bbs-demo-nonce"}' | jq
```

Copy:

- `proof`
- `revealedMessages`

### 10. Verify the proof

```bash
curl -s -X POST http://localhost:3002/verify \
  -H 'content-type: application/json' \
  -d '{"format":"di-bbs","proof":{"proof":"<proof>","revealedMessages":["age_over:25"],"nonce":"bbs-demo-nonce"}}' | jq
```

## You are done when

- `/verify` returns `ok: true`
- only the selected claim is revealed
- changing the nonce and re-deriving the proof gives you a different proof

## If something fails

- `bbs_proof_failed`: your message order changed between signing and proof generation
- revealed messages do not match: regenerate the proof with the correct `reveal` indexes
- verifier cannot fetch the public key: check `BBS_KEY_URL` or the issuer `.well-known/bbs-public-key` route
