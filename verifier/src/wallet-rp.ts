import { randomUUID } from 'node:crypto'
import QRCode from 'qrcode'

const SESSION_TTL_MS = 15 * 60_000
const QR_SIZE = 280
const EUDI_PID_SD_JWT_VCTS = ['urn:eudi:pid:1']
const EUDI_PID_MDOC_DOCTYPE = 'eu.europa.ec.eudi.pid.1'
const EUDI_PID_MDOC_NAMESPACE = EUDI_PID_MDOC_DOCTYPE
const X509_SAN_DNS_CLIENT_ID_SCHEME = 'x509_san_dns'
const PID_BIRTHDATE_CLAIMS = ['birthdate', 'birth_date'] as const
const PID_NATIONALITY_CLAIMS = ['nationalities', 'nationality'] as const

type WalletClaimQuery = {
  id: string
  path: string[]
}

type SdJwtWalletCredentialQuery = {
  id: string
  format: 'dc+sd-jwt'
  meta: { vct_values: string[] }
  claims: WalletClaimQuery[]
}

type MdocWalletCredentialQuery = {
  id: string
  format: 'mso_mdoc'
  meta: { doctype_value: string }
  claims: WalletClaimQuery[]
}

type WalletCredentialQuery = SdJwtWalletCredentialQuery | MdocWalletCredentialQuery

export type WalletVerifierProfile = {
  baseUrl: string
  clientId: string
  requestClientId: string
  legalName: string
}

export type WalletRpOutcome = {
  status: 'pending' | 'complete' | 'error'
  receivedAt?: string
  mode?: 'verified' | 'inspected'
  error?: string
  errorDescription?: string
  issuer?: string
  vct?: string
  claims?: Record<string, unknown>
  kbJwt?: Record<string, unknown> | null
  payload?: Record<string, unknown> | null
  presentationSubmission?: unknown
  raw?: Record<string, unknown>
  warning?: string
}

export type WalletRpSession = {
  id: string
  createdAt: string
  expiresAt: string
  state: string
  nonce: string
  clientId: string
  requestClientId: string
  legalName: string
  verifierApi: string
  requestUri: string
  responseUri: string
  resultUri: string
  deepLink: string
  outcome: WalletRpOutcome
}

export type WalletDirectPostBody = {
  vp_token?: unknown
  state?: string
  presentation_submission?: unknown
  error?: string
  error_description?: string
  [key: string]: unknown
}

export type WalletRequestObject = {
  client_id: string
  client_id_scheme: 'x509_san_dns'
  response_uri: string
  response_type: 'vp_token'
  response_mode: 'direct_post'
  nonce: string
  state: string
  dcql_query: {
    credentials: WalletCredentialQuery[]
    credential_sets: Array<{
      options: string[][]
      purpose?: string
    }>
  }
  client_metadata: {
    vp_formats_supported: {
      'dc+sd-jwt': {
        'sd-jwt_alg_values': string[]
        'kb-jwt_alg_values': string[]
      }
      'mso_mdoc': Record<string, never>
    }
  }
}

export type WalletClaimSummary = {
  claims: Record<string, unknown>
  over21Derived: boolean | null
}

export function deriveWalletVerifierProfile(baseUrl: string): WalletVerifierProfile {
  const url = new URL(baseUrl)
  return {
    baseUrl: url.origin,
    clientId: url.host,
    requestClientId: `${X509_SAN_DNS_CLIENT_ID_SCHEME}:${url.host}`,
    legalName: 'iProov Verifier'
  }
}

export function createWalletSession(baseUrl: string, now = Date.now()): WalletRpSession {
  const profile = deriveWalletVerifierProfile(baseUrl)
  const id = randomUUID()
  const state = randomUUID()
  const nonce = randomUUID()
  const requestUri = `${profile.baseUrl}/wallet/request.jwt/${id}`
  const responseUri = `${profile.baseUrl}/wallet/direct_post/${id}`
  const resultUri = `${profile.baseUrl}/wallet/session/${id}`
  return {
    id,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
    state,
    nonce,
    clientId: profile.clientId,
    requestClientId: profile.requestClientId,
    legalName: profile.legalName,
    verifierApi: profile.baseUrl,
    requestUri,
    responseUri,
    resultUri,
    deepLink: buildWalletDeepLink(profile.clientId, profile.requestClientId, requestUri),
    outcome: { status: 'pending' }
  }
}

