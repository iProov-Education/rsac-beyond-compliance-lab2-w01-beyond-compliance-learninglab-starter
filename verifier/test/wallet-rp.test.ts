import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildWalletRequestObject,
  createWalletSession,
  extractPresentedCredentials,
  normalizeWalletDirectPostBody,
  summarizeWalletClaims
} from '../src/wallet-rp.ts'

test('createWalletSession builds an x509 SAN DNS deep link for the public verifier', () => {
  const session = createWalletSession('https://verifier.ipid.me', Date.UTC(2026, 2, 23, 12, 0, 0))

  assert.equal(session.clientId, 'verifier.ipid.me')
  assert.equal(session.requestClientId, 'x509_san_dns:verifier.ipid.me')
  assert.equal(session.legalName, 'iProov Verifier')
  assert.match(session.requestUri, /^https:\/\/verifier\.ipid\.me\/wallet\/request\.jwt\//)
  assert.match(session.responseUri, /^https:\/\/verifier\.ipid\.me\/wallet\/direct_post\//)
  assert.match(session.resultUri, /^https:\/\/verifier\.ipid\.me\/wallet\/session\//)
  assert.match(
    session.deepLink,
    /^eudi-openid4vp:\/\/verifier\.ipid\.me\?client_id=x509_san_dns%3Averifier\.ipid\.me&client_id_scheme=x509_san_dns&request_uri=https%3A%2F%2Fverifier\.ipid\.me%2Fwallet%2Frequest\.jwt%2F/
  )
})

test('buildWalletRequestObject asks for supported PID SD-JWT and mdoc claim variants that prove over-21 plus nationality', () => {
  const session = createWalletSession('https://verifier.ipid.me')
  const request = buildWalletRequestObject(session)

  assert.equal(request.client_id, 'x509_san_dns:verifier.ipid.me')
  assert.equal(request.client_id_scheme, 'x509_san_dns')
  assert.equal(request.response_uri, session.responseUri)
  assert.equal(request.response_type, 'vp_token')
  assert.equal(request.response_mode, 'direct_post')
  assert.equal(request.nonce, session.nonce)
  assert.equal(request.state, session.state)
  assert.equal(request.dcql_query.credentials.length, 7)

  const primary = request.dcql_query.credentials.find((credential) => credential.id === 'pid-age-over-21-and-nationality')
  assert.ok(primary)
  assert.deepEqual(primary.meta.vct_values, ['urn:eudi:pid:1'])
  assert.deepEqual(primary.claims, [
    { id: 'age_over_21', path: ['age_over_21'] },
    { id: 'nationality', path: ['nationality'] }
  ])

  const birthdateVariant = request.dcql_query.credentials.find((credential) => credential.id === 'pid-birthdate-and-nationalities')
  assert.ok(birthdateVariant)
  assert.deepEqual(birthdateVariant.meta, { vct_values: ['urn:eudi:pid:1'] })
  assert.deepEqual(birthdateVariant.claims, [
    { id: 'birthdate', path: ['birthdate'] },
    { id: 'nationalities', path: ['nationalities'] }
  ])

  const mdocVariant = request.dcql_query.credentials.find((credential) => credential.id === 'pid-mdoc-birth_date-and-nationality')
  assert.ok(mdocVariant)
  assert.deepEqual(mdocVariant.meta, { doctype_value: 'eu.europa.ec.eudi.pid.1' })
  assert.deepEqual(mdocVariant.claims, [
    { id: 'birth_date', path: ['eu.europa.ec.eudi.pid.1', 'birth_date'] },
    { id: 'nationality', path: ['eu.europa.ec.eudi.pid.1', 'nationality'] }
  ])

  assert.deepEqual(request.dcql_query.credential_sets, [
    {
      options: [
        ['pid-age-over-21-and-nationality'],
        ['pid-birthdate-and-nationalities'],
        ['pid-birthdate-and-nationality'],
        ['pid-birth_date-and-nationalities'],
        ['pid-birth_date-and-nationality'],
        ['pid-mdoc-age-over-21-and-nationality'],
        ['pid-mdoc-birth_date-and-nationality']
      ],
      purpose:
        'Accept either a PID SD-JWT VC or a PID mdoc. If the credential exposes birth date instead of age_over_21, the verifier derives the over-21 decision locally.'
    }
  ])

  assert.deepEqual(request.client_metadata.vp_formats_supported['dc+sd-jwt'], {
    'sd-jwt_alg_values': ['ES256'],
    'kb-jwt_alg_values': ['ES256']
  })
  assert.deepEqual(request.client_metadata.vp_formats_supported.mso_mdoc, {})
})

test('summarizeWalletClaims derives over-21 from birthdate and normalizes nationalities', () => {
  const summary = summarizeWalletClaims(
    {
      birthdate: '1994-10-21',
      nationalities: ['SE']
    },
    new Date('2026-03-24T00:00:00Z')
  )

  assert.equal(summary.over21Derived, true)
  assert.deepEqual(summary.claims, {
    birthdate: '1994-10-21',
    nationalities: ['SE'],
    nationality: 'SE',
    age_over_21: true,
    age_over_21_source: 'derived_from_birthdate'
  })
})

test('normalizeWalletDirectPostBody parses JSON strings and extractPresentedCredentials flattens tokens', () => {
  const normalized = normalizeWalletDirectPostBody({
    vp_token: '{"pid-sd-jwt":["credential-one"],"pid-mdoc":["credential-two"]}',
    presentation_submission: '{"id":"submission-1"}',
    state: 'session-state'
  })

  assert.deepEqual(normalized.presentation_submission, { id: 'submission-1' })
  assert.deepEqual(extractPresentedCredentials(normalized.vp_token), ['credential-one', 'credential-two'])
  assert.deepEqual(
    extractPresentedCredentials([{ credential: 'credential-three' }, { sd_jwt: 'credential-four' }]),
    ['credential-three', 'credential-four']
  )
})
