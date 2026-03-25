// Lab 05: SD-JWT + BBS issuer with OHTTP toggle, iProov session state, and Bitstring Status List revocation.
//
// Important teaching note:
// - with no LAB_ID, this file represents the final integrated runtime on `main`
// - with LAB_ID set by `scripts/lab-check.js` or GitHub Classroom, it can
//   temporarily restore lesson-specific behavior without changing the final flow
// - demo-conductor and wallet work must stay additive; lesson compatibility must
//   never become the default runtime behavior
import express from 'express'
import type { Request, Response } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import crypto, { createHash } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'
import {
  SignJWT,
  calculateJwkThumbprint,
  decodeJwt,
  decodeProtectedHeader,
  exportJWK,
  generateKeyPair,
  importJWK,
  jwtVerify
} from 'jose'
import { z } from 'zod'
import { base64ToBytes, bytesToBase64, deriveProof, generateBbsKeypair, signMessages } from 'bbs-lib'
import {
  buildIProovMobileLaunchUrl,
  parseIProovMobileCallbackUrl,
  renderIProovMobilePage
} from './iproov-mobile.js'
import { requestEnrolToken, resolveIProovConfig, validateEnrolToken } from './iproov.js'
import { evaluateCredentialIssuanceIProovGate } from './lab-compat.js'
import { renderIssuerLandingPage } from './landing-page.js'

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

const PORT = Number(process.env.ISSUER_PORT || 3001)
const BASE_URL = process.env.ISSUER_BASE_URL || `http://localhost:${PORT}`
const DEMO_MODE = String(process.env.DEMO_MODE || 'true') !== 'false'
const STATUS_LIST_ID = process.env.STATUS_LIST_ID || '1'
const USE_OHTTP = String(process.env.USE_OHTTP || 'false') === 'true'
const OHTTP_RELAY_URL = process.env.OHTTP_RELAY_URL || ''
const IPROOV = resolveIProovConfig(process.env)
// LAB_ID is only used to make the integrated branch behave like earlier lesson
// checkpoints when the classroom runner explicitly asks for that behavior.
const ACTIVE_LAB_ID = process.env.LAB_ID
const ADMIN_TOKEN = process.env.ADMIN_TOKEN?.trim()
const STATUS_LIST_SIZE_BITS = Number(process.env.STATUS_LIST_SIZE_BITS || 8192)
const STATUS_LIST_DIR = path.resolve(process.cwd(), '../status-list/data')
const STATUS_LIST_PATH = path.join(STATUS_LIST_DIR, `${STATUS_LIST_ID}.json`)

if (USE_OHTTP && !OHTTP_RELAY_URL) {
  console.warn('[issuer] USE_OHTTP=true but OHTTP_RELAY_URL is not set; outbound calls will go direct.')
}
if (!ADMIN_TOKEN) {
  console.warn('[issuer] ADMIN_TOKEN not set; /revoke is disabled until configured.')
}

type CredentialConfig = {
  id: string
  format: 'vc+sd-jwt' | 'di-bbs'
  scope: string
  vct: string
}

type CredentialOfferState = {
  code: string
  credentials: string[]
  expiresAt: number
}

type AccessTokenState = {
  token: string
  expiresAt: number
  cNonce: string
  cNonceExpiresAt: number
  credentials: string[]
}

type IssuedCredential = {
  id: string
  format: 'sd-jwt' | 'di-bbs'
  subject: string
  claims: Record<string, any>
  statusListIndex: number
  createdAt: string
}

type StatusListState = {
  id: string
  filePath: string
  buffer: Buffer
  bitstringLength: number
  nextIndex: number
}

type IProovSessionState = {
  passed: boolean
  mode: 'demo' | 'real'
  userId: string
  token: string | null
  validatedAt: string | null
  failureReason: string | null
  signals: Record<string, unknown> | null
}

const credentialsSupported: CredentialConfig[] = [
  {
    id: 'AgeCredential',
    format: 'vc+sd-jwt',
    scope: 'age',
    vct: 'https://example.org/vct/age-credential'
  },
  {
    id: 'AgeCredentialBBS',
    format: 'di-bbs',
    scope: 'age_bbs',
    vct: 'https://example.org/vct/age-credential-bbs'
  }
]

const offers = new Map<string, CredentialOfferState>()
const accessTokens = new Map<string, AccessTokenState>()
const issued: Record<string, IssuedCredential> = {}
const iproovSessions = new Map<string, IProovSessionState>()

