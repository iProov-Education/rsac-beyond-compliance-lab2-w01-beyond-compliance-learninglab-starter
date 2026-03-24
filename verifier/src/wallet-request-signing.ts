import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SignJWT, importPKCS8, type KeyLike } from 'jose'
import selfsigned from 'selfsigned'

const WALLET_REQUEST_ALG = 'ES256'
const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_CERT_FILE = resolve(MODULE_DIR, '../.wallet-request-cert.pem')
const DEFAULT_KEY_FILE = resolve(MODULE_DIR, '../.wallet-request-key.pem')

export type WalletRequestSigner = {
  alg: typeof WALLET_REQUEST_ALG
  privateKey: KeyLike
  kid: string
  x5c: [string, ...string[]]
}

export async function createWalletRequestSigner(baseUrl: string): Promise<WalletRequestSigner> {
  const { hostname } = new URL(baseUrl)
  const certificate = await loadOrGenerateWalletRequestCertificate(hostname)

  const x5cValue = pemCertificateToBase64Der(certificate.cert)
  const thumbprint = createHash('sha256').update(Buffer.from(x5cValue, 'base64')).digest('base64url')

  return {
    alg: WALLET_REQUEST_ALG,
    privateKey: await importPKCS8(certificate.private, WALLET_REQUEST_ALG),
    kid: `wallet-request-${thumbprint.slice(0, 16)}`,
    x5c: [x5cValue]
  }
}

export async function signWalletRequestObject(
  payload: Record<string, unknown>,
  signer: WalletRequestSigner,
  audience: string
) {
  return await new SignJWT(payload)
    .setProtectedHeader({
      alg: signer.alg,
      typ: 'oauth-authz-req+jwt',
      kid: signer.kid,
      x5c: signer.x5c
    })
    .setIssuer(String(payload.client_id || ''))
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(signer.privateKey)
}

async function loadOrGenerateWalletRequestCertificate(hostname: string) {
  const persisted = await loadPersistedWalletRequestCertificate()
  if (persisted) return persisted

  return await selfsigned.generate(
    [{ name: 'commonName', value: hostname }],
    {
      keyType: 'ec',
      curve: 'P-256',
      algorithm: 'sha256',
      extensions: [
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true },
        { name: 'extKeyUsage', clientAuth: true, serverAuth: true },
        {
          name: 'subjectAltName',
          altNames: [buildSubjectAltName(hostname)]
        }
      ]
    }
  )
}

async function loadPersistedWalletRequestCertificate() {
  const certFile = process.env.WALLET_REQUEST_CERT_FILE || DEFAULT_CERT_FILE
  const keyFile = process.env.WALLET_REQUEST_KEY_FILE || DEFAULT_KEY_FILE

  if (!existsSync(certFile) || !existsSync(keyFile)) return null

  return {
    cert: await readFile(certFile, 'utf8'),
    private: await readFile(keyFile, 'utf8')
  }
}

function buildSubjectAltName(hostname: string) {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':')) {
    return { type: 7 as const, ip: hostname }
  }
  return { type: 2 as const, value: hostname }
}

function pemCertificateToBase64Der(pem: string) {
  return pem.replace(/-----BEGIN CERTIFICATE-----/g, '').replace(/-----END CERTIFICATE-----/g, '').replace(/\s+/g, '')
}