export function buildWalletDeepLink(clientId: string, requestClientId: string, requestUri: string) {
  return `eudi-openid4vp://${clientId}?client_id=${encodeURIComponent(requestClientId)}&client_id_scheme=${encodeURIComponent(X509_SAN_DNS_CLIENT_ID_SCHEME)}&request_uri=${encodeURIComponent(requestUri)}`
}

export function buildWalletRequestObject(session: WalletRpSession, walletNonce?: string): WalletRequestObject & { wallet_nonce?: string } {
  return {
    client_id: session.requestClientId,
    client_id_scheme: X509_SAN_DNS_CLIENT_ID_SCHEME,
    response_uri: session.responseUri,
    response_type: 'vp_token',
    response_mode: 'direct_post',
    nonce: session.nonce,
    state: session.state,
    dcql_query: buildWalletDcqlQuery(),
    client_metadata: {
      vp_formats_supported: {
        'dc+sd-jwt': {
          'sd-jwt_alg_values': ['ES256'],
          'kb-jwt_alg_values': ['ES256']
        },
        'mso_mdoc': {}
      }
    },
    ...(walletNonce ? { wallet_nonce: walletNonce } : {})
  }
}

export function buildWalletDcqlQuery() {
  const pidBirthdateVariants: SdJwtWalletCredentialQuery[] = PID_BIRTHDATE_CLAIMS.flatMap((birthdateClaim) =>
    PID_NATIONALITY_CLAIMS.map((nationalityClaim) => ({
      id: `pid-${birthdateClaim}-and-${nationalityClaim}`,
      format: 'dc+sd-jwt' as const,
      meta: { vct_values: EUDI_PID_SD_JWT_VCTS },
      claims: [
        { id: birthdateClaim, path: [birthdateClaim] },
        { id: nationalityClaim, path: [nationalityClaim] }
      ]
    }))
  )

  const pidMdocVariants: WalletCredentialQuery[] = [
    {
      id: 'pid-mdoc-age-over-21-and-nationality',
      format: 'mso_mdoc',
      meta: { doctype_value: EUDI_PID_MDOC_DOCTYPE },
      claims: [
        { id: 'age_over_21', path: [EUDI_PID_MDOC_NAMESPACE, 'age_over_21'] },
        { id: 'nationality', path: [EUDI_PID_MDOC_NAMESPACE, 'nationality'] }
      ]
    },
    {
      id: 'pid-mdoc-birth_date-and-nationality',
      format: 'mso_mdoc',
      meta: { doctype_value: EUDI_PID_MDOC_DOCTYPE },
      claims: [
        { id: 'birth_date', path: [EUDI_PID_MDOC_NAMESPACE, 'birth_date'] },
        { id: 'nationality', path: [EUDI_PID_MDOC_NAMESPACE, 'nationality'] }
      ]
    }
  ]

  return {
    credentials: [
      {
        id: 'pid-age-over-21-and-nationality',
        format: 'dc+sd-jwt' as const,
        meta: { vct_values: EUDI_PID_SD_JWT_VCTS },
        claims: [
          { id: 'age_over_21', path: ['age_over_21'] },
          { id: 'nationality', path: ['nationality'] }
        ]
      },
      ...pidBirthdateVariants,
      ...pidMdocVariants
    ],
    credential_sets: [
      {
        options: [
          ['pid-age-over-21-and-nationality'],
          ...pidBirthdateVariants.map((credential) => [credential.id]),
          ...pidMdocVariants.map((credential) => [credential.id])
        ],
        purpose:
          'Accept either a PID SD-JWT VC or a PID mdoc. If the credential exposes birth date instead of age_over_21, the verifier derives the over-21 decision locally.'
      }
    ]
  }
}