const issuerKeys = await createIssuerKeys()
const bbsKeys = await generateBbsKeypair()
const statusList = await loadStatusList()

function normalizeClaims(raw: any) {
  const fallback = { age_over: 18, residency: 'SE' }
  if (!raw || typeof raw !== 'object') return fallback
  return {
    age_over: Number(raw.age_over ?? fallback.age_over),
    residency: String(raw.residency ?? fallback.residency)
  }
}

function notImplemented(res: Response, message: string) {
  return res.status(501).json({ error: 'not_implemented', message })
}

// --- Metadata ---

app.get('/', (_req: Request, res: Response) => {
  res.setHeader('content-type', 'text/html').send(
    renderIssuerLandingPage({
      statusListId: STATUS_LIST_ID,
      demoMode: DEMO_MODE,
      useOhttp: USE_OHTTP,
      ohttpRelayUrl: OHTTP_RELAY_URL
    })
  )
})

app.get('/.well-known/openid-credential-issuer', (_req: Request, res: Response) => {
  res.json({
    credential_issuer: BASE_URL,
    authorization_server: BASE_URL,
    credential_endpoint: `${BASE_URL}/credential`,
    token_endpoint: `${BASE_URL}/token`,
    status_list_endpoint: `${BASE_URL}/statuslist/${STATUS_LIST_ID}.json`,
    jwks_uri: `${BASE_URL}/.well-known/jwks.json`,
    credentials_supported: credentialsSupported.map((c) => ({
      id: c.id,
      format: c.format,
      scope: c.scope,
      vct: c.vct,
      cryptographic_binding_methods_supported: ['jwk'],
      cryptographic_suites_supported: c.format === 'di-bbs' ? ['BBS+'] : ['ES256'],
      proof_types_supported: [{ proof_type: 'jwt', jwt_alg_values_supported: ['ES256'] }],
      credential_status: {
        status_list: {
          uri: `${BASE_URL}/statuslist/${STATUS_LIST_ID}.json`,
          credential_status_type: 'BitstringStatusListEntry',
          status_purpose: 'revocation'
        }
      },
      display: [{ name: c.id, locale: 'en-US' }]
    })),
    display: [{ name: 'Beyond-EUDI Issuer', locale: 'en-US' }]
  })
})

app.get('/.well-known/jwks.json', (_req: Request, res: Response) => {
  res.json({ keys: [issuerKeys.publicJwk] })
})

app.get('/.well-known/bbs-public-key', (_req: Request, res: Response) => {
  res.json({
    publicKey: bytesToBase64(bbsKeys.publicKey),
    createdAt: new Date().toISOString(),
    statusListId: STATUS_LIST_ID
  })
})

// --- Offers, tokens, credentials (SD-JWT only) ---

app.post('/credential-offers', (req: Request, res: Response) => {
  if (!DEMO_MODE) return res.status(401).json({ error: 'demo_mode_disabled' })
  const body = z
    .object({
      credentials: z.array(z.string()).default([credentialsSupported[0].id])
    })
    .parse(req.body || {})
  const credentialIds = body.credentials.filter((id) => credentialsSupported.some((c) => c.id === id))
  if (credentialIds.length === 0) return res.status(400).json({ error: 'invalid_credentials' })
  const code = crypto.randomUUID()
  const expiresAt = Date.now() + 10 * 60_000
  offers.set(code, { code, credentials: credentialIds, expiresAt })
  const offer = {
    credential_issuer: BASE_URL,
    credential_configuration_ids: credentialIds,
    grants: {
      'urn:ietf:params:oauth:grant-type:pre-authorized_code': { 'pre-authorized_code': code, user_pin_required: false }
    }
  }
  res.json({ credential_offer: offer, expires_in: 600 })
})

