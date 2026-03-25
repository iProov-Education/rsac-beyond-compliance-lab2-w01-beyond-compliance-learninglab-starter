// Lab 05: SD-JWT + BBS verifier with OHTTP, revocation, and BBS disclosure-time iProov checks.
//
// Important teaching note:
// - with no LAB_ID, this file represents the final integrated verifier policy
// - with LAB_ID set, it can temporarily relax or restore lesson-specific checks
// - Lab 02 compatibility is intentionally narrow so the classroom can focus on
//   pure BBS+ proof verification without changing the default integrated flow
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { createHash, randomBytes } from 'node:crypto'
import { decodeJwt, decodeProtectedHeader, importJWK, jwtVerify } from 'jose'
import { base64ToBytes, verifyProof as verifyBbsProof } from 'bbs-lib'
import { assertPassedIProovSession } from './iproov.js'
import { shouldRequireIProovForBbsVerification } from './lab-compat.js'
import { buildVpRequest } from './vp-request.js'
import { inspectMdocCredential, looksLikeMdocDeviceResponse } from './wallet-mdoc.js'
import { createWalletRequestSigner, signWalletRequestObject } from './wallet-request-signing.js'
import {
  buildWalletRequestObject,
  createWalletSession,
  extractPresentedCredentials,
  normalizeWalletDirectPostBody,
  renderWalletQrSvg,
  renderWalletSessionPage,
  summarizeWalletClaims,
  type WalletDirectPostBody,
  type WalletRpOutcome,
  type WalletRpSession
} from './wallet-rp.js'

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: false, limit: '1mb' }))

const PORT = Number(process.env.VERIFIER_PORT || 3002)
const BASE_URL = process.env.VERIFIER_BASE_URL || `http://localhost:${PORT}`
const ISSUER_BASE_URL = process.env.ISSUER_BASE_URL || 'http://localhost:3001'
const ISSUER_JWKS_URL = process.env.ISSUER_JWKS_URL || `${ISSUER_BASE_URL}/.well-known/jwks.json`
const BBS_KEY_URL = process.env.BBS_KEY_URL || `${ISSUER_BASE_URL}/.well-known/bbs-public-key`
const VP_NONCE_TTL_MS = 5 * 60_000
const USE_OHTTP = String(process.env.USE_OHTTP || 'false') === 'true'
const OHTTP_RELAY_URL = process.env.OHTTP_RELAY_URL || ''
const STATUS_LIST_ID = process.env.STATUS_LIST_ID || '1'
const STATUS_LIST_URL = process.env.STATUS_LIST_URL || `${ISSUER_BASE_URL}/statuslist/${STATUS_LIST_ID}.json`
const WALLET_REQUEST_AUDIENCE = 'https://self-issued.me/v2'
// LAB_ID is injected by the lesson runner. Normal integrated runs leave it unset.
const ACTIVE_LAB_ID = process.env.LAB_ID

let lastPresentation: any = null
const cachedJwks = new Map<string, any>()
let cachedBbsPublicKey: Uint8Array | null = null
const vpNonces = new Map<string, number>()
const walletSessions = new Map<string, WalletRpSession>()
const walletRequestSigner = await createWalletRequestSigner(BASE_URL)

