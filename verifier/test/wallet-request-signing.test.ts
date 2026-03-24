import assert from 'node:assert/strict'
import { X509Certificate } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { decodeProtectedHeader, importX509, jwtVerify } from 'jose'
import selfsigned from 'selfsigned'
import { buildWalletRequestObject, createWalletSession } from '../src/wallet-rp.ts'
import { createWalletRequestSigner, signWalletRequestObject } from '../src/wallet-request-signing.ts'

const WALLET_REQUEST_AUDIENCE = 'https://self-issued.me/v2'

test('wallet request signer embeds an x5c certificate for verifier.ipid.me', async () => {
  const signer = await createWalletRequestSigner('https://verifier.ipid.me')
  const session = createWalletSession('https://verifier.ipid.me')
  const jwt = await signWalletRequestObject(buildWalletRequestObject(session), signer, WALLET_REQUEST_AUDIENCE)
  const protectedHeader = decodeProtectedHeader(jwt)

  assert.equal(protectedHeader.alg, 'ES256')
  assert.equal(protectedHeader.typ, 'oauth-authz-req+jwt')
  assert.ok(Array.isArray(protectedHeader.x5c))
  assert.equal(protectedHeader.x5c.length, 1)

  const pem = toPemCertificate(protectedHeader.x5c[0] as string)
  const certificate = new X509Certificate(pem)
  assert.match(certificate.subject, /CN=verifier\.ipid\.me/)

  const verified = await jwtVerify(jwt, await importX509(pem, 'ES256'), {
    issuer: 'x509_san_dns:verifier.ipid.me',
    audience: WALLET_REQUEST_AUDIENCE
  })

  assert.equal(verified.payload.client_id, 'x509_san_dns:verifier.ipid.me')
  assert.equal(verified.payload.client_id_scheme, 'x509_san_dns')
  assert.equal(verified.payload.response_mode, 'direct_post')
})

test('wallet request signer loads a persisted certificate when configured', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wallet-request-signer-'))
  const certFile = join(directory, 'wallet-request-cert.pem')
  const keyFile = join(directory, 'wallet-request-key.pem')
  const previousCertFile = process.env.WALLET_REQUEST_CERT_FILE
  const previousKeyFile = process.env.WALLET_REQUEST_KEY_FILE

  try {
    const certificate = await selfsigned.generate(
      [{ name: 'commonName', value: 'verifier.ipid.me' }],
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
            altNames: [{ type: 2 as const, value: 'verifier.ipid.me' }]
          }
        ]
      }
    )

    await writeFile(certFile, certificate.cert, 'utf8')
    await writeFile(keyFile, certificate.private, 'utf8')
    process.env.WALLET_REQUEST_CERT_FILE = certFile
    process.env.WALLET_REQUEST_KEY_FILE = keyFile

    const signer = await createWalletRequestSigner('https://verifier.ipid.me')
    const expectedX5c = certificate.cert
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s+/g, '')

    assert.deepEqual(signer.x5c, [expectedX5c])
  } finally {
    if (previousCertFile) process.env.WALLET_REQUEST_CERT_FILE = previousCertFile
    else delete process.env.WALLET_REQUEST_CERT_FILE
    if (previousKeyFile) process.env.WALLET_REQUEST_KEY_FILE = previousKeyFile
    else delete process.env.WALLET_REQUEST_KEY_FILE
    await rm(directory, { recursive: true, force: true })
  }
})

function toPemCertificate(base64Der: string) {
  const wrapped = base64Der.match(/.{1,64}/g)?.join('\n') || base64Der
  return `-----BEGIN CERTIFICATE-----\n${wrapped}\n-----END CERTIFICATE-----\n`
}
