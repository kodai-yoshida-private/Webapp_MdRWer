import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive, ArrowDownUp, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Cloud,
  ChevronUp, Download, FileDown, FileUp, Folder, FolderCog, FolderInput,
  FolderPlus, Grid2X2, Heart, List, Menu, MoreHorizontal, Pencil, Plus, RefreshCw, Search,
  Settings as SettingsIcon, Sidebar, Star, Tag, Trash2, X
} from 'lucide-react'
import { db, ensureStarterNotes } from './db'
import { createNoteId } from './id'
import { excerpt, titleFromContent } from './markdown'
import { MarkdownView } from './MarkdownView'
import { createBackupData, createZipBackup, readZipBackup, sortNotes, type BackupData } from './phase2'
import {
  connectGoogleDrive, createDriveSnapshot, disconnectGoogleDrive, isGoogleDriveConfigured,
  recordDriveDeletion, syncWithGoogleDrive, wasGoogleDriveConnected, type DriveSnapshot
} from './driveSync'
import { defaultSettings, loadSettings, saveSettings } from './settings'
import type { AppSettings, Folder as NoteFolder, Note, ViewMode } from './types'

const SWIPE_RATIO = 1.25
const appIconUrl = `${import.meta.env.BASE_URL}icon-192-v3.png`
type DriveStatus = 'not-configured' | 'disconnected' | 'connecting' | 'syncing' | 'synced' | 'offline' | 'error'

function newNote(order: number): Note {
  const now = Date.now()
  return { id: createNoteId(), title: '無題のノート', content: '# 無題のノート\n\nここから書きはじめます。', folder: '', createdAt: now, updatedAt: now, order, favorite: false, tags: [], scrollTop: 0 }
}

function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = name; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function safeFilename(title: string) {
  return `${title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'note'}.md`
}

function driveDataSignature(notes: Array<Note | DriveSnapshot['notes'][number]>, folders: NoteFolder[]) {
  return JSON.stringify({
    notes: notes.map(note => ({
      id: note.id, title: note.title, content: note.content, folder: note.folder,
      createdAt: note.createdAt, updatedAt: note.updatedAt, order: note.order,
      favorite: note.favorite, tags: note.tags
    })).sort((a, b) => a.id.localeCompare(b.id)),
    folders: folders.map(folder => ({ ...folder })).sort((a, b) => a.id.localeCompare(b.id))
  })
}

