# MdRWer — Markdown Reader and Writer PWA

MdRWerは、Markdown Reader and Writerを略した名前です。文章を「読む」体験を中心に設計したローカルファーストのMarkdownノートPWAで、縦スクロールで読み、左右スワイプでノートをめくれます。サーバーは不要で、ノートはブラウザのIndexedDBに保存されます。

Google Driveを使ったAndroid・iPad間の同期にも対応しています。初期設定は [Google Drive同期の設定手順](GOOGLE_DRIVE_SETUP.md) を参照してください。

## 実装済みの機能

- ノートの作成、閲覧、編集、自動保存、削除
- Markdownプレビュー（見出し、リスト、表、コード、KaTeX数式、Mermaid図など）
- 左右スワイプ、前へ／次へボタン、左右キーによるノート移動
- タイトル・本文・フォルダ名・タグを対象にした全文検索
- カンマ区切りのタグ編集と`#タグ名`検索
- フォルダの作成、名称変更、削除、ノート移動
- 手動・タイトル・作成日・更新日での並べ替え（昇順／降順）
- カード／コンパクトの一覧表示切り替え
- `.md`、`.markdown`、`.txt` の複数インポート
- Markdownエクスポート、Web Share API、ZIP／JSONバックアップと復元
- IndexedDB（Dexie.js）による端末内保存とスクロール位置の保持
- Android、iPad、PC向けレスポンシブ表示とSafe Area対応
- Service Worker、Web App Manifest、オフライン起動、更新キャッシュ
- GitHub Pages向けの相対パスビルドと自動デプロイ
- OS連動・ライト・ダークのテーマ切り替え
- 文字サイズ、行間、本文幅、フォント、コード折り返し、スワイプ感度、アニメーションの表示設定
- 編集のみ／編集＋プレビューの画面切り替え
- Mermaidの遅延読み込み、Markdown描画のメモ化、検索デバウンス、一覧の遅延描画
- キーボード操作、フォーカス可能な標準UI、`prefers-reduced-motion`

生HTMLは無効にし、レンダリング結果をDOMPurifyでサニタイズしています。外部リンクは別タブで開き、`noopener noreferrer`を付与します。

## 開発環境

Node.js 20以上を推奨します。

```bash
pnpm install
pnpm dev
```

表示されたローカルURLをブラウザで開いてください。同じネットワークのモバイル端末から確認する場合は `pnpm dev --host` を使います。npmを使う場合は各コマンドの `pnpm` を `npm run` に読み替えられます。

## ビルドと確認

```bash
pnpm test
pnpm exec playwright install chromium webkit
pnpm test:e2e
pnpm build
pnpm preview
```

成果物は `dist/` に生成されます。Service Workerは開発サーバーではなく、`preview` または本番配信で確認してください。

## GitHub Pagesへの公開

1. リポジトリをGitHubへpushします。
2. GitHubの **Settings → Pages → Build and deployment** で Source を **GitHub Actions** にします。
3. `main` ブランチへpushすると `.github/workflows/deploy.yml` がテスト、ビルド、公開を行います。

Viteの `base` は `./` のため、`https://username.github.io/repository-name/` のようなサブパスでも動作します。単一画面アプリで履歴ルーティングを使わないため、Pages上での404フォールバックも不要です。

## PWAのインストール

### Android

Chromeで公開URLを開き、メニューの **アプリをインストール** または **ホーム画面に追加** を選びます。

旧アイコンが残る場合は、一度ホーム画面からMdRWerを削除して再インストールしてください。

### iPad

Safariで公開URLを開き、共有ボタンから **ホーム画面に追加** を選びます。インストール後はホーム画面のMdRWerアイコンから起動できます。

既に追加済みで旧アイコンが残る場合は、ホーム画面のMdRWerを削除してから追加し直してください。

## データ保存、バックアップ、復元

ノートは利用中のブラウザプロファイルのIndexedDBにだけ保存され、サーバーへ送信されません。ブラウザのサイトデータ削除やOSの都合で消える可能性があるため、右上のメニューから定期的に **ZIPバックアップ** または **JSONバックアップ** を保存してください。ZIPには復元用JSONとフォルダ別のMarkdownファイルが入ります。復元は **ファイルを読み込む** からZIPまたはJSONを選択します。復元したデータは既存ノートを残したまま追加されます。

## 主なライブラリ

- React / TypeScript / Vite: UIとビルド
- Dexie.js: IndexedDB操作
- markdown-it / markdown-it-task-lists: Markdown変換
- KaTeX: 数式描画
- Mermaid: 図表描画（必要なノートでのみ遅延読み込み）
- DOMPurify: HTMLサニタイズ
- JSZip: ZIPバックアップと復元
- lucide-react: UIアイコン
- vite-plugin-pwa / Workbox: Manifest、Service Worker、オフラインキャッシュ
- Vitest / jsdom: 単体テスト
- Playwright: Android、iPad、PC、オフライン動作のE2Eテスト

## ディレクトリ構成

```text
src/
├── App.tsx          # UI、CRUD、ジェスチャー、入出力
├── db.ts            # IndexedDBと初期ノート
├── markdown.ts      # 安全なMarkdownレンダリング
├── MarkdownView.tsx # KaTeX／Mermaid対応のメモ化プレビュー
├── phase2.ts        # 並べ替えとバックアップ
├── settings.ts      # 表示設定の保存
├── markdown.test.ts # 単体テスト
├── styles.css       # レスポンシブUI
└── types.ts         # データ型
public/icon-*.png    # PWAアイコン
```

## 既知の制限

- データは端末・ブラウザごとに独立し、自動同期はありません。
- 共同編集と端末間同期には対応していません。
- Playwright WebKitはオフライン再読み込みで内部エラーになるため、オフラインE2EはAndroid・PCのChromium構成で検証します。
- iOS/iPadOSでは、ブラウザが長期間使用されない場合などにサイトデータが削除される可能性があります。JSONバックアップを推奨します。
- 外部画像はオンライン時のみ表示できます。
