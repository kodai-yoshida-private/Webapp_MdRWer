import JSZip from 'jszip'
import { createNoteId } from './id'
import type { AppSettings, Folder, Note, SortDirection, SortField } from './types'

export function sortNotes(notes: Note[], field: SortField, direction: SortDirection) {
  const factor = direction === 'asc' ? 1 : -1
  return [...notes].sort((a, b) => {
    if (field === 'manual') return (a.order - b.order) * factor
    if (field === 'title') return a.title.localeCompare(b.title, 'ja', { numeric: true, sensitivity: 'base' }) * factor
    return (a[field] - b[field]) * factor
  })
}

export function sanitizePathPart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '_').replace(/^\.+|\.+$/g, '').trim() || 'untitled'
}

export type BackupData = {
  version: 2
  exportedAt: string
  notes: Note[]
  folders: Folder[]
  settings?: AppSettings
}

export function createBackupData(notes: Note[], folders: Folder[], settings: AppSettings): BackupData {
  return { version: 2, exportedAt: new Date().toISOString(), notes, folders, settings }
}

export async function createZipBackup(notes: Note[], folders: Folder[], settings: AppSettings) {
  const zip = new JSZip()
  zip.file('mdrwer-backup.json', JSON.stringify(createBackupData(notes, folders, settings), null, 2))
  const used = new Map<string, number>()
  notes.forEach(note => {
    const base = sanitizePathPart(note.title)
    const folder = note.folder ? `${sanitizePathPart(note.folder)}/` : 'Unfiled/'
    const key = `${folder}${base}`
    const count = used.get(key) || 0
    used.set(key, count + 1)
    zip.file(`notes/${folder}${base}${count ? `-${count + 1}` : ''}.md`, note.content)
  })
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

export async function readZipBackup(file: File) {
  const zip = await JSZip.loadAsync(file)
  const backupEntry = zip.file('mdrwer-backup.json')
  if (backupEntry) return JSON.parse(await backupEntry.async('string')) as BackupData

  const notes: Note[] = []
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || !/\.(md|markdown|txt)$/i.test(path)) continue
    const parts = path.split('/').filter(Boolean)
    const filename = parts.pop() || 'untitled.md'
    const now = Date.now()
    notes.push({
      id: createNoteId(),
      title: filename.replace(/\.(md|markdown|txt)$/i, ''),
      folder: parts.at(-1) === 'Unfiled' ? '' : parts.at(-1) || '',
      content: await entry.async('string'),
      createdAt: now,
      updatedAt: now,
      order: notes.length,
      favorite: false,
      tags: [],
      scrollTop: 0
    })
  }
  return { version: 2, exportedAt: new Date().toISOString(), notes, folders: [] } as BackupData
}
