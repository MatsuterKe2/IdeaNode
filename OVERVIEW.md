# IdeaGraph - AI対話型ブレインストーミングWebアプリ

## 概要
マインドマップ形式でアイデアを視覚的に配置・展開し、各アイデアについてAIと対話しながら深掘りできるWebアプリケーション。

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| フロントエンド | React 18 + TypeScript + Vite |
| マインドマップ | React Flow (@xyflow/react) |
| 状態管理 | Zustand |
| スタイリング | Tailwind CSS |
| バックエンド | Hono + Node.js |
| AI | Gemini 2.0 Flash (REST API) |
| DB | SQLite (better-sqlite3) |

## ディレクトリ構成

```
app3/
├── package.json                 # npm workspaces ルート
├── .env                         # GEMINI_API_KEY
├── client/                      # フロントエンド
│   ├── src/
│   │   ├── App.tsx              # ルートレイアウト (固定ヘッダー + キャンバス + チャット)
│   │   ├── index.css            # React Flowカスタムスタイル
│   │   ├── api/client.ts        # REST / SSE APIクライアント
│   │   ├── store/mindMapStore.ts  # Zustand中央ストア
│   │   ├── types/index.ts       # Flow用型定義
│   │   ├── hooks/useAIChat.ts   # AIストリーミングフック
│   │   └── components/
│   │       ├── MindMapCanvas.tsx   # React Flowキャンバス本体
│   │       ├── IdeaNode.tsx       # カスタムノード (4方向ハンドル, インライン編集)
│   │       ├── DeletableEdge.tsx  # カスタムエッジ (選択時赤, 2回クリック削除)
│   │       ├── TrashDropZone.tsx  # ゴミ箱ドロップゾーン (吸い込みアニメーション)
│   │       ├── AIChatPanel.tsx    # AI対話パネル (プリセット, ストリーミング)
│   │       ├── Toolbar.tsx        # ヘッダー (プロジェクト選択, 作成)
│   │       └── NodeContextMenu.tsx  # 右クリックメニュー (子追加, 色変更, 削除)
│   └── vite.config.ts           # /api プロキシ → localhost:3001
├── server/                      # バックエンド
│   └── src/
│       ├── index.ts             # Honoサーバー起動
│       ├── db/
│       │   ├── connection.ts    # SQLite接続 (WALモード)
│       │   └── schema.ts       # テーブル定義 + マイグレーション
│       ├── routes/
│       │   ├── projects.ts      # プロジェクトCRUD
│       │   ├── nodes.ts        # ノードCRUD
│       │   ├── edges.ts        # エッジCRUD
│       │   └── ai.ts           # AI対話 (SSEストリーミング)
│       └── services/gemini.ts   # Gemini API呼び出し
└── shared/                      # 共有型定義
    └── src/types.ts
```

## データモデル

### Project
| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | TEXT PK | UUID |
| name | TEXT | プロジェクト名 |
| created_at | TEXT | 作成日時 |
| updated_at | TEXT | 更新日時 |

### Node
| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | TEXT PK | UUID |
| project_id | TEXT FK | 所属プロジェクト |
| parent_id | TEXT | 親ノード |
| label | TEXT | 表示テキスト |
| description | TEXT | 詳細説明 |
| color | TEXT | ノード色 (例: #3b82f6) |
| is_root | INTEGER | ルートノードフラグ |
| position_x | REAL | X座標 |
| position_y | REAL | Y座標 |
| ai_conversation | TEXT | AI対話履歴 (JSON) |

### Edge
| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | TEXT PK | UUID |
| project_id | TEXT FK | 所属プロジェクト |
| source | TEXT | 接続元ノード |
| target | TEXT | 接続先ノード |
| type | TEXT | tree / crosslink |
| label | TEXT | エッジラベル |
| source_handle | TEXT | 接続元ハンドル (top/bottom/left/right) |
| target_handle | TEXT | 接続先ハンドル (top/bottom/left/right) |

## API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | /api/projects | プロジェクト一覧 |
| POST | /api/projects | プロジェクト作成 |
| PATCH | /api/projects/:id | プロジェクト更新 |
| DELETE | /api/projects/:id | プロジェクト削除 |
| GET | /api/projects/:id/nodes | ノード一覧 |
| POST | /api/projects/:id/nodes | ノード作成 |
| PATCH | /api/nodes/:id | ノード更新 |
| DELETE | /api/nodes/:id | ノード削除 (関連エッジも削除) |
| GET | /api/projects/:id/edges | エッジ一覧 |
| POST | /api/projects/:id/edges | エッジ作成 |
| DELETE | /api/edges/:id | エッジ削除 |
| POST | /api/ai/chat | AI対話 (SSEストリーミング) |

## 主要機能

### マインドマップ操作
- **ダブルクリック**: 空白部分にルートノード作成
- **ハンドルドラッグ**: ノード間のエッジ接続 (4方向対応)
- **Tab**: 選択中ノードに子ノード追加
- **右クリック**: コンテキストメニュー (子追加, AI対話, 色変更, 削除)
- **ノードダブルクリック**: インライン編集
- **左ドラッグ (空白)**: 範囲選択 → まとめて移動
- **中/右ボタンドラッグ**: 画面パン
- **Delete/Backspace**: 選択中のノードまたはエッジを削除

### エッジ操作
- **クリック1回**: 赤色でハイライト
- **クリック2回**: 削除
- **ドラッグ付け替え**: エッジの端をドラッグして別ノードに再接続
- **空白ドロップ**: エッジ削除

### ゴミ箱 (右下)
- 常時表示、ノードをドラッグ＆ドロップで削除
- 削除時: エッジがフェードアウト → ノードがゴミ箱に吸い込まれるアニメーション
- AI対話パネル開閉時に位置が自動調整

### AI対話 (Gemini 2.0 Flash)
- ノード選択時に右パネルが開く
- プリセットアクション: 「深掘り」「関連提案」「批評」
- 自由入力チャット (SSEストリーミング)
- AIの提案を子ノードとして一括追加

### データ管理
- SQLite永続化、変更時500ms debounceで自動保存
- プロジェクト単位でマインドマップを管理

## 起動方法

```bash
# .env に GEMINI_API_KEY を設定
npm install
npm run dev
# → フロント: http://localhost:5173 / バック: http://localhost:3001
```

## 設計方針

### ストア (mindMapStore.ts)
- `toFlowNode()` / `toFlowEdge()` ヘルパーでAPI型↔React Flow型の変換を一元化
- 全アクションがAPI通信 + ローカルstate更新を行い、楽観的UIを実現
- `scheduleSave()` で500ms debounceの自動保存

### カスタムCSS (index.css)
- ハンドルの当たり判定を `::after` 疑似要素で辺全体に拡大
- CSS変数 `--node-color` でノード色に連動したハンドルスタイル
- 接続ドラッグ中の点線アニメーション
- 範囲選択後の枠を非表示＋クリック透過
