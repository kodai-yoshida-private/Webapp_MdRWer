import { describe, expect, it } from 'vitest'
import { createBackupData, sanitizePathPart, sortNotes } from './phase2'
import { defaultSettings } from './settings'
import type { Note } from './types'

const note = (id: string, title: string, order: number, updatedAt: number): Note => ({
  id, title, order, updatedAt, createdAt: updatedAt, content: title, folder: '', favorite: false, tags: [], scrollTop: 0
})

describe('Phase 2 utilities', () => {
  const notes = [note('b', 'ノート10', 1, 20), note('a', 'ノート2', 0, 10)]

  it('sorts Japanese titles naturally', () => {
    expect(sortNotes(notes, 'title', 'asc').map(item => item.id)).toEqual(['a', 'b'])
  })

  it('sorts dates descending', () => {
    expect(sortNotes(notes, 'updatedAt', 'desc').map(item => item.id)).toEqual(['b', 'a'])
  })

  it('sanitizes export paths', () => {
    expect(sanitizePathPart('a/b:c')).toBe('a_b_c')
  })

  it('creates a versioned backup', () => {
    expect(createBackupData(notes, [], defaultSettings)).toMatchObject({ version: 2, notes })
  })
})
