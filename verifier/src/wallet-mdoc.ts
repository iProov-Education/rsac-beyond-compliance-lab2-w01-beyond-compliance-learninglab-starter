import cbor from 'cbor'

const { decodeFirstSync, Tagged } = cbor

const EUDI_PID_MDOC_DOCTYPE = 'eu.europa.ec.eudi.pid.1'

export type MdocInspectionResult = {
  payload: Record<string, unknown>
  claims: Record<string, unknown>
  keyBinding: null
  warning: string
}

type MdocDocument = {
  docType?: unknown
  issuerSigned?: {
    nameSpaces?: Record<string, unknown>
  }
}

export function looksLikeMdocDeviceResponse(credential: string) {
  try {
    const response = decodeMdocDeviceResponse(credential)
    return Array.isArray(response.documents)
  } catch {
    return false
  }
}

export function inspectMdocCredential(credential: string): MdocInspectionResult {
  const response = decodeMdocDeviceResponse(credential)
  const documents = Array.isArray(response.documents) ? response.documents : []
  if (documents.length === 0) {
    throw new Error('mdoc_missing_documents')
  }

  const selectedDocument =
    documents.find((document) => document?.docType === EUDI_PID_MDOC_DOCTYPE) ?? documents[0]
  const docType =
    selectedDocument && typeof selectedDocument.docType === 'string'
      ? selectedDocument.docType
      : undefined

  return {
    payload: {
      format: 'mso_mdoc',
      docType,
      documentsCount: documents.length,
      namespaces: Object.keys(selectedDocument?.issuerSigned?.nameSpaces ?? {})
    },
    claims: extractMdocClaims(selectedDocument),
    keyBinding: null,
    warning: 'mdoc inspection only'
  }
}

function decodeMdocDeviceResponse(credential: string): { documents?: MdocDocument[] } {
  const decoded = decodeFirstSync(decodeBase64Url(credential))
  if (!decoded || typeof decoded !== 'object') {
    throw new Error('invalid_mdoc_device_response')
  }
  return decoded as { documents?: MdocDocument[] }
}

function extractMdocClaims(document?: MdocDocument) {
  const claims: Record<string, unknown> = {}
  const namespaces = document?.issuerSigned?.nameSpaces ?? {}
  for (const [namespace, entries] of Object.entries(namespaces)) {
    if (!Array.isArray(entries)) continue
    for (const entry of entries) {
      const decodedEntry = decodeIssuerSignedItem(entry)
      if (!decodedEntry || typeof decodedEntry !== 'object') continue
      const elementIdentifier =
        typeof decodedEntry.elementIdentifier === 'string'
          ? decodedEntry.elementIdentifier
          : undefined
      if (!elementIdentifier) continue
      const value = normalizeCborValue(decodedEntry.elementValue)
      claims[elementIdentifier] = value
      claims[`${namespace}.${elementIdentifier}`] = value
    }
  }
  return claims
}

function decodeIssuerSignedItem(item: unknown): Record<string, unknown> | null {
  if (item instanceof Tagged) {
    if (item.tag === 24 && Buffer.isBuffer(item.value)) {
      return decodeFirstSync(item.value) as Record<string, unknown>
    }
    return { tag: item.tag, value: normalizeCborValue(item.value) }
  }
  if (item && typeof item === 'object' && 'tag' in item && 'value' in item) {
    const tagged = item as { tag?: unknown; value?: unknown }
    if (tagged.tag === 24 && Buffer.isBuffer(tagged.value)) {
      return decodeFirstSync(tagged.value) as Record<string, unknown>
    }
  }
  if (Buffer.isBuffer(item)) {
    return decodeFirstSync(item) as Record<string, unknown>
  }
  return item && typeof item === 'object' ? (item as Record<string, unknown>) : null
}

function normalizeCborValue(value: unknown): unknown {
  if (value instanceof Tagged) {
    if (value.tag === 24 && Buffer.isBuffer(value.value)) {
      return normalizeCborValue(decodeFirstSync(value.value))
    }
    if (value.tag === 1004) {
      return typeof value.value === 'string' ? value.value : String(value.value)
    }
    return normalizeCborValue(value.value)
  }
  if (value && typeof value === 'object' && 'tag' in value && 'value' in value) {
    const tagged = value as { tag?: unknown; value?: unknown }
    if (tagged.tag === 24 && Buffer.isBuffer(tagged.value)) {
      return normalizeCborValue(decodeFirstSync(tagged.value))
    }
    if (tagged.tag === 1004) {
      return typeof tagged.value === 'string' ? tagged.value : String(tagged.value)
    }
    return normalizeCborValue(tagged.value)
  }
  if (Buffer.isBuffer(value)) {
    return value.toString('base64url')
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeCborValue(item))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, normalizeCborValue(entryValue)])
    )
  }
  return value
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4)
  return Buffer.from(padded, 'base64')
}
