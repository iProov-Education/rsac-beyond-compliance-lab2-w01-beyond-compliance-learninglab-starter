import assert from 'node:assert/strict'
import test from 'node:test'
import cbor from 'cbor'
import { inspectMdocCredential, looksLikeMdocDeviceResponse } from '../src/wallet-mdoc.ts'

const { Tagged, encode } = cbor

function createIssuerSignedItem(elementIdentifier: string, elementValue: unknown) {
  return new Tagged(
    24,
    encode({
      digestID: 1,
      random: Buffer.alloc(0),
      elementIdentifier,
      elementValue
    })
  )
}

function createMdocCredential() {
  return encode({
    version: '1.0',
    documents: [
      {
        docType: 'org.iso.18013.5.1.mDL',
        issuerSigned: {
          nameSpaces: {
            'org.iso.18013.5.1': [createIssuerSignedItem('family_name', 'DOE')]
          }
        }
      },
      {
        docType: 'eu.europa.ec.eudi.pid.1',
        issuerSigned: {
          nameSpaces: {
            'eu.europa.ec.eudi.pid.1': [
              createIssuerSignedItem('birth_date', new Tagged(1004, '1994-10-21')),
              createIssuerSignedItem('nationality', 'SE'),
              createIssuerSignedItem('age_over_21', true)
            ]
          }
        }
      }
    ]
  }).toString('base64url')
}

test('looksLikeMdocDeviceResponse detects a base64url DeviceResponse payload', () => {
  assert.equal(looksLikeMdocDeviceResponse(createMdocCredential()), true)
  assert.equal(looksLikeMdocDeviceResponse('not-a-device-response'), false)
})

test('inspectMdocCredential extracts PID claims from the issuerSigned namespace', () => {
  const result = inspectMdocCredential(createMdocCredential())

  assert.deepEqual(result.payload, {
    format: 'mso_mdoc',
    docType: 'eu.europa.ec.eudi.pid.1',
    documentsCount: 2,
    namespaces: ['eu.europa.ec.eudi.pid.1']
  })
  assert.equal(result.warning, 'mdoc inspection only')
  assert.equal(result.keyBinding, null)
  assert.deepEqual(result.claims, {
    birth_date: '1994-10-21',
    'eu.europa.ec.eudi.pid.1.birth_date': '1994-10-21',
    nationality: 'SE',
    'eu.europa.ec.eudi.pid.1.nationality': 'SE',
    age_over_21: true,
    'eu.europa.ec.eudi.pid.1.age_over_21': true
  })
})