app.post('/token', (req: Request, res: Response) => {
  const body = z
    .object({
      grant_type: z.string(),
      'pre-authorized_code': z.string().optional(),
      pre_authorized_code: z.string().optional(),
      code: z.string().optional()
    })
    .parse(req.body || {})
  if (body.grant_type !== 'urn:ietf:params:oauth:grant-type:pre-authorized_code' && body.grant_type !== 'authorization_code') {
    return res.status(400).json({ error: 'unsupported_grant_type' })
  }
  const code = body['pre-authorized_code'] || body.pre_authorized_code || body.code
  if (!code) return res.status(400).json({ error: 'invalid_request', message: 'pre-authorized_code is required' })
  const offer = offers.get(code)
  if (!offer || offer.expiresAt < Date.now()) return res.status(400).json({ error: 'invalid_grant' })

  const accessToken = crypto.randomUUID()
  const cNonce = crypto.randomUUID()
  const state: AccessTokenState = {
    token: accessToken,
    expiresAt: Date.now() + 10 * 60_000,
    cNonce,
    cNonceExpiresAt: Date.now() + 5 * 60_000,
    credentials: offer.credentials
  }
  accessTokens.set(accessToken, state)
  offers.delete(code)
  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 600,
    c_nonce: cNonce,
    c_nonce_expires_in: 300
  })
})

app.post('/credential', async (req: Request, res: Response) => {
  const auth = req.header('authorization') || ''
  const token = auth.replace(/^(DPoP|Bearer)\s+/i, '')
  if (!token || !accessTokens.has(token)) return res.status(401).json({ error: 'invalid_token' })
  const tokenState = accessTokens.get(token)!
  if (tokenState.expiresAt < Date.now()) return res.status(401).json({ error: 'token_expired' })

  const body = z
    .object({
      format: z.string().optional(),
      credential_configuration_id: z.string().optional(),
      subject: z.string().optional(),
      claims: z.record(z.any()).optional(),
      iproov_session: z.string().optional(),
      proof: z
        .object({
          proof_type: z.string().optional(),
          jwt: z.string().optional()
        })
        .optional()
    })
    .parse(req.body || {})

  const credentialId = body.credential_configuration_id || body.format || credentialsSupported[0].id
  const config = credentialsSupported.find((c) => c.id === credentialId || c.format === body.format)
  if (!config) return res.status(400).json({ error: 'unsupported_credential' })
  if (!tokenState.credentials.includes(config.id)) {
    return res.status(401).json({ error: 'unauthorized_credential', message: 'token not authorized for this credential id' })
  }

  // c_nonce + proof check (holder binding)
  if (tokenState.cNonce && tokenState.cNonceExpiresAt <= Date.now()) {
    return res.status(401).json({ error: 'c_nonce_expired' })
  }
  if (tokenState.cNonce && tokenState.cNonceExpiresAt > Date.now()) {
    const proofJwt = body.proof?.jwt
    if (!proofJwt) return res.status(400).json({ error: 'invalid_proof', message: 'proof.jwt with c_nonce is required' })
    const proofPayload = decodeJwt(proofJwt)
    if ((proofPayload as any).nonce !== tokenState.cNonce) {
      return res.status(400).json({ error: 'invalid_proof', message: 'c_nonce mismatch' })
    }
    const aud = (proofPayload as any).aud
    if (aud && aud !== BASE_URL && aud !== `${BASE_URL}/credential`) {
      return res.status(400).json({ error: 'invalid_proof', message: 'audience mismatch' })
    }
  }

  const iproovSession = body.iproov_session?.trim() || ''
  const iproovSessionState = iproovSession ? iproovSessions.get(iproovSession) : null
  // Final integrated mode does not block all issuance on iProov by default.
  // LAB_ID=04 temporarily restores issuance-time gating so students can learn
  // the liveness step without also needing the later BBS disclosure policy.
  const iproovDecision = evaluateCredentialIssuanceIProovGate({
    labId: ACTIVE_LAB_ID,
    providedSession: Boolean(iproovSession),
    passedSession: iproovSessionState?.passed
  })
  if (!iproovDecision.allowed) {
    return res.status(403).json({
      error: iproovDecision.reason,
      message: 'Complete the iProov ceremony before credential issuance'
    })
  }

  const subject = body.subject || `did:example:${crypto.randomUUID()}`
  const claims = normalizeClaims(body.claims)
  const statusListIndex = await allocateStatusIndex()
  const credentialStatus = {
    statusListIndex,
    statusListCredential: `${BASE_URL}/statuslist/${STATUS_LIST_ID}.json`
  }
  const id = crypto.randomUUID()

  if (config.format === 'di-bbs') {
    const bbs = await issueBbsCredential(subject, claims, credentialStatus)
    issued[id] = {
      id,
      format: 'di-bbs',
      subject,
      claims,
      statusListIndex,
      createdAt: new Date().toISOString()
    }
    const newCNonce = crypto.randomUUID()
    tokenState.cNonce = newCNonce
    tokenState.cNonceExpiresAt = Date.now() + 5 * 60_000
    return res.json({
      credentialId: id,
      format: 'di-bbs',
      credentialStatus,
      credential: bbs.credential,
      signature: bbs.signature,
      messages: bbs.messages,
      nonce: bbs.nonce,
      c_nonce: newCNonce,
      c_nonce_expires_in: 300,
      publicKey: bytesToBase64(bbsKeys.publicKey),
      revealIndexes: { subject: 0, age_over: 1, residency: 2, status: 3 },
      note: DEMO_MODE
        ? 'Derive a BBS+ proof with the signature + messages using @mattrglobal/node-bbs-signatures or POST /bbs/proof (demo helper).'
        : undefined
    })
  }

  const sd = await issueSdJwt(subject, claims, credentialStatus, config.vct)
  issued[id] = {
    id,
    format: 'sd-jwt',
    subject,
    claims,
    statusListIndex,
    createdAt: new Date().toISOString()
  }
  const newCNonce = crypto.randomUUID()
  tokenState.cNonce = newCNonce
  tokenState.cNonceExpiresAt = Date.now() + 5 * 60_000
  return res.json({
    credentialId: id,
    format: 'vc+sd-jwt',
    credential: sd.combined,
    sd_jwt: sd.sdJwt,
    disclosures: sd.disclosures,
    payload: sd.payload,
    credentialStatus,
    jwks_uri: `${BASE_URL}/.well-known/jwks.json`,
    c_nonce: newCNonce,
    c_nonce_expires_in: 300
  })
})

