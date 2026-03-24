import express from 'express'
import type { Response } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { randomBytes } from 'node:crypto'

dotenv.config()

// Student setup hint:
// - Lab 01 usually adds jose imports for JWT verification plus helpers for disclosure hashing.
// - You will also want somewhere to cache the issuer JWKS and store the last verified result.
// - Later labs extend this same file with BBS verification, relay fetches, and revocation checks.

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

const PORT = Number(process.env.VERIFIER_PORT || 3002)
const BASE_URL = process.env.VERIFIER_BASE_URL || `http://localhost:${PORT}`

function notImplemented(res: Response, message: string) {
  return res.status(501).json({
    error: 'not_implemented',
    message
  })
}

app.get('/', (_req, res) => {
  res.setHeader('content-type', 'text/html').send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Verifier Starter</title>
  </head>
  <body>
    <h1>Verifier starter scaffold</h1>
    <p>Build Labs 01–05 here.</p>
  </body>
</html>`)
})

app.get('/vp/request', (_req, res) => {
  const nonce = randomBytes(16).toString('base64url')
  res.json({
    response_type: 'vp_token',
    response_mode: 'direct_post',
    client_id: BASE_URL,
    nonce,
    presentation_definition: {
      id: 'over-21-and-nationality',
      name: 'Over 21 and nationality',
      purpose: 'Request proof that the holder is over 21 and disclose nationality to the relying party.',
      input_descriptors: [
        {
          id: 'age-over-21',
          name: 'Age over 21',
          purpose: 'Ask the wallet for an age_over value that is at least 21.',
          constraints: {
            limit_disclosure: 'required',
            fields: [
              {
                path: [
                  '$.vc.credentialSubject.age_over',
                  '$.credentialSubject.age_over',
                  '$.age_over'
                ],
                filter: {
                  type: 'number',
                  minimum: 21
                }
              }
            ]
          }
        },
        {
          id: 'nationality',
          name: 'Nationality',
          purpose: 'Ask the wallet for nationality. The integrated lab credential still uses residency, so the demo accepts that path too.',
          constraints: {
            limit_disclosure: 'required',
            fields: [
              {
                path: [
                  '$.vc.credentialSubject.nationality',
                  '$.credentialSubject.nationality',
                  '$.nationality',
                  '$.vc.credentialSubject.residency',
                  '$.credentialSubject.residency',
                  '$.residency'
                ],
                filter: {
                  type: 'string',
                  minLength: 2
                }
              }
            ]
          }
        }
      ]
    }
  })
})

// Lab 01 hint: split SD-JWT credentials into the signed JWT and disclosures, verify the JWT,
// then rebuild the disclosed claims.
// Lab 02 adds the BBS proof-verification branch.
// Lab 03 routes outbound fetches through the relay when OHTTP is on.
// Lab 05 checks credentialStatus against the published status list.
// See the lab README files for the current lesson's exact flow.
app.post('/verify', (_req, res) => {
  return notImplemented(res, 'Lab 01/02/03/05: implement verification, relay usage, and revocation checks')
})

app.get('/debug/credential', (_req, res) => {
  res.json({
    note: 'Students can expose their last verified presentation here during development'
  })
})

app.listen(PORT, () => {
  console.log(`[verifier] starter scaffold listening on ${BASE_URL}`)
})
