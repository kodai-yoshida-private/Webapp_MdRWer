# MdRWerのGoogle Drive同期設定

MdRWerはGoogle Driveの`appDataFolder`へ同期データを保存します。この領域は同じGoogleアカウントを使うAndroid・iPad・PC間で共有されますが、通常のGoogle Drive画面には表示されません。

同期するもの：ノート、フォルダ、お気に入り、タグ、並び順

端末ごとに保存するもの：テーマ、文字サイズ、スクロール位置などの表示設定

## 1. Google Cloudプロジェクトを作成する

1. [Google Cloud Console](https://console.cloud.google.com/)を開きます。
2. 画面上部のプロジェクト選択から「新しいプロジェクト」を選びます。
3. プロジェクト名を`MdRWer`として作成します。

## 2. Google Drive APIを有効にする

1. 作成したプロジェクトを選択します。
2. 「APIとサービス」→「ライブラリ」を開きます。
3. `Google Drive API`を検索して「有効にする」を押します。

## 3. OAuth同意画面を設定する

Google Cloud Consoleの「Google Auth Platform」または「APIとサービス」内で、OAuth同意画面を設定します。

- アプリ名：`MdRWer`
- ユーザーサポートメール：自分のGoogleアカウント
- 対象：個人利用なら「外部」
- 連絡先メール：自分のメールアドレス
- スコープ：`https://www.googleapis.com/auth/drive.appdata`

公開前のテスト状態で使用する場合は、「テストユーザー」にAndroidとiPadで使用するGoogleアカウントを追加してください。

## 4. OAuthクライアントIDを作成する

1. 「クライアント」または「認証情報」を開きます。
2. 「OAuthクライアントIDを作成」を選びます。
3. アプリケーションの種類を「ウェブアプリケーション」にします。
4. 名前を`MdRWer Web`にします。
5. 「承認済みのJavaScript生成元」に次を登録します。

ローカル開発用：

```text
http://localhost:5173
```

GitHub Pages用（ユーザー名だけ置き換えます）：

```text
https://あなたのGitHubユーザー名.github.io
```

`/MdRWer/`まで入力せず、URLの生成元だけを登録してください。

6. 作成後に表示されるクライアントIDをコピーします。クライアントシークレットはMdRWerでは使用しません。

## 5. ローカルで動作確認する

プロジェクト直下に`.env.local`を作り、クライアントIDを設定します。

```env
VITE_GOOGLE_CLIENT_ID=コピーしたクライアントID
```

その後、開発サーバーを起動します。

```powershell
pnpm dev
```

MdRWerの歯車ボタンから「設定」を開き、「Google Driveと接続」を押します。

## 6. GitHub Pagesへ設定を反映する

クライアントIDは`.env.local`ではなく、GitHubのRepository variableへ登録します。

1. GitHubの`MdRWer`リポジトリを開きます。
2. 「Settings」→「Secrets and variables」→「Actions」を開きます。
3. 「Variables」タブの「New repository variable」を押します。
4. Nameを`GOOGLE_CLIENT_ID`にします。
5. ValueへコピーしたクライアントIDを貼り付けて保存します。
6. 「Actions」から`Deploy to GitHub Pages`を再実行するか、更新を`main`へpushします。

## 7. AndroidとiPadで同期する

1. 両方の端末で更新後のMdRWerを開きます。
2. 歯車ボタンから「設定」を開きます。
3. 「Google Driveと接続」を押します。
4. 両方で同じGoogleアカウントを選択します。

接続中は変更後約1.6秒で自動同期します。アプリを再起動した場合やGoogleの接続期限が切れた場合は、「再接続して同期」を押してください。オフライン中の編集は端末内に保存され、再接続後に同期されます。

同じノートが別端末で同時に編集された場合は、新しい方を本文として残し、もう一方を「競合コピー」として保存します。念のため、ZIPバックアップも定期的に保存してください。