// --- Demo helpers / placeholders ---

app.get('/statuslist/:id.json', (req: Request, res: Response) => {
  const { id } = req.params
  if (id !== STATUS_LIST_ID) {
    return res.status(404).json({ error: 'status_list_not_found' })
  }
  res.json({
    statusPurpose: 'revocation',
    bitstringLength: statusList.bitstringLength,
    encodedList: statusList.buffer.toString('base64')
  })
})

app.post('/revoke/:id', async (req: Request, res: Response) => {
  if (!ADMIN_TOKEN) {
    return res.status(503).json({ error: 'admin_token_not_configured', message: 'Set ADMIN_TOKEN to enable revocation' })
  }
  if (req.header('x-admin-token') !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  const id = req.params.id
  const entry = issued[id]
  if (!entry) return res.status(404).json({ error: 'not_found' })
  try {
    await setStatusBit(entry.statusListIndex, true)
    res.json({ ok: true, statusListIndex: entry.statusListIndex })
  } catch (err: any) {
    console.error('[issuer] revoke error', err)
    res.status(500).json({ error: 'revoke_failed', message: err?.message || 'unknown' })
  }
})

app.post('/bbs/proof', async (req: Request, res: Response) => {
  if (!DEMO_MODE) return res.status(404).json({ error: 'disabled' })
  try {
    const { signature, messages, reveal = [1], nonce = 'bbs-demo-nonce' } = req.body || {}
    if (!signature || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'invalid_request', message: 'signature (base64) and messages[] are required' })
    }
    const proof = await deriveProof(base64ToBytes(signature), bbsKeys.publicKey, messages, reveal, nonce)
    res.json({
      proof: bytesToBase64(proof),
      revealedMessages: reveal.map((idx: number) => messages[idx]),
      nonce,
      publicKey: bytesToBase64(bbsKeys.publicKey)
    })
  } catch (err: any) {
    console.error('[issuer] bbs proof error', err)
    res.status(500).json({ error: 'bbs_proof_failed', message: err?.message || 'unknown' })
  }
})

app.get('/iproov/config', (_req: Request, res: Response) => {
  res.json({
    realCeremonyEnabled: IPROOV.realCeremonyEnabled,
    ceremonyBaseUrl: IPROOV.ceremonyBaseUrl,
    sdkScriptUrl: IPROOV.sdkScriptUrl,
    assuranceType: IPROOV.assuranceType,
    note: IPROOV.realCeremonyEnabled
      ? 'Launch the real iProov web ceremony and validate the session before the BBS+ disclosure is verified.'
      : 'Configure IPROOV_API_KEY and IPROOV_SECRET or IPROOV_MANAGEMENT_KEY to enable the real web ceremony.'
  })
})

