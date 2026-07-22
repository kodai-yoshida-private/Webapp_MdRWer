export type Note = {
  id: string
  title: string
  content: string
  folder: string
  createdAt: number
  updatedAt: number
  order: number
  favorite: boolean
  tags: string[]
  scrollTop: number
}

export type ViewMode = 'read' | 'edit'

export type Folder = {
  id: string
  name: string
  order: number
  createdAt: number
}

export type SortField = 'manual' | 'title' | 'createdAt' | 'updatedAt'
export type SortDirection = 'asc' | 'desc'
export type ThemeMode = 'system' | 'light' | 'dark'
export type ListLayout = 'cards' | 'compact'
export type EditorLayout = 'edit' | 'split'

export type AppSettings = {
  theme: ThemeMode
  fontSize: number
  lineHeight: number
  maxWidth: number
  fontFamily: 'serif' | 'sans'
  codeWrap: boolean
  swipeSensitivity: number
  animation: boolean
  listLayout: ListLayout
  editorLayout: EditorLayout
  sortField: SortField
  sortDirection: SortDirection
}
