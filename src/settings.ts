import type { AppSettings } from './types'

export const defaultSettings: AppSettings = {
  theme: 'system',
  fontSize: 16,
  lineHeight: 2,
  maxWidth: 760,
  fontFamily: 'serif',
  codeWrap: true,
  swipeSensitivity: 72,
  animation: true,
  listLayout: 'cards',
  editorLayout: 'edit',
  sortField: 'manual',
  sortDirection: 'asc'
}

const SETTINGS_KEY = 'mdrwer-settings-v2'

export function loadSettings(): AppSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') as Partial<AppSettings>
    return { ...defaultSettings, ...stored }
  } catch {
    return defaultSettings
  }
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}
