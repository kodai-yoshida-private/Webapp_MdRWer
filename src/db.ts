import Dexie, { type EntityTable } from 'dexie'
import { createNoteId } from './id'
import type { Folder, Note } from './types'

export const db = new Dexie('mdrwer') as Dexie & {
  notes: EntityTable<Note, 'id'>
  folders: EntityTable<Folder, 'id'>
}

db.version(1).stores({ notes: 'id, updatedAt, order, folder, favorite' })
db.version(2).stores({ notes: 'id, updatedAt, order, folder, favorite' }).upgrade(async transaction => {
  await transaction.table<Note>('notes').where('id').anyOf('welcome', 'markdown-guide').modify(note => {
    note.title = note.title.replaceAll('Madorā', 'MdRWer')
    note.content = note.content
      .replace('Madorā（マドラー）は、**読むことを中心にした**Markdownノートです。', 'MdRWerは、**読むことを中心にした**Markdown Reader and Writerです。')
      .replaceAll('Madorā', 'MdRWer')
  })
})
db.version(3).stores({
  notes: 'id, updatedAt, order, folder, favorite',
  folders: 'id, &name, order'
}).upgrade(async transaction => {
  const notes = await transaction.table<Note>('notes').toArray()
  const names = [...new Set(notes.map(note => note.folder).filter(Boolean))]
  await transaction.table<Folder>('folders').bulkAdd(names.map((name, order) => ({
    id: createNoteId(), name, order, createdAt: Date.now(), updatedAt: Date.now()
  })))
})
db.version(4).stores({
  notes: 'id, updatedAt, order, folder, favorite, *tags',
  folders: 'id, &name, order'
}).upgrade(async transaction => {
  await transaction.table<Note>('notes').toCollection().modify(note => { note.tags = note.tags || [] })
})
db.version(5).stores({
  notes: 'id, updatedAt, order, folder, favorite, *tags',
  folders: 'id, &name, order'
}).upgrade(async transaction => {
  await transaction.table<Folder>('folders').toCollection().modify(folder => {
    folder.updatedAt = folder.updatedAt || folder.createdAt || Date.now()
  })
})

export const starterNotes: Note[] = [
  {
    id: 'welcome',
    title: 'ようこそ、MdRWerへ',
    content: `# ようこそ、MdRWerへ

MdRWerは、**読むことを中心にした**Markdown Reader and Writerです。

## まずは、ゆっくり読んでみる

画面を縦にスクロールして文章を読みます。ノートを切り替えるときは、画面を左右にスワイプしてください。

- 左へスワイプ：次のノート
- 右へスワイプ：前のノート
- 右上の鉛筆：文章を編集

> ノートはこの端末の中に保存されます。インターネットがない場所でも、閲覧と編集ができます。

### Markdownも自然に

コードは \`const idea = "write it down"\` のように表示できます。

\`\`\`ts
function remember(thought: string) {
  return { thought, savedAt: new Date() }
}
\`\`\`

---

右上の **＋** から、最初のノートを作ってみましょう。`,
    folder: 'はじめに', createdAt: Date.now(), updatedAt: Date.now(), order: 0, favorite: true, tags: ['チュートリアル'], scrollTop: 0
  },
  {
    id: 'markdown-guide',
    title: 'Markdownの小さな手引き',
    content: `# Markdownの小さな手引き

## 見出し
行頭に \`#\` を置くと見出しになります。

## リスト
- 思いついたこと
- あとで読み返すこと
- 大切にしたい言葉

## チェックリスト
- [x] MdRWerを開く
- [ ] 新しいノートを書く

## 表
| 記号 | 意味 |
| --- | --- |
| **太字** | 強調 |
| *斜体* | ニュアンス |

[外部リンク](https://example.com) は新しいタブで安全に開きます。`,
    folder: 'はじめに', createdAt: Date.now(), updatedAt: Date.now() - 1, order: 1, favorite: false, tags: ['チュートリアル', 'Markdown'], scrollTop: 0
  }
]

export async function ensureStarterNotes() {
  if ((await db.notes.count()) === 0) await db.notes.bulkAdd(starterNotes)
  const notes = await db.notes.toArray()
  const folders = await db.folders.toArray()
  const known = new Set(folders.map(folder => folder.name))
  const missing = [...new Set(notes.map(note => note.folder).filter(Boolean))].filter(name => !known.has(name))
  if (missing.length) {
    await db.folders.bulkAdd(missing.map((name, index) => ({
      id: createNoteId(), name, order: folders.length + index, createdAt: Date.now(), updatedAt: Date.now()
    })))
  }
}
