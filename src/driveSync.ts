import type { Folder, Note } from './types'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const DRIVE_FILE_NAME = 'mdrwer-sync-v1.json'
const DRIVE_STATE_KEY = 'mdrwer-drive-sync-v1'
const GOOGLE_SCRIPT_ID = 'google-identity-services'

export type DriveNote = Omit<Note, 'scrollTop'>

export type DriveSnapshot = {
  version: 1
  notes: DriveNote[]
  folders: Folder[]
  tombstones: {
    notes: Record<string, number>
    folders: Record<string, number>
  }
}

type DriveLocalState = {
  connected: boolean
  fileId?: string
  tombstones: DriveSnapshot['tombstones']
  baseHashes: Record<string, string>
}

type GoogleTokenResponse = {
  access_token?: string
  error?: string
  error_description?: string
}

type GoogleTokenClient = {
  requestAccessToken(config?: { prompt?: string }): void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string
            scope: string
            callback(response: GoogleTokenResponse): void
            error_callback?(error: { type?: string }): void
          }): GoogleTokenClient
          revoke(token: string, done?: () => void): void
        }
      }
    }
  }
}

let accessToken = ''
let tokenClient: GoogleTokenClient | null = null

function emptyState(): DriveLocalState {
  return { connected: false, tombstones: { notes: {}, folders: {} }, baseHashes: {} }
}

function loadState(): DriveLocalState {
  try {
    const saved = JSON.parse(localStorage.getItem(DRIVE_STATE_KEY) || '{}') as Partial<DriveLocalState>
    return {
      connected: Boolean(saved.connected),
      fileId: saved.fileId,
      tombstones: {
        notes: saved.tombstones?.notes || {},
        folders: saved.tombstones?.folders || {}
      },
      baseHashes: saved.baseHashes || {}
    }
  } catch {
    return emptyState()
  }
}