app.get('/iproov/claim', async (_req: Request, res: Response) => {
  try {
    res.json(await createIProovClaim())
  } catch (error: any) {
    console.error('[issuer] iProov enrol token error', error)
    res.status(502).json({
      error: 'iproov_claim_failed',
      message: error?.message || 'Unable to create iProov enrol token'
    })
  }
})

app.post('/iproov/mobile/claim', async (req: Request, res: Response) => {
  try {
    const body = z
      .object({
        callback_url: z.string()
      })
      .parse(req.body || {})

    const callbackUrl = parseIProovMobileCallbackUrl(body.callback_url)
    const claim = await createIProovClaim()

    return res.json({
      ...claim,
      callbackUrl,
      launchUrl: buildIProovMobileLaunchUrl({
        issuerBaseUrl: BASE_URL,
        callbackUrl,
        session: claim.session
      }),
      note: 'Open launchUrl in the wallet browser flow, complete iProov, then resume presentation after the callback returns.'
    })
  } catch (error: any) {
    const message = error?.message || 'Unable to prepare the mobile iProov launch URL'
    const status = message.includes('callback_url') ? 400 : 502
    if (status >= 500) {
      console.error('[issuer] iProov mobile claim error', error)
    }
    return res.status(status).json({
      error: status === 400 ? 'invalid_callback_url' : 'iproov_mobile_claim_failed',
      message
    })
  }
})

app.get('/iproov/mobile/start', (req: Request, res: Response) => {
  try {
    const callbackUrl = parseIProovMobileCallbackUrl(req.query.callback_url)
    const session = String(req.query.session || '').trim()
    if (!session) {
      return res.status(400).send('Missing session')
    }

    const sessionState = iproovSessions.get(session)
    if (!sessionState) {
      return res.status(404).send('Unknown iProov session')
    }

    const html = renderIProovMobilePage({
      session,
      callbackUrl,
      validateUrl: `${BASE_URL}/iproov/validate`,
      webhookUrl: `${BASE_URL}/iproov/webhook`,
      sdkScriptUrl: IPROOV.sdkScriptUrl,
      ceremonyBaseUrl: IPROOV.ceremonyBaseUrl,
      token: sessionState.token,
      mode: sessionState.mode
    })

    return res.setHeader('content-type', 'text/html; charset=utf-8').status(200).send(html)
  } catch (error: any) {
    return res.status(400).send(error?.message || 'Unable to start the mobile iProov ceremony')
  }
})

app.get('/iproov/session/:session', (req: Request, res: Response) => {
  const { session } = req.params
  const sessionState = iproovSessions.get(session)
  if (!sessionState) {
    return res.status(404).json({ error: 'unknown_session' })
  }

  return res.json({
    ok: true,
    session,
    passed: sessionState.passed,
    mode: sessionState.mode,
    validatedAt: sessionState.validatedAt,
    reason: sessionState.failureReason,
    signals: sessionState.signals
  })
})

app.post('/iproov/validate', async (req: Request, res: Response) => {
  const body = z
    .object({
      session: z.string()
    })
    .parse(req.body || {})

  const sessionState = iproovSessions.get(body.session)
  if (!sessionState) {
    return res.status(404).json({ error: 'unknown_session' })
  }
  if (sessionState.mode !== 'real' || !sessionState.token) {
    return res.status(400).json({ error: 'not_real_ceremony', message: 'This session is using demo-mode liveness.' })
  }

  try {
    const validation = await validateEnrolToken(IPROOV, {
      userId: sessionState.userId,
      token: sessionState.token,
      ip: '127.0.0.1'
    })
    const passed = Boolean(validation.passed)
    sessionState.passed = passed
    sessionState.validatedAt = new Date().toISOString()
    sessionState.failureReason = validation.reason || null
    sessionState.signals = validation.signals || null
    iproovSessions.set(body.session, sessionState)

    return res.status(passed ? 200 : 403).json({
      ok: passed,
      passed,
      mode: 'real',
      validatedAt: sessionState.validatedAt,
      reason: sessionState.failureReason,
      assuranceType: validation.assuranceType,
      type: validation.type,
      signals: validation.signals || null
    })
  } catch (error: any) {
    sessionState.passed = false
    sessionState.validatedAt = new Date().toISOString()
    sessionState.failureReason = error?.message || 'iProov validation failed'
    sessionState.signals = null
    iproovSessions.set(body.session, sessionState)
    console.error('[issuer] iProov validate error', error)
    return res.status(502).json({
      error: 'iproov_validate_failed',
      message: sessionState.failureReason
    })
  }
})