app.get('/', (_req, res) => {
  res.setHeader('content-type', 'text/html').send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Verifier — Lab 05</title>
  <style>body{font-family:system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding: 2rem; max-width: 960px; margin: auto;} code{background:#f6f8fa;padding:0.2rem 0.4rem;border-radius:4px}</style>
</head>
<body>
  <h1>Verifier (Lab 05: OHTTP + Revocation)</h1>
  <p>POST <code>/verify</code> with SD-JWT or BBS payloads. Outbound fetches use the relay when <code>USE_OHTTP=true</code>; revocation is enforced via the Bitstring Status List.</p>
  <p>Wallet-facing RP demo: <a href="/wallet"><code>/wallet</code></a></p>
</body>
</html>`)
})

app.get('/vp/request', (_req, res) => {
  const nonce = randomBytes(16).toString('base64url')
  vpNonces.set(nonce, Date.now() + VP_NONCE_TTL_MS)
  res.json(buildVpRequest(BASE_URL, nonce))
})

app.get('/wallet', (_req, res) => {
  const session = createWalletSession(BASE_URL)
  walletSessions.set(session.id, session)
  res.redirect(`/wallet/session/${session.id}`)
})

app.get('/wallet/session/:id', async (req, res) => {
  const session = walletSessions.get(req.params.id)
  if (!session) return res.status(404).json({ ok: false, error: 'wallet_session_not_found' })
  const qrSvg = await renderWalletQrSvg(session.deepLink)
  res.setHeader('content-type', 'text/html').send(renderWalletSessionPage(session, qrSvg))
})

app.get('/wallet/request.jwt/:id', async (req, res) => {
  const session = walletSessions.get(req.params.id)
  if (!session) return res.status(404).json({ ok: false, error: 'wallet_session_not_found' })
  const jwt = await signWalletRequestObject(buildWalletRequestObject(session), walletRequestSigner, WALLET_REQUEST_AUDIENCE)
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-type', 'application/oauth-authz-req+jwt')
  res.send(jwt)
})

app.post('/wallet/request.jwt/:id', async (req, res) => {
  const session = walletSessions.get(req.params.id)
  if (!session) return res.status(404).json({ ok: false, error: 'wallet_session_not_found' })
  const walletNonce =
    typeof req.body?.wallet_nonce === 'string'
      ? req.body.wallet_nonce
      : typeof req.body?.walletNonce === 'string'
        ? req.body.walletNonce
        : undefined
  const jwt = await signWalletRequestObject(
    buildWalletRequestObject(session, walletNonce),
    walletRequestSigner,
    WALLET_REQUEST_AUDIENCE
  )
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-type', 'application/oauth-authz-req+jwt')
  res.send(jwt)
})

app.post('/wallet/direct_post/:id', async (req, res) => {
  const session = walletSessions.get(req.params.id)
  if (!session) return res.status(404).json({ ok: false, error: 'wallet_session_not_found' })
  const body = normalizeWalletDirectPostBody(req.body)
  session.outcome = await evaluateWalletDirectPost(session, body)
  walletSessions.set(session.id, session)
  lastPresentation = {
    format: 'wallet-vp',
    receivedAt: session.outcome.receivedAt || new Date().toISOString(),
    result: session.outcome,
    raw: body
  }
  res
    .status(200)
    .setHeader('cache-control', 'no-store')
    .json({ redirect_uri: session.resultUri })
})

app.post('/verify', async (req, res) => {
  try {
    const format = detectFormat(req.body)
    let result: any
    if (format === 'di-bbs') {
      result = await verifyBbsPresentation(req.body)
    } else {
      const credential = req.body?.credential
      if (typeof credential !== 'string' || !credential.includes('~')) {
        return res.status(400).json({ ok: false, error: 'invalid_credential' })
      }
      result = await verifySdJwtPresentation(req.body)
    }
    lastPresentation = { format, receivedAt: new Date().toISOString(), result, raw: req.body }
    res.json({ ok: true, format, result })
  } catch (e: any) {
    console.error('[verifier] verification error', e)
    res.status(400).json({ ok: false, error: e?.message || 'verify_failed' })
  }
})

app.get('/debug/credential', (_req, res) => {
  res.json({ lastPresentation })
})

app.listen(PORT, () => {
  console.log(
    `[verifier] listening on ${BASE_URL} (Lab 05: OHTTP toggle ${
      USE_OHTTP && OHTTP_RELAY_URL ? `on via ${OHTTP_RELAY_URL}` : 'off'
    })`
  )
})

// --- helpers ---

function detectFormat(body: any) {
  const fmt = String(body?.format || '').toLowerCase()
  if (fmt) return fmt
  if (body?.proof || body?.revealedMessages) return 'di-bbs'
  if (typeof body?.credential === 'string' && body.credential.includes('~')) return 'vc+sd-jwt'
  return 'vc+sd-jwt'
}

async function verifyBbsPresentation(body: any) {
  const proofPayload = body?.proof || {}
  if (typeof proofPayload.proof !== 'string' || !Array.isArray(proofPayload.revealedMessages)) {
    throw new Error('invalid_proof')
  }
  const session = typeof body?.iproov_session === 'string' ? body.iproov_session.trim() : ''
  // Final integrated mode expects an iProov session before BBS disclosure
  // verification. LAB_ID=02 disables that single requirement so the student can
  // complete the BBS lesson without first wiring the liveness flow.
  if (!session && shouldRequireIProovForBbsVerification(ACTIVE_LAB_ID)) {
    throw new Error('Complete the iProov ceremony before verifying the BBS+ disclosure')
  }
  const nonce = proofPayload.nonce || 'bbs-demo-nonce'
  const publicKey = await fetchBbsPublicKey()
  const ok = await verifyBbsProof(base64ToBytes(proofPayload.proof), publicKey, proofPayload.revealedMessages, nonce)
  if (!ok) throw new Error('bbs_proof_failed')
  if (session) {
    await assertPassedIProovSession(ISSUER_BASE_URL, session, (input, init) => fetchViaRelay(String(input), init))
  }
  if (body.credentialStatus) {
    await ensureNotRevoked(body.credentialStatus)
  }
  return { revealedMessages: proofPayload.revealedMessages, nonce, iproovSession: session }
}

async function verifySdJwtPresentation(body: any) {
  const credential = String(body.credential || '')
  return await verifySdJwtCredential(credential)
}

function hashDisclosure(disclosure: string) {
  return createHash('sha256').update(disclosure).digest('base64url')
}

function parseDisclosure(disclosure: string): [string, string, any] {
  const decoded = Buffer.from(disclosure, 'base64url').toString('utf8')
  const arr = JSON.parse(decoded)
  if (!Array.isArray(arr) || arr.length < 3) {
    throw new Error('invalid_disclosure')
  }
  return arr as [string, string, any]
}

async function fetchJwks() {
  return await fetchJwksForIssuer(ISSUER_BASE_URL)
}

async function fetchBbsPublicKey() {
  if (cachedBbsPublicKey) return cachedBbsPublicKey
  const res = await fetchViaRelay(BBS_KEY_URL)
  if (!res.ok) throw new Error(`bbs_key_fetch_failed ${res.status}`)
  const json = await res.json()
  if (!json.publicKey) throw new Error('bbs_key_missing')
  cachedBbsPublicKey = base64ToBytes(json.publicKey)
  return cachedBbsPublicKey
}

async function fetchViaRelay(url: string, init?: RequestInit) {
  try {
    if (!USE_OHTTP || !OHTTP_RELAY_URL) return await fetch(url, init)
    // Simple relay helper: for real OHTTP, point OHTTP_RELAY_URL at your worker.
    return await fetch(`${OHTTP_RELAY_URL}?target=${encodeURIComponent(url)}`, init)
  } catch (error: any) {
    throw new Error(`fetch_failed ${url}: ${error?.message || 'unknown'}`)
  }
}

async function ensureNotRevoked(status: { statusListIndex: string | number; statusListCredential?: string }) {
  const url = status.statusListCredential || STATUS_LIST_URL
  const idx = Number(status.statusListIndex)
  if (Number.isNaN(idx)) return
  const list = await fetchStatusList(url)
  const revoked = isBitSet(list.buffer, idx)
  if (revoked) throw new Error('credential_revoked')
}

async function fetchStatusList(url: string) {
  const res = await fetchViaRelay(url)
  if (!res.ok) throw new Error(`status_list_fetch_failed ${res.status}`)
  const json = await res.json()
  const buffer = Buffer.from(json.encodedList, 'base64')
  return {
    bitstringLength: Number(json.bitstringLength || buffer.length * 8),
    encodedList: String(json.encodedList || ''),
    buffer
  }
}

function isBitSet(buffer: Buffer, index: number) {
  const byteIndex = Math.floor(index / 8)
  const bitOffset = index % 8
  if (byteIndex >= buffer.length) return false
  return (buffer[byteIndex] & (1 << bitOffset)) > 0
}

async function evaluateWalletDirectPost(session: WalletRpSession, body: WalletDirectPostBody): Promise<WalletRpOutcome> {
  const receivedAt = new Date().toISOString()
  const raw = body as Record<string, unknown>
  if (typeof body.error === 'string') {
    return {
      status: 'error',
      receivedAt,
      error: body.error,
      errorDescription: typeof body.error_description === 'string' ? body.error_description : undefined,
      presentationSubmission: body.presentation_submission,
      raw
    }
  }
  if (typeof body.state === 'string' && body.state !== session.state) {
    return {
      status: 'error',
      receivedAt,
      error: 'state_mismatch',
      errorDescription: `Expected ${session.state} but got ${body.state}`,
      presentationSubmission: body.presentation_submission,
      raw
    }
  }

  const credentials = extractPresentedCredentials(body.vp_token)
  if (credentials.length === 0) {
    return {
      status: 'error',
      receivedAt,
      error: 'missing_vp_token',
      presentationSubmission: body.presentation_submission,
      raw
    }
  }

  const result = await inspectWalletPresentation(credentials[0], {
    expectedAudience: session.clientId,
    expectedNonce: session.nonce
  })
  const summarizedClaims = summarizeWalletClaims(result.claims)
  const warningParts = []
  if ('warning' in result && result.warning) warningParts.push(result.warning)
  if (summarizedClaims.over21Derived !== null) warningParts.push('age_over_21 derived from PID birthdate')

  return {
    status: 'complete',
    receivedAt,
    mode: result.mode,
    issuer: typeof result.payload?.iss === 'string' ? result.payload.iss : undefined,
    vct:
      typeof result.payload?.vct === 'string'
        ? result.payload.vct
        : typeof result.payload?.docType === 'string'
          ? result.payload.docType
          : undefined,
    claims: summarizedClaims.claims,
    kbJwt: result.keyBinding ?? null,
    payload: result.payload,
    presentationSubmission: body.presentation_submission,
    raw,
    warning: warningParts.length > 0 ? warningParts.join(' | ') : undefined
  }
}

async function inspectWalletPresentation(
  credential: string,
  options: { expectedAudience?: string; expectedNonce?: string }
) {
  if (looksLikeMdocDeviceResponse(credential)) {
    return {
      ...inspectMdocCredential(credential),
      mode: 'inspected' as const
    }
  }
  try {
    const verified = await verifySdJwtCredential(credential, options)
    return { ...verified, mode: 'verified' as const }
  } catch (error: any) {
    if (looksLikeMdocDeviceResponse(credential)) {
      return {
        ...inspectMdocCredential(credential),
        mode: 'inspected' as const
      }
    }
    const inspected = inspectSdJwtCredential(credential)
    return {
      ...inspected,
      mode: 'inspected' as const,
      warning: error?.message || 'inspection_only'
    }
  }
}

async function verifySdJwtCredential(
  credential: string,
  options: { expectedAudience?: string; expectedNonce?: string } = {}
) {
  const { sdJwt, disclosures, keyBindingJwt } = splitPresentedSdJwt(credential)
  const preview = decodeJwt(sdJwt) as Record<string, unknown>
  const issuer = typeof preview.iss === 'string' ? preview.iss : ISSUER_BASE_URL
  const jwks = await fetchJwksForIssuer(issuer)
  const protectedHeader = decodeProtectedHeader(sdJwt)
  if (!protectedHeader.kid && jwks.keys?.length) {
    protectedHeader.kid = jwks.keys[0].kid
  }
  const key = jwks.keys.find((candidate: any) => !protectedHeader.kid || candidate.kid === protectedHeader.kid)
  if (!key) throw new Error('jwks_key_not_found')

  const verifyOptions: Record<string, unknown> = {}
  if (issuer) verifyOptions.issuer = issuer
  const { payload } = await jwtVerify(
    sdJwt,
    await importJWK(key, typeof protectedHeader.alg === 'string' ? protectedHeader.alg : 'ES256'),
    verifyOptions
  )

  const hashed = disclosures.map((item) => hashDisclosure(item))
  const sdArray = (payload as any)._sd || []
  for (const hash of hashed) {
    if (!sdArray.includes(hash)) throw new Error('disclosure_mismatch')
  }

  const claims = disclosures.reduce<Record<string, unknown>>((acc, disclosure) => {
    const [, name, value] = parseDisclosure(disclosure)
    acc[name] = value
    return acc
  }, {})

  if ((payload as any).credentialStatus) {
    await ensureNotRevoked((payload as any).credentialStatus)
  }

  let keyBinding: Record<string, unknown> | null = null
  if (keyBindingJwt) {
    keyBinding = await verifyKeyBindingJwt(keyBindingJwt, payload as Record<string, unknown>, options)
  }

  return { payload: payload as Record<string, unknown>, claims, keyBinding }
}

function inspectSdJwtCredential(credential: string) {
  const { sdJwt, disclosures, keyBindingJwt } = splitPresentedSdJwt(credential)
  const payload = decodeJwt(sdJwt) as Record<string, unknown>
  const claims = disclosures.reduce<Record<string, unknown>>((acc, disclosure) => {
    const [, name, value] = parseDisclosure(disclosure)
    acc[name] = value
    return acc
  }, {})
  const keyBinding = keyBindingJwt ? (decodeJwt(keyBindingJwt) as Record<string, unknown>) : null
  return { payload, claims, keyBinding }
}

async function verifyKeyBindingJwt(
  keyBindingJwt: string,
  payload: Record<string, unknown>,
  options: { expectedAudience?: string; expectedNonce?: string }
) {
  const holderJwk = (payload as any).cnf?.jwk
  if (!holderJwk) throw new Error('holder_jwk_missing')
  const protectedHeader = decodeProtectedHeader(keyBindingJwt)
  const verifyOptions: Record<string, unknown> = {}
  if (options.expectedAudience) {
    verifyOptions.audience = options.expectedAudience
  }
  const { payload: keyBindingPayload } = await jwtVerify(
    keyBindingJwt,
    await importJWK(holderJwk, typeof protectedHeader.alg === 'string' ? protectedHeader.alg : 'ES256'),
    verifyOptions
  )
  if (options.expectedNonce && keyBindingPayload.nonce !== options.expectedNonce) {
    throw new Error('kb_nonce_mismatch')
  }
  return keyBindingPayload as Record<string, unknown>
}

function splitPresentedSdJwt(credential: string) {
  const segments = credential.split('~').filter(Boolean)
  const [sdJwt, ...tail] = segments
  if (!sdJwt) throw new Error('missing_sd_jwt')
  const disclosures: string[] = []
  let keyBindingJwt: string | null = null
  for (const segment of tail) {
    if (!keyBindingJwt && looksLikeJwt(segment) && !isDisclosure(segment)) {
      keyBindingJwt = segment
      continue
    }
    disclosures.push(segment)
  }
  if (disclosures.length === 0) throw new Error('missing_disclosures')
  return { sdJwt, disclosures, keyBindingJwt }
}

function looksLikeJwt(value: string) {
  return value.split('.').length === 3
}

function isDisclosure(value: string) {
  try {
    parseDisclosure(value)
    return true
  } catch {
    return false
  }
}

async function fetchJwksForIssuer(issuer: string) {
  const jwksUrl = await resolveJwksUrl(issuer)
  if (cachedJwks.has(jwksUrl)) return cachedJwks.get(jwksUrl)
  const res = await fetchViaRelay(jwksUrl)
  if (!res.ok) throw new Error(`jwks_fetch_failed ${res.status}`)
  const json = await res.json()
  cachedJwks.set(jwksUrl, json)
  return json
}

async function resolveJwksUrl(issuer: string) {
  if (!issuer || issuer === ISSUER_BASE_URL) return ISSUER_JWKS_URL
  try {
    const metadataUrl = new URL('/.well-known/openid-credential-issuer', issuer).toString()
    const res = await fetchViaRelay(metadataUrl)
    if (res.ok) {
      const metadata = await res.json()
      if (typeof metadata.jwks_uri === 'string' && metadata.jwks_uri) {
        return metadata.jwks_uri
      }
    }
  } catch {
    // Fall through to the direct JWKS well-known URL.
  }
  return new URL('/.well-known/jwks.json', issuer).toString()
}
