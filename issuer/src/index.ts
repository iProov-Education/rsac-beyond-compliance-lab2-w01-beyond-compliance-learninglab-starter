import express from 'express'
import type { Request, Response } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

const PORT = Number(process.env.ISSUER_PORT || 3001)
const BASE_URL = process.env.ISSUER_BASE_URL || `http://localhost:${PORT}`
const STATUS_LIST_ID = process.env.STATUS_LIST_ID || '1'

function notImplemented(res: Response, message: string) {
  return res.status(501).json({
    error: 'not_implemented',
    message
  })
}

app.get('/.well-known/openid-credential-issuer', (_req: Request, res: Response) => {
  res.json({
    credential_issuer: BASE_URL,
    token_endpoint: `${BASE_URL}/token`,
    credential_endpoint: `${BASE_URL}/credential`,
    status_list_endpoint: `${BASE_URL}/statuslist/${STATUS_LIST_ID}.json`,
    credentials_supported: [
      {
        id: 'AgeCredential',
        format: 'vc+sd-jwt',
        scope: 'age',
        display: [{ name: 'AgeCredential', locale: 'en-US' }]
      },
      {
        id: 'AgeCredentialBBS',
        format: 'di-bbs',
        scope: 'age_bbs',
        display: [{ name: 'AgeCredentialBBS', locale: 'en-US' }]
      }
    ]
  })
})

// Lab 01 hint: add `import { generateKeyPair, exportJWK } from 'jose'` near the top,
// then create issuerKeys once at startup with generateKeyPair('ES256') + exportJWK(publicKey).
// You will reuse issuerKeys.privateKey later when signing the SD-JWT in /credential.
// See labs/README-lab-01-issuance.md for the exact shape expected by the verifier.
app.get('/.well-known/jwks.json', (_req: Request, res: Response) => {
  return notImplemented(res, 'Lab 01: publish issuer signing keys')
})

// See labs/README-lab-02-bbs.md for the BBS public-key endpoint contract.
app.get('/.well-known/bbs-public-key', (_req: Request, res: Response) => {
  return notImplemented(res, 'Lab 02: publish BBS public key')
})

// --- Offers, tokens, credentials ---

// See labs/README-lab-01-issuance.md for the pre-authorized offer flow and payload.
app.post('/credential-offers', (_req: Request, res: Response) => {
  return notImplemented(res, 'Lab 01: implement pre-authorized credential offers')
})

// See labs/README-lab-01-issuance.md for token exchange, access_token, and c_nonce behavior.
app.post('/token', (_req: Request, res: Response) => {
  return notImplemented(res, 'Lab 01: implement token issuance for the pre-authorized flow')
})

// See labs/README-lab-01-issuance.md, labs/README-lab-02-bbs.md, labs/README-lab-04-iproov.md, and labs/README-lab-05-revocation.md.
app.post('/credential', (_req: Request, res: Response) => {
  return notImplemented(res, 'Lab 01/02/04/05: implement issuance, gating, and status')
})

// See labs/README-lab-02-bbs.md for proof derivation inputs and expected output shape.
app.post('/bbs/proof', (_req: Request, res: Response) => {
  return notImplemented(res, 'Lab 02: implement or expose the BBS proof helper')
})

// See labs/README-lab-04-iproov.md for claim-session creation and response shape.
app.get('/iproov/claim', (_req: Request, res: Response) => {
  return notImplemented(res, 'Lab 04: implement iProov claim session creation')
})

// See labs/README-lab-04-iproov.md for the webhook payload and pass/fail behavior.
app.post('/iproov/webhook', (_req: Request, res: Response) => {
  return notImplemented(res, 'Lab 04: implement iProov webhook handling')
})

// See labs/README-lab-05-revocation.md for the Bitstring Status List response format.
app.get('/statuslist/:id.json', (_req: Request, res: Response) => {
  return notImplemented(res, 'Lab 05: serve the Bitstring Status List')
})

// See labs/README-lab-05-revocation.md for the revocation mutation and admin-token checks.
app.post('/revoke/:id', (_req: Request, res: Response) => {
  return notImplemented(res, 'Lab 05: implement revocation')
})

app.get('/debug/issued', (_req: Request, res: Response) => {
  res.json({
    note: 'Students can add debug output here while building the labs'
  })
})

app.listen(PORT, () => {
  console.log(`[issuer] starter scaffold listening on ${BASE_URL}`)
})