app.post('/iproov/webhook', (req: Request, res: Response) => {
  const { session, signals } = req.body || {}
  if (!session) return res.status(400).json({ error: 'missing_session' })
  const current = iproovSessions.get(session)
  const passed = Boolean(signals?.matching?.passed)
  iproovSessions.set(session, {
    passed,
    mode: current?.mode || 'demo',
    userId: current?.userId || session,
    token: current?.token || null,
    validatedAt: new Date().toISOString(),
    failureReason: passed ? null : 'Webhook reported failed liveness',
    signals: signals && typeof signals === 'object' ? signals : null
  })
  res.json({ ok: true, passed })
})

app.listen(PORT, () => {
  console.log(
    `[issuer] listening on ${BASE_URL} (Lab 05: OHTTP ${
      USE_OHTTP && OHTTP_RELAY_URL ? `on via ${OHTTP_RELAY_URL}` : 'off'
    }, iProov ${IPROOV.realCeremonyEnabled ? 'real ceremony enabled' : 'demo gate enabled'}, revocation on)`
  )
})

// --- helpers ---

async function createIProovClaim() {
  const session = crypto.randomUUID()

  if (IPROOV.realCeremonyEnabled) {
    const tokenResponse = await requestEnrolToken(IPROOV, { userId: session })
    iproovSessions.set(session, {
      passed: false,
      mode: 'real',
      userId: session,
      token: tokenResponse.token,
      validatedAt: null,
      failureReason: null,
      signals: null
    })
    return {
      session,
      mode: 'real' as const,
      token: tokenResponse.token,
      streamingURL: IPROOV.streamingUrl,
      baseUrl: IPROOV.ceremonyBaseUrl,
      sdkScriptUrl: IPROOV.sdkScriptUrl,
      note: 'Launch the iProov SDK or web SDK, then call /iproov/validate before the BBS+ disclosure is verified.'
    }
  }

  iproovSessions.set(session, {
    passed: false,
    mode: 'demo',
    userId: session,
    token: null,
    validatedAt: null,
    failureReason: null,
    signals: null
  })
  return {
    session,
    mode: 'demo' as const,
    token: IPROOV.passToken,
    streamingURL: `${IPROOV.passToken}:${session}`,
    note: 'In demo mode, the webhook must mark this session as passed before BBS+ disclosure verification.'
  }
}

async function issueSdJwt(
  subject: string,
  claims: Record<string, any>,
  credentialStatus: { statusListIndex: number; statusListCredential: string },
  vct: string
) {
  const disclosures = Object.entries(claims).map(([name, value]) => createDisclosure(name, value))
  const payload = await createSdJwtPayload({
    subject,
    disclosures,
    vct,
    credentialStatus
  })
  const sdJwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', typ: 'vc+sd-jwt' })
    .setIssuer(BASE_URL)
    .setAudience(BASE_URL)
    .setIssuedAt()
    .setExpirationTime('15m')
    .setSubject(subject)
    .sign(issuerKeys.privateKey)
  const combined = [sdJwt, ...disclosures].join('~')
  return { sdJwt, disclosures, combined, payload }
}

async function issueBbsCredential(
  subject: string,
  claims: Record<string, any>,
  credentialStatus: { statusListIndex: number; statusListCredential: string }
) {
  const messages = [subject, `age_over:${claims.age_over}`, `residency:${claims.residency}`, `status:${credentialStatus.statusListIndex}`]
  const signature = await signMessages(messages, bbsKeys.secretKey, bbsKeys.publicKey)
  return {
    credential: { subject, claims, credentialStatus },
    signature: bytesToBase64(signature),
    messages,
    nonce: 'bbs-demo-nonce'
  }
}

async function loadStatusList(): Promise<StatusListState> {
  await fs.mkdir(STATUS_LIST_DIR, { recursive: true })
  let data: any
  try {
    const raw = await fs.readFile(STATUS_LIST_PATH, 'utf8')
    data = JSON.parse(raw)
  } catch (_err) {
    const bytesLen = Math.ceil(STATUS_LIST_SIZE_BITS / 8)
    data = {
      statusPurpose: 'revocation',
      bitstringLength: STATUS_LIST_SIZE_BITS,
      encodedList: Buffer.alloc(bytesLen).toString('base64')
    }
    await fs.writeFile(STATUS_LIST_PATH, JSON.stringify(data, null, 2))
  }
  const buffer = Buffer.from(data.encodedList, 'base64')
  const nextIndex = findNextAvailableIndex(buffer, Number(data.bitstringLength || buffer.length * 8))
  return {
    id: STATUS_LIST_ID,
    filePath: STATUS_LIST_PATH,
    buffer,
    bitstringLength: Number(data.bitstringLength || buffer.length * 8),
    nextIndex
  }
}