export function summarizeWalletClaims(claims: Record<string, unknown>, now = new Date()): WalletClaimSummary {
  const normalized: Record<string, unknown> = { ...claims }
  const nationalityValues = normalizeNationalityClaim(
    claims.nationalities ?? claims.nationality
  )
  if (nationalityValues.length > 0) {
    normalized.nationalities = nationalityValues
    normalized.nationality = nationalityValues[0]
  }

  const birthdate = normalizeBirthdateClaim(claims.birthdate ?? claims.birth_date)
  if (birthdate) {
    normalized.birthdate = birthdate
  }

  const directAgeOver21 = normalizeBooleanClaim(claims.age_over_21)
  const derivedAgeOver21 =
    directAgeOver21 ?? (birthdate ? isAtLeast21(birthdate, now) : null)

  if (derivedAgeOver21 !== null) {
    normalized.age_over_21 = derivedAgeOver21
  }
  if (directAgeOver21 === null && birthdate) {
    normalized.age_over_21_source = 'derived_from_birthdate'
  }

  return {
    claims: normalized,
    over21Derived: directAgeOver21 === null ? derivedAgeOver21 : null
  }
}

export async function renderWalletQrSvg(content: string) {
  return QRCode.toString(content, {
    errorCorrectionLevel: 'M',
    margin: 1,
    type: 'svg',
    width: QR_SIZE
  })
}

export function normalizeWalletDirectPostBody(body: unknown): WalletDirectPostBody {
  if (!body || typeof body !== 'object') return {}
  const normalized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    normalized[key] = normalizeNestedValue(value)
  }
  return normalized as WalletDirectPostBody
}

export function extractPresentedCredentials(vpToken: unknown): string[] {
  if (!vpToken) return []
  if (typeof vpToken === 'string') return [vpToken]
  if (Array.isArray(vpToken)) {
    return vpToken.flatMap((item) => extractPresentedCredentials(item))
  }
  if (typeof vpToken === 'object') {
    const tokenRecord = vpToken as Record<string, unknown>
    if (typeof tokenRecord.credential === 'string') return [tokenRecord.credential]
    if (typeof tokenRecord.sd_jwt === 'string') return [tokenRecord.sd_jwt]
    return Object.values(tokenRecord).flatMap((item) => extractPresentedCredentials(item))
  }
  return []
}

