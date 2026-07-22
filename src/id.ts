type CryptoSource = {
  randomUUID?: () => string
  getRandomValues?: (array: Uint8Array) => Uint8Array
}

let fallbackSequence = 0

/** Creates an ID on HTTPS, localhost, and plain-HTTP LAN preview URLs. */
export function createNoteId(source: CryptoSource | null | undefined = globalThis.crypto) {
  if (typeof source?.randomUUID === 'function') {
    return source.randomUUID.call(source)
  }

  const bytes = new Uint8Array(16)
  if (typeof source?.getRandomValues === 'function') {
    source.getRandomValues.call(source, bytes)
  } else {
    fallbackSequence += 1
    const seed = `${Date.now()}-${fallbackSequence}-${Math.random()}`
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = (seed.charCodeAt(index % seed.length) + index * 29) & 0xff
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}