export default function App() {
  const [notes, setNotes] = useState<Note[]>([])
  const [folders, setFolders] = useState<NoteFolder[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [mode, setMode] = useState<ViewMode>('read')
  const [mobileList, setMobileList] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedFolder, setSelectedFolder] = useState('all')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set(['はじめに']))
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [folderManagerOpen, setFolderManagerOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [folderDraft, setFolderDraft] = useState('')
  const [tagDraft, setTagDraft] = useState('')
  const [moveTargetId, setMoveTargetId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [driveStatus, setDriveStatus] = useState<DriveStatus>(() => isGoogleDriveConfigured() ? 'disconnected' : 'not-configured')
  const [driveMessage, setDriveMessage] = useState(() => wasGoogleDriveConnected() ? 'Google Driveへ再接続してください' : '未接続')
  const [lastDriveSync, setLastDriveSync] = useState<number | null>(null)
  const [ready, setReady] = useState(false)
  const [toast, setToast] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [noteMenuId, setNoteMenuId] = useState<string | null>(null)
  const [noteMenuPosition, setNoteMenuPosition] = useState({ x: 0, y: 0 })
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null)
  const readerRef = useRef<HTMLElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<number>()
  const driveTimer = useRef<number>()
  const driveSyncing = useRef(false)
  const lastDriveSignature = useRef('')
  const longPressTimer = useRef<number>()
  const longPressTriggered = useRef(false)
  const longPressStart = useRef<{ x: number; y: number } | null>(null)

  const reload = useCallback(async (preferId?: string) => {
    const [all, allFolders] = await Promise.all([
      db.notes.orderBy('order').toArray(),
      db.folders.orderBy('order').toArray()
    ])
    setNotes(all)
    setFolders(allFolders)
    setActiveId(current => preferId || (all.some(n => n.id === current) ? current : all[0]?.id || ''))
  }, [])

  useEffect(() => {
    ensureStarterNotes().then(() => reload()).finally(() => setReady(true))
  }, [reload])

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 180)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener?.('change', listener)
    return () => media.removeEventListener?.('change', listener)
  }, [])

  const active = notes.find(n => n.id === activeId)
  const noteMenu = notes.find(note => note.id === noteMenuId)
  const deleteTarget = notes.find(note => note.id === deleteTargetId)
  const moveTarget = notes.find(note => note.id === moveTargetId)
  const filteredNotes = useMemo(() => {
    const value = debouncedQuery.trim().toLocaleLowerCase('ja')
    const searched = value
      ? notes.filter(note => `${note.title} ${note.folder} ${(note.tags || []).join(' ')} ${note.content}`.toLocaleLowerCase('ja').includes(value.replace(/^#/, '')))
      : notes
    return sortNotes(searched, settings.sortField, settings.sortDirection)
  }, [notes, debouncedQuery, settings.sortDirection, settings.sortField])
  const navigationNotes = filteredNotes.length ? filteredNotes : notes
  const activeIndex = navigationNotes.findIndex(n => n.id === activeId)
  const effectiveDark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark)

  useEffect(() => {
    if (filteredNotes.length && !filteredNotes.some(note => note.id === activeId)) {
      setActiveId(filteredNotes[0].id)
      setMode('read')
    }
  }, [activeId, filteredNotes])

  const flash = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2200)
  }

  const applyDriveSnapshot = async (snapshot: DriveSnapshot) => {
    const currentNotes = await db.notes.toArray()
    const scrollPositions = new Map(currentNotes.map(note => [note.id, note.scrollTop || 0]))
    const syncedNotes: Note[] = snapshot.notes.map(note => ({ ...note, scrollTop: scrollPositions.get(note.id) || 0 }))
    const foldersByName = new Map<string, NoteFolder>()
    for (const folder of snapshot.folders) {
      const existing = foldersByName.get(folder.name)
      if (!existing || folder.updatedAt > existing.updatedAt) foldersByName.set(folder.name, folder)
    }
    const syncedFolders = [...foldersByName.values()].sort((a, b) => a.order - b.order)
    await db.transaction('rw', db.notes, db.folders, async () => {
      await Promise.all([db.notes.clear(), db.folders.clear()])
      if (syncedNotes.length) await db.notes.bulkPut(syncedNotes)
      if (syncedFolders.length) await db.folders.bulkPut(syncedFolders)
    })
    return { syncedNotes, syncedFolders }
  }

  const performDriveSync = async (notify = false) => {
    if (driveSyncing.current) return
    driveSyncing.current = true
    setDriveStatus(navigator.onLine ? 'syncing' : 'offline')
    setDriveMessage(navigator.onLine ? '同期しています…' : 'オフラインです')
    try {
      const [localNotes, localFolders] = await Promise.all([db.notes.toArray(), db.folders.toArray()])
      const result = await syncWithGoogleDrive(createDriveSnapshot(localNotes, localFolders))
      const applied = await applyDriveSnapshot(result.snapshot)
      lastDriveSignature.current = driveDataSignature(applied.syncedNotes, applied.syncedFolders)
      await reload(activeId)
      setDriveStatus('synced')
      setDriveMessage(result.conflicts ? `${result.conflicts}件の競合コピーを作成しました` : '同期済み')
      setLastDriveSync(Date.now())
      if (result.conflicts) flash(`${result.conflicts}件の競合コピーを残しました`)
      else if (notify) flash('Google Driveと同期しました')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google Driveと同期できませんでした'
      setDriveStatus(navigator.onLine ? 'error' : 'offline')
      setDriveMessage(message)
      if (notify) flash(message)
    } finally {
      driveSyncing.current = false
    }
  }

  const connectDrive = async () => {
    setDriveStatus('connecting')
    setDriveMessage('Googleアカウントを確認しています…')
    try {
      await connectGoogleDrive()
      await performDriveSync(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google Driveへ接続できませんでした'
      setDriveStatus(navigator.onLine ? 'error' : 'offline')
      setDriveMessage(message)
      flash(message)
    }
  }

  const disconnectDrive = () => {
    disconnectGoogleDrive()
    window.clearTimeout(driveTimer.current)
    setDriveStatus('disconnected')
    setDriveMessage('未接続')
    setLastDriveSync(null)
    flash('Google Driveとの接続を解除しました')
  }

  const driveChangeSignature = useMemo(() => driveDataSignature(notes, folders), [notes, folders])

  useEffect(() => {
    if (driveStatus !== 'synced' || driveChangeSignature === lastDriveSignature.current) return
    window.clearTimeout(driveTimer.current)
    driveTimer.current = window.setTimeout(() => void performDriveSync(false), 1600)
    return () => window.clearTimeout(driveTimer.current)
  }, [driveChangeSignature, driveStatus])

  useEffect(() => {
    const offline = () => {
      if (driveStatus === 'synced' || driveStatus === 'syncing') {
        setDriveStatus('offline')
        setDriveMessage('オフラインです。変更は端末内に保存されます')
      }
    }
    const online = () => {
      if (driveStatus === 'offline') {
        setDriveStatus('disconnected')
        setDriveMessage('Google Driveへ再接続してください')
      }
    }
    window.addEventListener('offline', offline)
    window.addEventListener('online', online)
    return () => {
      window.removeEventListener('offline', offline)
      window.removeEventListener('online', online)
    }
  }, [driveStatus])

  const updateSettings = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(current => ({ ...current, [key]: value }))
  }

  const selectNote = useCallback((id: string) => {
    const note = notes.find(item => item.id === id)
    setActiveId(id); setMode('read'); setMobileList(false); setMenuOpen(false)
    if (note?.folder) setSelectedFolder(note.folder)
  }, [notes])

  const toggleFolder = (name: string) => {
    setSelectedFolder(name)
    setExpandedFolders(current => {
      const next = new Set(current)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  useEffect(() => {
    if (mode === 'read' && active && readerRef.current) readerRef.current.scrollTop = active.scrollTop || 0
  }, [activeId, mode])

  useEffect(() => {
    setTagDraft((active?.tags || []).join(', '))
  }, [activeId, active?.tags])

  const updateActive = (changes: Partial<Note>, immediate = false) => {
    if (!active) return
    const updated = { ...active, ...changes, updatedAt: Date.now() }
    setNotes(current => current.map(note => note.id === active.id ? updated : note))
    setSaving(true)
    window.clearTimeout(saveTimer.current)
    const persist = async () => { await db.notes.put(updated); setSaving(false) }
    if (immediate) void persist()
    else saveTimer.current = window.setTimeout(persist, 420)
  }

  const commitTags = () => {
    if (!active) return
    const tags = [...new Set(tagDraft.split(/[,、\n]/).map(tag => tag.trim().replace(/^#/, '')).filter(Boolean))]
    setTagDraft(tags.join(', '))
    updateActive({ tags }, true)
  }

  const addNote = async () => {
    const note = newNote(notes.length)
    if (!['all', 'favorites', 'unfiled'].includes(selectedFolder)) note.folder = selectedFolder
    if (selectedFolder === 'favorites') note.favorite = true
    await db.notes.add(note)
    if (note.folder) setExpandedFolders(current => new Set(current).add(note.folder))
    await reload(note.id)
    setMode('edit'); setMobileList(false)
  }

  const toggleFavorite = async (note: Note) => {
    const favorite = !note.favorite
    const updatedAt = Date.now()
    setNotes(current => current.map(item => item.id === note.id ? { ...item, favorite, updatedAt } : item))
    await db.notes.update(note.id, { favorite, updatedAt })
  }

  const createFolder = async () => {
    const name = newFolderName.trim()
    if (!name) return
    if (folders.some(folder => folder.name.toLocaleLowerCase('ja') === name.toLocaleLowerCase('ja'))) {
      flash('同じ名前のフォルダがあります')
      return
    }
    const now = Date.now()
    await db.folders.add({ id: createNoteId(), name, order: folders.length, createdAt: now, updatedAt: now })
    setNewFolderName('')
    setSelectedFolder(name)
    setExpandedFolders(current => new Set(current).add(name))
    await reload()
  }

  const renameFolder = async (folder: NoteFolder) => {
    const name = folderDraft.trim()
    if (!name || name === folder.name) { setEditingFolderId(null); return }
    if (folders.some(item => item.id !== folder.id && item.name.toLocaleLowerCase('ja') === name.toLocaleLowerCase('ja'))) {
      flash('同じ名前のフォルダがあります')
      return
    }
    const updatedAt = Date.now()
    await db.transaction('rw', db.folders, db.notes, async () => {
      await db.folders.update(folder.id, { name, updatedAt })
      await db.notes.where('folder').equals(folder.name).modify({ folder: name, updatedAt })
    })
    if (selectedFolder === folder.name) setSelectedFolder(name)
    setExpandedFolders(current => {
      if (!current.has(folder.name)) return current
      const next = new Set(current); next.delete(folder.name); next.add(name); return next
    })
    setEditingFolderId(null)
    await reload()
  }

  const deleteFolder = async (folder: NoteFolder) => {
    if (!window.confirm(`「${folder.name}」を削除しますか？\n中のノートは「未分類」へ移動します。`)) return
    const deletedAt = Date.now()
    recordDriveDeletion('folders', folder.id, deletedAt)
    await db.transaction('rw', db.folders, db.notes, async () => {
      await db.notes.where('folder').equals(folder.name).modify({ folder: '', updatedAt: deletedAt })
      await db.folders.delete(folder.id)
    })
    if (selectedFolder === folder.name) setSelectedFolder('all')
    setExpandedFolders(current => { const next = new Set(current); next.delete(folder.name); return next })
    await reload()
    flash('フォルダを削除しました')
  }

  const moveNoteToFolder = async (folder: string) => {
    if (!moveTarget) return
    await db.notes.update(moveTarget.id, { folder, updatedAt: Date.now() })
    if (folder) setExpandedFolders(current => new Set(current).add(folder))
    setMoveTargetId(null)
    await reload(moveTarget.id)
    flash(folder ? `「${folder}」へ移動しました` : '未分類へ移動しました')
  }

  const reorderNote = async (note: Note, direction: -1 | 1) => {
    const ordered = [...notes].sort((a, b) => a.order - b.order)
    const index = ordered.findIndex(item => item.id === note.id)
    const target = ordered[index + direction]
    if (!target) return
    const currentOrder = note.order
    const updatedAt = Date.now()
    await db.transaction('rw', db.notes, async () => {
      await db.notes.update(note.id, { order: target.order, updatedAt })
      await db.notes.update(target.id, { order: currentOrder, updatedAt })
    })
    setNoteMenuId(null)
    await reload(note.id)
  }

  const openNoteMenu = (id: string, x: number, y: number) => {
    const menuWidth = Math.min(248, window.innerWidth - 16)
    const menuHeight = settings.sortField === 'manual' ? 355 : 265
    setNoteMenuPosition({
      x: Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8))
    })
    setNoteMenuId(id)
  }

  const beginLongPress = (id: string, event: React.PointerEvent) => {
    window.clearTimeout(longPressTimer.current)
    longPressTriggered.current = false
    longPressStart.current = { x: event.clientX, y: event.clientY }
    longPressTimer.current = window.setTimeout(() => {
      longPressTriggered.current = true
      if (longPressStart.current) openNoteMenu(id, longPressStart.current.x, longPressStart.current.y)
      navigator.vibrate?.(20)
    }, 550)
  }

  const cancelLongPress = () => {
    window.clearTimeout(longPressTimer.current)
    longPressStart.current = null
  }

  const moveLongPress = (event: React.PointerEvent) => {
    if (!longPressStart.current) return
    const distance = Math.hypot(event.clientX - longPressStart.current.x, event.clientY - longPressStart.current.y)
    if (distance > 10) cancelLongPress()
  }

  const selectAfterPress = (id: string) => {
    window.clearTimeout(longPressTimer.current)
    if (longPressTriggered.current) {
      longPressTriggered.current = false
      return
    }
    selectNote(id)
  }

  const deleteNote = async () => {
    if (!deleteTarget) return
    const deletedIndex = notes.findIndex(note => note.id === deleteTarget.id)
    recordDriveDeletion('notes', deleteTarget.id)
    await db.notes.delete(deleteTarget.id)
    const remaining = notes.filter(note => note.id !== deleteTarget.id)
    const reorderedAt = Date.now()
    await Promise.all(remaining.map((note, order) => db.notes.update(note.id, { order, updatedAt: reorderedAt })))
    const preferredId = activeId === deleteTarget.id
      ? remaining[Math.max(0, deletedIndex - 1)]?.id
      : activeId
    setDeleteTargetId(null); setNoteMenuId(null); setMenuOpen(false)
    if (activeId === deleteTarget.id) setMode('read')
    await reload(preferredId)
    flash('ノートを削除しました')
  }

  const moveNote = useCallback((direction: number) => {
    const next = activeIndex + direction
    if (next >= 0 && next < navigationNotes.length) selectNote(navigationNotes[next].id)
  }, [activeIndex, navigationNotes, selectNote])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (mode === 'edit' || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'ArrowLeft') moveNote(-1)
      if (event.key === 'ArrowRight') moveNote(1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mode, moveNote])

  const onTouchStart = (event: React.TouchEvent) => {
    if (mode !== 'read' || event.touches.length !== 1) return
    touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY, t: Date.now() }
  }

  const onTouchMove = (event: React.TouchEvent) => {
    if (!touchStart.current) return
    const dx = event.touches[0].clientX - touchStart.current.x
    const dy = event.touches[0].clientY - touchStart.current.y
    if (Math.abs(dx) > Math.abs(dy) * SWIPE_RATIO) setSwipeOffset(Math.max(-120, Math.min(120, dx * .55)))
  }

  const onTouchEnd = (event: React.TouchEvent) => {
    if (!touchStart.current) return
    const dx = event.changedTouches[0].clientX - touchStart.current.x
    const dy = event.changedTouches[0].clientY - touchStart.current.y
    const velocity = Math.abs(dx) / Math.max(1, Date.now() - touchStart.current.t)
    if (Math.abs(dx) > Math.abs(dy) * SWIPE_RATIO && (Math.abs(dx) > settings.swipeSensitivity || velocity > .55)) moveNote(dx < 0 ? 1 : -1)
    touchStart.current = null; setSwipeOffset(0)
  }

  const rememberScroll = () => {
    if (!active || !readerRef.current) return
    const top = readerRef.current.scrollTop
    setNotes(current => current.map(note => note.id === active.id ? { ...note, scrollTop: top } : note))
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => void db.notes.update(active.id, { scrollTop: top }), 180)
  }

  const exportNote = async () => {
    if (!active) return
    const file = new File([active.content], safeFilename(active.title), { type: 'text/markdown' })
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ title: active.title, files: [file] }); return } catch { /* cancelled */ }
    }
    saveFile(file, file.name); flash('Markdownを書き出しました')
  }

  const backupJson = () => {
    saveFile(new Blob([JSON.stringify(createBackupData(notes, folders, settings), null, 2)], { type: 'application/json' }), `mdrwer-backup-${new Date().toISOString().slice(0, 10)}.json`)
    flash('バックアップを保存しました')
  }

  const backupZip = async () => {
    const blob = await createZipBackup(notes, folders, settings)
    saveFile(blob, `mdrwer-backup-${new Date().toISOString().slice(0, 10)}.zip`)
    flash('ZIPバックアップを保存しました')
  }

  const restoreBackup = async (data: Partial<BackupData>) => {
    let added = 0
    const existingFolders = new Set(folders.map(folder => folder.name))
    let folderOrder = folders.length
    for (const folder of data.folders || []) {
      if (!folder.name || existingFolders.has(folder.name)) continue
      const now = Date.now()
      await db.folders.add({ ...folder, id: createNoteId(), order: folderOrder++, createdAt: folder.createdAt || now, updatedAt: now })
      existingFolders.add(folder.name)
    }
    for (const source of data.notes || []) {
      await db.notes.put({
        ...source,
        id: createNoteId(),
        order: notes.length + added++,
        createdAt: source.createdAt || Date.now(),
        updatedAt: Date.now(),
        favorite: Boolean(source.favorite),
        tags: source.tags || [],
        scrollTop: 0
      })
    }
    if (data.settings) setSettings({ ...settings, ...data.settings })
    return added
  }

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return
    let added = 0
    for (const file of Array.from(files)) {
      if (file.name.toLocaleLowerCase().endsWith('.zip')) {
        try {
          added += await restoreBackup(await readZipBackup(file))
        } catch { flash(`${file.name} を読み込めませんでした`) }
      } else if (file.name.toLocaleLowerCase().endsWith('.json')) {
        try {
          added += await restoreBackup(JSON.parse(await file.text()) as Partial<BackupData>)
        } catch { flash(`${file.name} を読み込めませんでした`) }
      } else if (/\.(md|markdown|txt)$/i.test(file.name)) {
        const text = await file.text()
        const note = newNote(notes.length + added++)
        note.content = text; note.title = titleFromContent(text, file.name.replace(/\.(md|markdown|txt)$/i, ''))
        if (selectedFolder !== 'all') note.folder = selectedFolder
        await db.notes.add(note)
      }
    }
    await reload(); flash(`${added}件のノートを読み込みました`)
    if (fileRef.current) fileRef.current.value = ''
  }

  const renderNoteCard = (note: Note) => {
    const index = filteredNotes.findIndex(item => item.id === note.id)
    return <div key={note.id} className={`note-card-shell ${note.id === activeId ? 'selected' : ''}`}>
      <button
        className={`note-card ${note.id === activeId ? 'selected' : ''}`}
        onClick={() => selectAfterPress(note.id)}
        onPointerDown={event => beginLongPress(note.id, event)}
        onPointerUp={cancelLongPress}
        onPointerMove={moveLongPress}
        onPointerLeave={cancelLongPress}
        onPointerCancel={cancelLongPress}
        onContextMenu={event => { event.preventDefault(); openNoteMenu(note.id, event.clientX, event.clientY) }}
      >
        <div className="note-card-top"><span className="note-number">{String(index + 1).padStart(2, '0')}</span></div>
        <strong>{note.title}</strong><p>{excerpt(note.content)}</p>
        <div className="note-meta"><span className="note-tags">{(note.tags || []).slice(0, 2).map(tag => <i key={tag}>#{tag}</i>)}</span><time>{new Intl.DateTimeFormat('ja', { month: 'short', day: 'numeric' }).format(note.updatedAt)}</time></div>
      </button>
      <button
        className={`note-favorite-button ${note.favorite ? 'active' : ''}`}
        onClick={() => void toggleFavorite(note)}
        aria-label={`${note.title}を${note.favorite ? 'お気に入りから外す' : 'お気に入りに追加'}`}
        aria-pressed={note.favorite}
      ><Heart size={16} fill={note.favorite ? 'currentColor' : 'none'} /></button>
    </div>
  }

  const notesByFolder = useMemo(() => {
    const grouped = new Map<string, Note[]>()
    filteredNotes.forEach(note => grouped.set(note.folder, [...(grouped.get(note.folder) || []), note]))
    return grouped
  }, [filteredNotes])
  const visibleFolders = debouncedQuery
    ? folders.filter(folder => filteredNotes.some(note => note.folder === folder.name))
    : folders
  const favoriteNotes = filteredNotes.filter(note => note.favorite)
  const unfiledNotes = notesByFolder.get('') || []

  if (!ready) return <div className="loading"><img className="brand-mark icon-image" src={appIconUrl} alt="" /><p>本棚をひらいています</p></div>

  return (
    <div
      className={`app-shell ${sidebarOpen ? '' : 'sidebar-collapsed'} ${mobileList ? 'show-mobile-list' : ''} ${effectiveDark ? 'theme-dark' : 'theme-light'} ${settings.animation ? '' : 'no-animation'} ${settings.codeWrap ? 'code-wrap' : ''} list-layout-${settings.listLayout}`}
      style={{
        '--reader-font-size': `${settings.fontSize}px`,
        '--reader-line-height': settings.lineHeight,
        '--reader-max-width': `${settings.maxWidth}px`,
        '--reader-font-family': settings.fontFamily === 'serif' ? "'Noto Serif JP', serif" : "'Noto Sans JP', sans-serif"
      } as React.CSSProperties}
    >
      <header className="topbar">
        <div className="brand">
          <button className="icon-button desktop-only" onClick={() => setSidebarOpen(v => !v)} aria-label="ノート一覧を切り替え"><Sidebar size={19} /></button>
          <button
            className="icon-button mobile-only"
            onClick={() => setMobileList(open => !open)}
            aria-label={mobileList ? 'ノート一覧を閉じる' : 'ノート一覧を開く'}
            aria-expanded={mobileList}
            aria-controls="note-sidebar"
          ><Menu size={21} /></button>
          <img className="brand-mark small icon-image" src={appIconUrl} alt="" /><span className="brand-name">MdRWer</span>
        </div>
        <div className="document-title"><span>{active?.title || 'ノートがありません'}</span>{saving && <i>保存中…</i>}{!saving && driveStatus === 'syncing' && <i>DRIVE同期中…</i>}</div>
        <div className="top-actions">
          <button className="icon-button" onClick={addNote} aria-label="新しいノート"><Plus size={21} /></button>
          {active && <button className={`icon-button ${mode === 'edit' ? 'active' : ''}`} onClick={() => setMode(mode === 'edit' ? 'read' : 'edit')} aria-label={mode === 'edit' ? '閲覧に戻る' : '編集する'}>{mode === 'edit' ? <Check size={20} /> : <Pencil size={19} />}</button>}
          <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="表示設定"><SettingsIcon size={19} /></button>
          <div className="menu-anchor">
            <button className="icon-button" onClick={() => setMenuOpen(v => !v)} aria-label="その他の操作"><MoreHorizontal size={21} /></button>
            {menuOpen && <div className="action-menu">
              <button onClick={exportNote}><FileDown size={17} />Markdownを書き出す</button>
              <button onClick={() => void backupZip()}><Archive size={17} />ZIPバックアップ</button>
              <button onClick={backupJson}><Download size={17} />JSONバックアップ</button>
              <button onClick={() => fileRef.current?.click()}><FileUp size={17} />ファイルを読み込む</button>
              <hr />
              <button className="danger" onClick={() => active && setDeleteTargetId(active.id)}><Trash2 size={17} />ノートを削除</button>
            </div>}
          </div>
        </div>
      </header>

      <aside className="sidebar" id="note-sidebar">
        <div className="sidebar-head"><div><span className="eyebrow">LIBRARY</span><h1>ノート</h1></div><button className="icon-button mobile-only" onClick={() => setMobileList(false)} aria-label="閉じる"><X size={20} /></button></div>
        <label className="search-box"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="ノートを検索" aria-label="ノートを検索" />{query && <button onClick={() => setQuery('')} aria-label="検索を消去"><X size={14} /></button>}</label>
        <div className="library-tools">
          <button className="folder-manager-button" onClick={() => setFolderManagerOpen(true)} aria-label="フォルダを管理"><FolderPlus size={16} /></button>
          <label><ArrowDownUp size={14} /><select value={settings.sortField} onChange={event => updateSettings('sortField', event.target.value as AppSettings['sortField'])} aria-label="並べ替え">
            <option value="manual">手動順</option><option value="title">名前順</option><option value="createdAt">作成日順</option><option value="updatedAt">更新日順</option>
          </select></label>
          <button onClick={() => updateSettings('sortDirection', settings.sortDirection === 'asc' ? 'desc' : 'asc')} aria-label="昇順と降順を切り替え">{settings.sortDirection === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
          <button onClick={() => updateSettings('listLayout', settings.listLayout === 'cards' ? 'compact' : 'cards')} aria-label="一覧表示を切り替え">{settings.listLayout === 'cards' ? <Grid2X2 size={15} /> : <List size={16} />}</button>
        </div>
        <div className="note-count">{filteredNotes.length} NOTES {query && `・「${query}」の検索結果`}</div>
        <nav className="note-list note-tree" aria-label="フォルダとノート">
          {(!debouncedQuery || favoriteNotes.length > 0) && <section className={`folder-node favorite-folder ${expandedFolders.has('favorites') || debouncedQuery ? 'expanded' : ''}`}>
            <button className="folder-row" onClick={() => toggleFolder('favorites')} aria-expanded={Boolean(expandedFolders.has('favorites') || debouncedQuery)}>
              {expandedFolders.has('favorites') || debouncedQuery ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<Star size={16} />
              <strong>お気に入り</strong><span>{notes.filter(note => note.favorite).length}</span>
            </button>
            {(expandedFolders.has('favorites') || debouncedQuery) && <div className="folder-note-list">{favoriteNotes.map(renderNoteCard)}{!favoriteNotes.length && <p className="empty-folder">お気に入りはありません</p>}</div>}
          </section>}
          {visibleFolders.map(folder => {
            const folderNotes = notesByFolder.get(folder.name) || []
            const open = Boolean(debouncedQuery) || expandedFolders.has(folder.name)
            return <section className={`folder-node ${open ? 'expanded' : ''}`} key={folder.id}>
              <button className="folder-row" onClick={() => toggleFolder(folder.name)} aria-expanded={open}>
                {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<Folder size={16} />
                <strong>{folder.name}</strong><span>{notes.filter(note => note.folder === folder.name).length}</span>
              </button>
              {open && <div className="folder-note-list">{folderNotes.map(renderNoteCard)}{!folderNotes.length && <p className="empty-folder">ノートはありません</p>}</div>}
            </section>
          })}
          {unfiledNotes.map(renderNoteCard)}
          {!filteredNotes.length && <div className="empty-search"><Search size={24} /><p>見つかりませんでした</p></div>}
        </nav>
        <button className="new-note-button" onClick={addNote}><Plus size={18} />新しいノート</button>
      </aside>

      <main className="main-panel">
        {!active ? <div className="empty-state"><BookOpen size={38} /><h2>まだノートがありません</h2><p>最初の一頁を書いてみましょう。</p><button onClick={addNote}><Plus size={18} />ノートを作る</button></div> : mode === 'edit' ? (
          <section className={`editor-view ${settings.editorLayout === 'split' ? 'split' : ''}`}>
            <div className="editor-heading"><span>EDITING</span><input value={active.title} onChange={e => updateActive({ title: e.target.value })} aria-label="ノートのタイトル" /><label className="tag-editor"><Tag size={14} /><input value={tagDraft} onChange={event => setTagDraft(event.target.value)} onBlur={commitTags} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} placeholder="タグをカンマ区切りで入力" aria-label="タグ" /></label></div>
            <div className="format-bar" aria-label="Markdown入力支援">
              {['# ','**太字**','*斜体*','- ','- [ ] ','> ','`code`','[link](url)'].map(item => <button key={item} onClick={() => updateActive({ content: `${active.content}${active.content.endsWith('\n') ? '' : '\n'}${item}` })}>{item}</button>)}
            </div>
            <div className="editor-workspace">
              <textarea className="editor" value={active.content} onChange={e => updateActive({ content: e.target.value })} spellCheck="true" aria-label="Markdown本文" />
              {settings.editorLayout === 'split' && <div className="split-preview"><MarkdownView source={active.content} label="Markdownプレビュー" /></div>}
            </div>
            <div className="editor-footer"><span>{active.content.length.toLocaleString()} 文字</span><button onClick={() => setMode('read')}><BookOpen size={16} />プレビュー</button></div>
          </section>
        ) : (
          <section className="reader" ref={readerRef} onScroll={rememberScroll} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} style={{ '--swipe-x': `${swipeOffset}px` } as React.CSSProperties}>
            <div className="paper">
              <div className="paper-meta"><span>{active.folder || 'NOTES'}</span><button className={active.favorite ? 'favorite active' : 'favorite'} onClick={() => updateActive({ favorite: !active.favorite }, true)} aria-label="お気に入りを切り替え"><Heart size={17} fill={active.favorite ? 'currentColor' : 'none'} /></button></div>
              {!!active.tags?.length && <div className="paper-tags">{active.tags.map(tag => <span key={tag}>#{tag}</span>)}</div>}
              <MarkdownView source={active.content} />
              <footer className="endmark"><span>◆</span><small>LAST EDITED {new Intl.DateTimeFormat('ja', { year: 'numeric', month: 'long', day: 'numeric' }).format(active.updatedAt)}</small></footer>
            </div>
          </section>
        )}
        {active && <div className="page-nav">
          <button onClick={() => moveNote(-1)} disabled={activeIndex <= 0} aria-label="前のノート"><ChevronLeft size={20} /><span>前へ</span></button>
          <div><span>{String(Math.max(0, activeIndex + 1)).padStart(2, '0')}</span><i /> <span>{String(navigationNotes.length).padStart(2, '0')}</span></div>
          <button onClick={() => moveNote(1)} disabled={activeIndex >= navigationNotes.length - 1} aria-label="次のノート"><span>次へ</span><ChevronRight size={20} /></button>
        </div>}
      </main>

      <input ref={fileRef} hidden type="file" multiple accept=".md,.markdown,.txt,.json,.zip" onChange={e => importFiles(e.target.files)} />
      {mobileList && <button className="scrim mobile-only" aria-label="一覧を閉じる" onClick={() => setMobileList(false)} />}
      {folderManagerOpen && <div className="dialog-layer"><section className="manager-dialog" role="dialog" aria-modal="true" aria-labelledby="folder-manager-title">
        <header><div><span className="eyebrow">LIBRARY</span><h2 id="folder-manager-title"><FolderCog size={21} />フォルダ管理</h2></div><button className="icon-button" onClick={() => setFolderManagerOpen(false)} aria-label="閉じる"><X size={19} /></button></header>
        <div className="folder-create"><input value={newFolderName} onChange={event => setNewFolderName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void createFolder() }} placeholder="新しいフォルダ名" aria-label="新しいフォルダ名" /><button onClick={() => void createFolder()}><FolderPlus size={17} />追加</button></div>
        <div className="folder-manager-list">
          {folders.map(folder => <div className="folder-manager-row" key={folder.id}>
            {editingFolderId === folder.id ? <>
              <input value={folderDraft} onChange={event => setFolderDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void renameFolder(folder) }} autoFocus aria-label="フォルダ名" />
              <button onClick={() => void renameFolder(folder)} aria-label="保存"><Check size={17} /></button><button onClick={() => setEditingFolderId(null)} aria-label="キャンセル"><X size={17} /></button>
            </> : <>
              <span><Folder size={17} /><strong>{folder.name}</strong><small>{notes.filter(note => note.folder === folder.name).length}件</small></span>
              <button onClick={() => { setEditingFolderId(folder.id); setFolderDraft(folder.name) }} aria-label={`${folder.name}を名前変更`}><Pencil size={16} /></button>
              <button className="danger" onClick={() => void deleteFolder(folder)} aria-label={`${folder.name}を削除`}><Trash2 size={16} /></button>
            </>}
          </div>)}
          {!folders.length && <p className="manager-empty">フォルダはまだありません。</p>}
        </div>
      </section></div>}
      {moveTarget && <div className="dialog-layer"><section className="manager-dialog move-dialog" role="dialog" aria-modal="true" aria-labelledby="move-note-title">
        <header><div><span className="eyebrow">MOVE NOTE</span><h2 id="move-note-title"><FolderInput size={21} />移動先を選択</h2><p>{moveTarget.title}</p></div><button className="icon-button" onClick={() => setMoveTargetId(null)} aria-label="閉じる"><X size={19} /></button></header>
        <div className="move-folder-list"><button className={!moveTarget.folder ? 'active' : ''} onClick={() => void moveNoteToFolder('')}><Folder size={17} />未分類{!moveTarget.folder && <Check size={16} />}</button>{folders.map(folder => <button key={folder.id} className={moveTarget.folder === folder.name ? 'active' : ''} onClick={() => void moveNoteToFolder(folder.name)}><Folder size={17} />{folder.name}{moveTarget.folder === folder.name && <Check size={16} />}</button>)}</div>
      </section></div>}
      {settingsOpen && <div className="settings-layer"><button className="settings-scrim" onClick={() => setSettingsOpen(false)} aria-label="設定を閉じる" /><section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header><div><span className="eyebrow">SETTINGS</span><h2 id="settings-title"><SettingsIcon size={21} />設定</h2></div><button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="閉じる"><X size={19} /></button></header>
        <div className="settings-body">
          <section className={`drive-setting drive-${driveStatus}`} aria-labelledby="drive-setting-title">
            <div className="drive-setting-heading"><span><Cloud size={19} /></span><div><strong id="drive-setting-title">Google Drive同期</strong><small>{driveMessage}</small></div></div>
            {driveStatus === 'not-configured' ? <p>公開側のGoogleクライアントIDが未設定です。READMEの手順で設定してください。</p> : <>
              <div className="drive-setting-actions">
                {driveStatus === 'synced' ? <button onClick={() => void performDriveSync(true)} disabled={driveSyncing.current}><RefreshCw size={15} />今すぐ同期</button> : <button className="primary" onClick={() => void connectDrive()} disabled={driveStatus === 'connecting' || driveStatus === 'syncing'}><Cloud size={15} />{wasGoogleDriveConnected() ? '再接続して同期' : 'Google Driveと接続'}</button>}
                {wasGoogleDriveConnected() && <button onClick={disconnectDrive}>接続解除</button>}
              </div>
              {lastDriveSync && <time>最終同期：{new Intl.DateTimeFormat('ja', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(lastDriveSync)}</time>}
              <p>ノートとフォルダを同じGoogleアカウントの端末間で同期します。表示設定は端末ごとに保存されます。</p>
            </>}
          </section>
          <label className="setting-row"><span>テーマ<small>端末設定・ライト・ダーク</small></span><select value={settings.theme} onChange={event => updateSettings('theme', event.target.value as AppSettings['theme'])}><option value="system">端末に合わせる</option><option value="light">ライト</option><option value="dark">ダーク</option></select></label>
          <label className="setting-row"><span>本文サイズ<small>{settings.fontSize}px</small></span><input type="range" min="13" max="24" step="1" value={settings.fontSize} onChange={event => updateSettings('fontSize', Number(event.target.value))} /></label>
          <label className="setting-row"><span>行間<small>{settings.lineHeight.toFixed(1)}</small></span><input type="range" min="1.4" max="2.4" step="0.1" value={settings.lineHeight} onChange={event => updateSettings('lineHeight', Number(event.target.value))} /></label>
          <label className="setting-row"><span>本文の横幅<small>{settings.maxWidth}px</small></span><input type="range" min="560" max="1100" step="20" value={settings.maxWidth} onChange={event => updateSettings('maxWidth', Number(event.target.value))} /></label>
          <label className="setting-row"><span>本文フォント</span><select value={settings.fontFamily} onChange={event => updateSettings('fontFamily', event.target.value as AppSettings['fontFamily'])}><option value="serif">明朝体</option><option value="sans">ゴシック体</option></select></label>
          <label className="setting-row"><span>編集画面<small>左右分割でプレビューできます</small></span><select value={settings.editorLayout} onChange={event => updateSettings('editorLayout', event.target.value as AppSettings['editorLayout'])}><option value="edit">編集のみ</option><option value="split">編集＋プレビュー</option></select></label>
          <label className="setting-row"><span>スワイプ感度<small>{settings.swipeSensitivity}px</small></span><input type="range" min="30" max="140" step="1" value={settings.swipeSensitivity} onChange={event => updateSettings('swipeSensitivity', Number(event.target.value))} /></label>
          <label className="setting-check"><input type="checkbox" checked={settings.codeWrap} onChange={event => updateSettings('codeWrap', event.target.checked)} /><span>長いコードを折り返す</span></label>
          <label className="setting-check"><input type="checkbox" checked={settings.animation} onChange={event => updateSettings('animation', event.target.checked)} /><span>アニメーションを使う</span></label>
        </div>
        <footer><button onClick={() => setSettings({ ...defaultSettings })}>初期設定に戻す</button><button className="primary" onClick={() => setSettingsOpen(false)}>完了</button></footer>
      </section></div>}
      {noteMenu && <div className="note-menu-layer">
        <button className="note-menu-scrim" onClick={() => setNoteMenuId(null)} aria-label="ノートメニューを閉じる" />
        <section className="note-menu-sheet" style={{ left: noteMenuPosition.x, top: noteMenuPosition.y }} role="dialog" aria-modal="true" aria-labelledby="note-menu-title">
          <span className="eyebrow">NOTE ACTIONS</span>
          <h2 id="note-menu-title">{noteMenu.title}</h2>
          <button onClick={() => { void toggleFavorite(noteMenu); setNoteMenuId(null) }}>
            <Heart size={19} fill={noteMenu.favorite ? 'currentColor' : 'none'} />
            {noteMenu.favorite ? 'お気に入りから外す' : 'お気に入りに追加'}
          </button>
          <button onClick={() => { setMoveTargetId(noteMenu.id); setNoteMenuId(null) }}><FolderInput size={19} />フォルダへ移動</button>
          {settings.sortField === 'manual' && <>
            <button onClick={() => void reorderNote(noteMenu, -1)} disabled={noteMenu.order <= 0}><ChevronUp size={19} />ひとつ上へ移動</button>
            <button onClick={() => void reorderNote(noteMenu, 1)} disabled={noteMenu.order >= notes.length - 1}><ChevronDown size={19} />ひとつ下へ移動</button>
          </>}
          <button className="danger" onClick={() => { setDeleteTargetId(noteMenu.id); setNoteMenuId(null) }}><Trash2 size={19} />ノートを削除</button>
          <button className="note-menu-cancel" onClick={() => setNoteMenuId(null)}>キャンセル</button>
        </section>
      </div>}
      {deleteTarget && <div className="dialog-layer"><div className="dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title"><span className="dialog-icon"><Trash2 size={22} /></span><h2 id="delete-title">このノートを削除しますか？</h2><p>「{deleteTarget.title}」は端末から削除されます。この操作は取り消せません。</p><div><button onClick={() => setDeleteTargetId(null)}>キャンセル</button><button className="danger-solid" onClick={deleteNote}>削除する</button></div></div></div>}
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </div>
  )
}
