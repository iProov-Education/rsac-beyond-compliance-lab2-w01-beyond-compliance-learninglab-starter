export type PresentationField = {
  path: string[]
  filter?: Record<string, unknown>
}

export type PresentationInputDescriptor = {
  id: string
  name: string
  purpose: string
  constraints: {
    limit_disclosure: 'required'
    fields: PresentationField[]
  }
}

export type VpRequest = {
  response_type: 'vp_token'
  response_mode: 'direct_post'
  client_id: string
  nonce: string
  presentation_definition: {
    id: string
    name: string
    purpose: string
    input_descriptors: PresentationInputDescriptor[]
  }
}

const AGE_OVER_PATHS = [
  '$.vc.credentialSubject.age_over',
  '$.credentialSubject.age_over',
  '$.age_over'
]

const NATIONALITY_PATHS = [
  '$.vc.credentialSubject.nationality',
  '$.credentialSubject.nationality',
  '$.nationality',
  '$.vc.credentialSubject.residency',
  '$.credentialSubject.residency',
  '$.residency'
]

export function buildVpRequest(baseUrl: string, nonce: string): VpRequest {
  return {
    response_type: 'vp_token',
    response_mode: 'direct_post',
    client_id: baseUrl,
    nonce,
    presentation_definition: {
      id: 'over-21-and-nationality',
      name: 'Over 21 and nationality',
      purpose: 'Request proof that the holder is over 21 and disclose nationality to the relying party.',
      input_descriptors: [
        {
          id: 'age-over-21',
          name: 'Age over 21',
          purpose: 'Prove that the holder is at least 21 years old.',
          constraints: {
            limit_disclosure: 'required',
            fields: [
              {
                path: AGE_OVER_PATHS,
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
          purpose: 'Disclose nationality for the relying party decision.',
          constraints: {
            limit_disclosure: 'required',
            fields: [
              {
                path: NATIONALITY_PATHS,
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
  }
}
