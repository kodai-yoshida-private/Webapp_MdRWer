import { describe, expect, it } from 'vitest'
import { driveNoteHash, mergeDriveSnapshots, type DriveNote, type DriveSnapshot } from './driveSync'

function note(content: string, updatedAt: number): DriveNote {
  return {
    id: 'note-1', title: 'ノート', content, folder: '', createdAt: 1, updatedAt,
    order: 0, favorite: false, tags: []
  }
}

function snapshot(notes: DriveNote[], tombstones: Record<string, number> = {}): DriveSnapshot {
  return { version: 1, notes, folders: [], tombstones: { notes: tombstones, folders: {} } }
}

describe('Google Drive synchronization', () => {
  it('keeps the newest note when only one side changed', () => {
    const merged = mergeDriveSnapshots(snapshot([note('local', 20)]), snapshot([note('remote', 10)]))
    expect(merged.snapshot.notes).toHaveLength(1)
    expect(merged.snapshot.notes[0].content).toBe('local')
    expect(merged.conflicts).toBe(0)
  })

  it('keeps a conflict copy when both devices edited the same note', () => {
    const base = note('base', 10)
    const local = note('local edit', 30)
    const remote = note('remote edit', 25)
    const merged = mergeDriveSnapshots(snapshot([local]), snapshot([remote]), { 'note-1': driveNoteHash(base) })
    expect(merged.conflicts).toBe(1)
    expect(merged.snapshot.notes.map(item => item.content)).toEqual(expect.arrayContaining(['local edit', 'remote edit']))
    expect(merged.snapshot.notes.some(item => item.title.includes('競合コピー'))).toBe(true)
  })

  it('propagates a deletion tombstone to another device', () => {
    const merged = mergeDriveSnapshots(snapshot([], { 'note-1': 30 }), snapshot([note('remote', 20)]))
    expect(merged.snapshot.notes).toHaveLength(0)
    expect(merged.snapshot.tombstones.notes['note-1']).toBe(30)
  })
})
