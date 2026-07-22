import { describe, expect, it } from 'vitest'
import { createNoteId } from './id'

describe('createNoteId', () => {
  it('uses randomUUID when the secure-context API exists', () => {
    expect(createNoteId({ randomUUID: () => 'secure-id' })).toBe('secure-id')
  })

  it('creates a UUID-compatible ID without randomUUID', () => {
    const id = createNoteId({ getRandomValues: array => { array.fill(7); return array } })
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('still creates an ID when Web Crypto is unavailable', () => {
    expect(createNoteId(null)).toMatch(/^[0-9a-f-]{36}$/)
  })
})
