import assert from 'node:assert/strict'
import test from 'node:test'
import { buildVpRequest } from '../src/vp-request.ts'

test('buildVpRequest asks for age_over >= 21 and nationality', () => {
  const request = buildVpRequest('https://verifier.ipid.me', 'nonce-123')

  assert.equal(request.response_type, 'vp_token')
  assert.equal(request.response_mode, 'direct_post')
  assert.equal(request.client_id, 'https://verifier.ipid.me')
  assert.equal(request.nonce, 'nonce-123')
  assert.equal(request.presentation_definition.id, 'over-21-and-nationality')
  assert.equal(request.presentation_definition.input_descriptors.length, 2)

  const ageDescriptor = request.presentation_definition.input_descriptors.find((descriptor) => descriptor.id === 'age-over-21')
  assert.ok(ageDescriptor)
  assert.deepEqual(ageDescriptor.constraints.fields[0].path, [
    '$.vc.credentialSubject.age_over',
    '$.credentialSubject.age_over',
    '$.age_over'
  ])
  assert.deepEqual(ageDescriptor.constraints.fields[0].filter, {
    type: 'number',
    minimum: 21
  })

  const nationalityDescriptor = request.presentation_definition.input_descriptors.find((descriptor) => descriptor.id === 'nationality')
  assert.ok(nationalityDescriptor)
  assert.deepEqual(nationalityDescriptor.constraints.fields[0].path, [
    '$.vc.credentialSubject.nationality',
    '$.credentialSubject.nationality',
    '$.nationality',
    '$.vc.credentialSubject.residency',
    '$.credentialSubject.residency',
    '$.residency'
  ])
  assert.deepEqual(nationalityDescriptor.constraints.fields[0].filter, {
    type: 'string',
    minLength: 2
  })
})
