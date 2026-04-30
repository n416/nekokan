# nekokan

Vite + React + Redux で構築されたフロントエンドと、Cloudflare Workers + D1 をバックエンドに持つリアルタイム共有ツールです。

## プロジェクト構成

- `ui/`: フロントエンド (Vite + React)
- `api/`: バックエンドAPI (Cloudflare Workers)

---

## 🎨 UI (フロントエンド)

Vite + React + Redux で構築された「nekokan」のフロントエンドです。
リアルタイムなルーム共有機能を備えています。

### 主な機能
- **パーソナルモード**: 通常時はローカル（localStorage）にのみデータが保存されます。
- **ルーム共有機能**: 
  - 右上の「同期（🔄）」ボタンから共有ルームを作成し、URL (`?room=xxx`) を発行できます。
  - ルームには任意のパスワードによるアクセス制限をかけることができます。
  - ルーム作成者（オーナー）は、ルームのパスワードを後から変更または解除可能です（オーナー権限はブラウザに記憶されます）。
- **自動同期と安全なマージ**:
  - ルームに入室中、画面上でアクション（ボス時間の登録や無効化など）を起こすと、自動でバックエンドへPushされます。
  - **バッティング対策（Last-Write-Wins）**: 他の人が同時に更新していた場合でも、入力が消えることなく最新のタイムスタンプを持つデータ同士が自動的に合成（マージ）されて画面に反映されます。

### 開発環境の立ち上げ

```bash
cd ui

# 依存関係のインストール
npm install

# 開発サーバーの起動 (デフォルトで http://localhost:5173/)
npm run dev
```

### バックエンドの接続先変更
ローカル開発用のバックエンドに繋ぎたい場合や、別のURLにデプロイした場合は、`.env.development` ファイル等で `VITE_API_BASE` を設定するか、ソースコードを調整してください。

### プロダクションビルド

```bash
cd ui
npm run build
```
生成された `dist` ディレクトリの中身を Cloudflare Pages や Vercel, Netlify などの静的ホスティングサービスにアップロードしてください。

---

## ⚙️ API (バックエンド)

「nekokan」の共有ルーム機能を支えるバックエンドAPIです。
Cloudflare Workers と D1 (SQLite) を使用して構築されています。

### 主な機能
- **ルームの作成 (`POST /api/rooms`)**: 新しいルームとオーナー権限（owner_token）を発行し、D1に初期状態を保存します。
- **パスワード保護**: パスワードは `Web Crypto API` (SHA-256) によってハッシュ化され、平文では保存されません。
- **データ取得 (`GET /api/rooms/:room_id`)**: 現在のルームの状態を取得します。パスワードが設定されている場合はヘッダー等での認証が必要です。
- **データ更新とマージ (`PUT /api/rooms/:room_id`)**: 
  - オプティミスティック・ロック（Last-Write-Wins）によるバッティング対策を実装。
  - フロントエンドから送られてきた各フィールドの `timestamps` を比較し、新しい時間を持つデータだけを採用して安全にマージ（合成）します。
- **パスワード変更 (`PATCH /api/rooms/:room_id/password`)**: ルーム作成時に発行されたオーナーのみがパスワードを変更できます。

### 開発環境の立ち上げ (ローカル)

```bash
cd api

# 依存関係のインストール
npm install

# ローカルデータベースの初期化
npm run db:init

# 開発サーバーの起動 (デフォルトで http://127.0.0.1:8787 が立ち上がります)
npm run dev
```

### 本番環境へのデプロイ手順

1. **D1データベースの作成**
   ```bash
   cd api
   npx wrangler d1 create nekokan-db
   ```
2. 発行された `database_id` を `wrangler.toml` に反映させます。
3. **本番データベースへテーブルの作成**
   ```bash
   npx wrangler d1 execute DB --remote --file=./schema.sql
   ```
4. **Cloudflare Workers へデプロイ**
   ```bash
   npm run deploy
   ```