function saveState(state: DriveLocalState) {
  localStorage.setItem(DRIVE_STATE_KEY, JSON.stringify(state))
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

export function driveNoteHash(note: DriveNote) {
  return fnv1a(JSON.stringify({
    title: note.title,
    content: note.content,
    folder: note.folder,
    favorite: note.favorite,
    tags: note.tags,
    order: note.order,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt
  }))
}

function snapshotSignature(snapshot: DriveSnapshot) {
  return JSON.stringify({
    notes: [...snapshot.notes].sort((a, b) => a.id.localeCompare(b.id)),
    folders: [...snapshot.folders].sort((a, b) => a.id.localeCompare(b.id)),
    tombstones: {
      notes: Object.entries(snapshot.tombstones.notes).sort(([a], [b]) => a.localeCompare(b)),
      folders: Object.entries(snapshot.tombstones.folders).sort(([a], [b]) => a.localeCompare(b))
    }
  })
}

function mergeTombstones(a: Record<string, number>, b: Record<string, number>) {
  const merged = { ...a }
  for (const [id, deletedAt] of Object.entries(b)) merged[id] = Math.max(merged[id] || 0, deletedAt)
  return merged
}

function conflictTitle(title: string, timestamp: number) {
  const date = new Intl.DateTimeFormat('ja', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(timestamp)
  return `${title}（競合コピー ${date}）`
}

export function mergeDriveSnapshots(local: DriveSnapshot, remote: DriveSnapshot, baseHashes: Record<string, string> = {}) {
  const noteTombstones = mergeTombstones(local.tombstones.notes, remote.tombstones.notes)
  const folderTombstones = mergeTombstones(local.tombstones.folders, remote.tombstones.folders)
  const localNotes = new Map(local.notes.map(note => [note.id, note]))
  const remoteNotes = new Map(remote.notes.map(note => [note.id, note]))
  const notes: DriveNote[] = []
  let conflicts = 0

  for (const id of new Set([...localNotes.keys(), ...remoteNotes.keys()])) {
    const localNote = localNotes.get(id)
    const remoteNote = remoteNotes.get(id)
    const newest = !localNote ? remoteNote : !remoteNote ? localNote : localNote.updatedAt >= remoteNote.updatedAt ? localNote : remoteNote
    if (!newest || (noteTombstones[id] || 0) >= newest.updatedAt) continue

    if (localNote && remoteNote && driveNoteHash(localNote) !== driveNoteHash(remoteNote)) {
      const baseHash = baseHashes[id]
      const editedOnBothDevices = Boolean(baseHash)
        && driveNoteHash(localNote) !== baseHash
        && driveNoteHash(remoteNote) !== baseHash
      if (editedOnBothDevices) {
        const loser = newest === localNote ? remoteNote : localNote
        const conflictTimestamp = Math.max(localNote.updatedAt, remoteNote.updatedAt)
        const conflictId = `${id}-conflict-${loser.updatedAt}`
        if (!localNotes.has(conflictId) && !remoteNotes.has(conflictId) && !notes.some(note => note.id === conflictId)) {
          notes.push({
            ...loser,
            id: conflictId,
            title: conflictTitle(loser.title, conflictTimestamp),
            createdAt: conflictTimestamp,
            updatedAt: conflictTimestamp + 1,
            order: Math.max(localNote.order, remoteNote.order) + 1
          })
          conflicts += 1
        }
      }
    }
    notes.push(newest)
  }

  const localFolders = new Map(local.folders.map(folder => [folder.id, folder]))
  const remoteFolders = new Map(remote.folders.map(folder => [folder.id, folder]))
  const folderCandidates: Folder[] = []
  for (const id of new Set([...localFolders.keys(), ...remoteFolders.keys()])) {
    const localFolder = localFolders.get(id)
    const remoteFolder = remoteFolders.get(id)
    const newest = !localFolder ? remoteFolder : !remoteFolder ? localFolder : localFolder.updatedAt >= remoteFolder.updatedAt ? localFolder : remoteFolder
    if (newest && (folderTombstones[id] || 0) < newest.updatedAt) folderCandidates.push(newest)
  }
  const foldersByName = new Map<string, Folder>()
  for (const folder of folderCandidates) {
    const duplicate = foldersByName.get(folder.name)
    if (!duplicate || folder.updatedAt > duplicate.updatedAt) {
      if (duplicate) folderTombstones[duplicate.id] = Math.max(folderTombstones[duplicate.id] || 0, folder.updatedAt)
      foldersByName.set(folder.name, folder)
    } else {
      folderTombstones[folder.id] = Math.max(folderTombstones[folder.id] || 0, duplicate.updatedAt)
    }
  }
  const folders = [...foldersByName.values()]

  return {
    snapshot: {
      version: 1 as const,
      notes: notes.sort((a, b) => a.order - b.order),
      folders: folders.sort((a, b) => a.order - b.order),
      tombstones: { notes: noteTombstones, folders: folderTombstones }
    },
    conflicts
  }
}

export function createDriveSnapshot(notes: Note[], folders: Folder[]): DriveSnapshot {
  const state = loadState()
  return {
    version: 1,
    notes: notes.map(({ scrollTop: _scrollTop, ...note }) => note),
    folders: folders.map(folder => ({ ...folder, updatedAt: folder.updatedAt || folder.createdAt })),
    tombstones: state.tombstones
  }
}

export function recordDriveDeletion(kind: 'notes' | 'folders', id: string, deletedAt = Date.now()) {
  const state = loadState()
  state.tombstones[kind][id] = Math.max(state.tombstones[kind][id] || 0, deletedAt)
  saveState(state)
}

export function isGoogleDriveConfigured() {
  return Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim())
}

export function wasGoogleDriveConnected() {
  return loadState().connected
}

function loadGoogleIdentity() {
  if (window.google?.accounts.oauth2) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null
    const script = existing || document.createElement('script')
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error('Googleの認証画面を読み込めませんでした')), { once: true })
    if (!existing) {
      script.id = GOOGLE_SCRIPT_ID
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
  })
}