export function renderWalletSessionPage(session: WalletRpSession, qrSvg: string) {
  const requestedClaims = [
    'PID (SD-JWT VC): age_over_21 + nationality, or birthdate/birth_date + nationality/nationalities',
    'PID (MSO mdoc): age_over_21 + nationality, or birth_date + nationality under the PID namespace'
  ]
  const statusCopy =
    session.outcome.status === 'pending'
      ? 'Waiting for the wallet to submit a presentation.'
      : session.outcome.status === 'error'
        ? 'The wallet sent an error or an invalid response.'
        : session.outcome.mode === 'verified'
          ? 'Presentation received and cryptographically verified.'
          : 'Presentation received and parsed, but only structural inspection was possible.'

  const autoRefresh =
    session.outcome.status === 'pending'
      ? '<meta http-equiv="refresh" content="5" />'
      : ''

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${autoRefresh}
  <title>Wallet RP Session</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #17212b;
      --muted: #667788;
      --line: #d8dee7;
      --paper: #f7f5ef;
      --accent: #c65d2e;
      --accent-soft: #fff3ec;
    }
    body {
      margin: 0;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(198,93,46,0.10), transparent 28rem),
        linear-gradient(180deg, #faf7f1, #f3efe8);
    }
    main {
      max-width: 1080px;
      margin: 0 auto;
      padding: 2rem 1.25rem 3rem;
    }
    h1, h2 {
      font-family: "IBM Plex Serif", Georgia, serif;
      margin: 0 0 0.75rem;
    }
    p, li {
      line-height: 1.5;
    }
    .hero, .card {
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.88);
      backdrop-filter: blur(10px);
      border-radius: 20px;
      box-shadow: 0 12px 30px rgba(23,33,43,0.07);
    }
    .hero {
      padding: 1.5rem;
      margin-bottom: 1rem;
    }
    .grid {
      display: grid;
      gap: 1rem;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    }
    .card {
      padding: 1.25rem;
    }
    .qr {
      display: inline-block;
      padding: 0.75rem;
      background: white;
      border-radius: 16px;
      border: 1px solid var(--line);
    }
    .pill {
      display: inline-block;
      padding: 0.35rem 0.7rem;
      border-radius: 999px;
      font-size: 0.9rem;
      font-weight: 600;
      background: var(--accent-soft);
      color: var(--accent);
      margin-bottom: 0.75rem;
    }
    code {
      background: #eef2f6;
      padding: 0.15rem 0.35rem;
      border-radius: 6px;
      word-break: break-all;
    }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      overflow-wrap: anywhere;
      background: #0d1620;
      color: #f3f8ff;
      padding: 1rem;
      border-radius: 14px;
      font-size: 0.9rem;
    }
    a {
      color: var(--accent);
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <span class="pill">Wallet RP Session</span>
      <h1>Scan This QR Code With The Wallet</h1>
      <p>${escapeHtml(statusCopy)}</p>
      <p>This verifier accepts either a PID SD-JWT VC or a PID mdoc and asks for proof that the holder is over 21 plus nationality. If the credential exposes birth date instead of <code>age_over_21</code>, the verifier derives the over-21 result locally after receiving the presentation.</p>
    </section>
    <section class="grid">
      <article class="card">
        <h2>Scan</h2>
        <div class="qr">${qrSvg}</div>
        <p><a href="${escapeHtml(session.deepLink)}">Open the wallet deep link directly</a></p>
        <p><strong>Request URI:</strong><br /><code>${escapeHtml(session.requestUri)}</code></p>
        <p><strong>Response URI:</strong><br /><code>${escapeHtml(session.responseUri)}</code></p>
      </article>
      <article class="card">
        <h2>Verifier Setup</h2>
        <p>If your wallet fork uses preregistered verifier settings, use these values:</p>
        <ul>
          <li><strong>Client ID:</strong> <code>${escapeHtml(session.clientId)}</code></li>
          <li><strong>Verifier API:</strong> <code>${escapeHtml(session.verifierApi)}</code></li>
          <li><strong>Legal Name:</strong> <code>${escapeHtml(session.legalName)}</code></li>
        </ul>
        <p><strong>Requested claims:</strong></p>
        <ul>${requestedClaims.map((claim) => `<li>${escapeHtml(claim)}</li>`).join('')}</ul>
      </article>
      <article class="card">
        <h2>Session</h2>
        <p><strong>Session ID:</strong> <code>${escapeHtml(session.id)}</code></p>
        <p><strong>State:</strong> <code>${escapeHtml(session.state)}</code></p>
        <p><strong>Nonce:</strong> <code>${escapeHtml(session.nonce)}</code></p>
        <p><strong>Created:</strong> <code>${escapeHtml(session.createdAt)}</code></p>
        <p><strong>Expires:</strong> <code>${escapeHtml(session.expiresAt)}</code></p>
      </article>
      <article class="card">
        <h2>Latest Result</h2>
        <pre>${escapeHtml(JSON.stringify(session.outcome, null, 2))}</pre>
      </article>
    </section>
  </main>
</body>
</html>`
}

function normalizeNestedValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeNestedValue(entry))
  }
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return value
  const looksJson =
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  if (!looksJson) return value
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeNationalityClaim(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return [value.trim()]
  }
  return []
}

function normalizeBirthdateClaim(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
  return trimmed
}

function normalizeBooleanClaim(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', 'yes', 'y', '1'].includes(normalized)) return true
    if (['false', 'no', 'n', '0'].includes(normalized)) return false
  }
  return null
}

function isAtLeast21(birthdate: string, now: Date) {
  const date = new Date(`${birthdate}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return null
  let years = now.getUTCFullYear() - date.getUTCFullYear()
  const monthDelta = now.getUTCMonth() - date.getUTCMonth()
  const dayDelta = now.getUTCDate() - date.getUTCDate()
  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    years -= 1
  }
  return years >= 21
}