async function persistStatusList(state: StatusListState) {
  const payload = {
    statusPurpose: 'revocation',
    bitstringLength: state.bitstringLength,
    encodedList: state.buffer.toString('base64')
  }
  await fs.writeFile(state.filePath, JSON.stringify(payload, null, 2))
}

async function allocateStatusIndex() {
  const nextIndex = findNextAvailableIndex(statusList.buffer, statusList.bitstringLength)
  if (nextIndex >= statusList.bitstringLength) throw new Error('status_list_full')
  statusList.nextIndex = nextIndex + 1
  return nextIndex
}

async function setStatusBit(index: number, revoked: boolean) {
  const byteIndex = Math.floor(index / 8)
  const bitOffset = index % 8
  if (byteIndex >= statusList.buffer.length) {
    throw new Error('status_index_out_of_range')
  }
  const mask = 1 << bitOffset
  const current = (statusList.buffer[byteIndex] & mask) > 0
  if (revoked === current) return
  if (revoked) {
    statusList.buffer[byteIndex] |= mask
  } else {
    statusList.buffer[byteIndex] &= ~mask
  }
  await persistStatusList(statusList)
}

function findNextAvailableIndex(buf: Buffer, bitLength: number) {
  for (let i = 0; i < bitLength; i++) {
    const byteIndex = Math.floor(i / 8)
    const bitOffset = i % 8
    const isSet = (buf[byteIndex] & (1 << bitOffset)) > 0
    if (!isSet) return i
  }
  return bitLength
}

function createDisclosure(name: string, value: any): string {
  // Per SD-JWT, each disclosure is [salt, claimName, claimValue] base64url encoded.
  const salt = crypto.randomBytes(8).toString('hex')
  const disclosure = [salt, name, value]
  return Buffer.from(JSON.stringify(disclosure)).toString('base64url')
}

function hashDisclosure(disclosure: string) {
  return createHash('sha256').update(disclosure).digest('base64url')
}

async function createSdJwtPayload({
  subject,
  disclosures,
  vct,
  credentialStatus
}: {
  subject: string
  disclosures: string[]
  vct: string
  credentialStatus: { statusListIndex: number; statusListCredential: string }
}) {
  const thumbprint = await calculateJwkThumbprint(await exportJWK(issuerKeys.publicKey))
  return {
    iss: BASE_URL,
    sub: subject,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 15 * 60,
    vct,
    _sd: disclosures.map((d) => hashDisclosure(d)),
    cnf: { jwk: { ...issuerKeys.publicJwk, alg: 'ES256', kid: thumbprint } },
    credentialStatus
  }
}

async function createIssuerKeys() {
  // Generates an ES256 keypair for signing SD-JWTs. Keeps public JWK handy for metadata.
  const keyId = 'issuer-es256'
  const jwkFromEnv = process.env.JWKS_JSON ? JSON.parse(process.env.JWKS_JSON) : null
  if (jwkFromEnv?.keys?.length) {
    const publicJwk = jwkFromEnv.keys[0]
    const privateKey = await importJWK(jwkFromEnv.privateKey || jwkFromEnv.keys[0], 'ES256')
    const publicKey = await importJWK(publicJwk, 'ES256')
    return { publicJwk, publicKey, privateKey }
  }
  const { publicKey, privateKey } = await generateKeyPair('ES256')
  const publicJwk = await exportJWK(publicKey)
  ;(publicJwk as any).kid = keyId
  return { publicKey, privateKey, publicJwk }
}

// Debug endpoint (optional) to list issued creds
app.get('/debug/issued', (_req: Request, res: Response) => {
  if (!DEMO_MODE && (!ADMIN_TOKEN || _req.header('x-admin-token') !== ADMIN_TOKEN)) {
    return res.status(404).json({ error: 'not_found' })
  }
  res.json({ issued, count: Object.keys(issued).length })
})