export async function connectGoogleDrive() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()
  if (!clientId) throw new Error('Google DriveのクライアントIDが設定されていません')
  if (!navigator.onLine) throw new Error('オフラインです。通信を確認してください')
  await loadGoogleIdentity()

  await new Promise<void>((resolve, reject) => {
    tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: response => {
        if (!response.access_token) {
          reject(new Error(response.error_description || response.error || 'Google Driveへの接続がキャンセルされました'))
          return
        }
        accessToken = response.access_token
        const state = loadState()
        state.connected = true
        saveState(state)
        resolve()
      },
      error_callback: () => reject(new Error('Google Driveへの接続がキャンセルされました'))
    })
    tokenClient.requestAccessToken({ prompt: '' })
  })
}

export function disconnectGoogleDrive() {
  if (accessToken && window.google?.accounts.oauth2) window.google.accounts.oauth2.revoke(accessToken)
  accessToken = ''
  tokenClient = null
  const state = loadState()
  state.connected = false
  saveState(state)
}

async function driveFetch(url: string, init: RequestInit = {}) {
  if (!accessToken) throw new Error('Google Driveへ再接続してください')
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...init.headers }
  })
  if (response.status === 401) {
    accessToken = ''
    throw new Error('Google Driveの接続期限が切れました。再接続してください')
  }
  if (!response.ok) {
    let message = `Google Driveとの通信に失敗しました（${response.status}）`
    try {
      const body = await response.json() as { error?: { message?: string } }
      if (body.error?.message) message = body.error.message
    } catch { /* response was not JSON */ }
    throw new Error(message)
  }
  return response
}

type DriveFile = { id: string; name: string; modifiedTime?: string }

async function findDriveFile() {
  const query = encodeURIComponent(`name = '${DRIVE_FILE_NAME}' and trashed = false`)
  const fields = encodeURIComponent('files(id,name,modifiedTime)')
  const response = await driveFetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=${fields}&orderBy=modifiedTime%20desc&pageSize=10`)
  const body = await response.json() as { files?: DriveFile[] }
  return body.files?.[0]
}

async function downloadSnapshot(fileId: string) {
  const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`)
  const snapshot = await response.json() as Partial<DriveSnapshot>
  if (snapshot.version !== 1 || !Array.isArray(snapshot.notes) || !Array.isArray(snapshot.folders)) {
    throw new Error('Google Driveの同期データ形式を読み取れませんでした')
  }
  return {
    version: 1 as const,
    notes: snapshot.notes,
    folders: snapshot.folders.map(folder => ({ ...folder, updatedAt: folder.updatedAt || folder.createdAt })),
    tombstones: {
      notes: snapshot.tombstones?.notes || {},
      folders: snapshot.tombstones?.folders || {}
    }
  }
}

async function uploadSnapshot(snapshot: DriveSnapshot, fileId?: string) {
  const body = JSON.stringify(snapshot)
  if (fileId) {
    const response = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,modifiedTime`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body
    })
    return response.json() as Promise<DriveFile>
  }

  const metadata = JSON.stringify({
    name: DRIVE_FILE_NAME,
    parents: ['appDataFolder'],
    mimeType: 'application/json'
  })
  const boundary = `mdrwer_${Date.now().toString(36)}`
  const multipart = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${body}\r\n`,
    `--${boundary}--`
  ].join('')
  const response = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipart
  })
  return response.json() as Promise<DriveFile>
}

export async function syncWithGoogleDrive(local: DriveSnapshot) {
  if (!navigator.onLine) throw new Error('オフラインです。変更は端末内に保存されています')
  const state = loadState()
  const driveFile = await findDriveFile()
  const remote = driveFile ? await downloadSnapshot(driveFile.id) : null
  const result = remote ? mergeDriveSnapshots(local, remote, state.baseHashes) : { snapshot: local, conflicts: 0 }
  const needsUpload = !remote || snapshotSignature(result.snapshot) !== snapshotSignature(remote)
  const savedFile = needsUpload ? await uploadSnapshot(result.snapshot, driveFile?.id) : driveFile

  state.connected = true
  state.fileId = savedFile?.id || driveFile?.id
  state.tombstones = result.snapshot.tombstones
  state.baseHashes = Object.fromEntries(result.snapshot.notes.map(note => [note.id, driveNoteHash(note)]))
  saveState(state)
  return { snapshot: result.snapshot, conflicts: result.conflicts, uploaded: needsUpload }
}
