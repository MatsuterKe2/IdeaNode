# CLAUDE.md — IdeaNode プロジェクト

## プロジェクト概要
マインドマップ形式の AI 対話型ブレインストーミング Web アプリ。
React Flow でノードを可視化し、Gemini 2.0 Flash と対話しながらアイデアを展開する。

## 技術スタック
- **フロント**: React 18 + TypeScript + Vite + Tailwind CSS
- **マインドマップ**: @xyflow/react (React Flow)
- **状態管理**: Zustand v5
- **バックエンド**: Hono + Node.js
- **AI**: Gemini 2.0 Flash (SSE ストリーミング)
- **DB**: SQLite (better-sqlite3, WAL モード)

## ビルド & 実行
```bash
npm install          # 全ワークスペースの依存解決
npm run dev          # client(:5173) + server(:3001) 同時起動
```
`.env` に `GEMINI_API_KEY` が必要。

## ディレクトリ構成
```
app3/
├── client/src/
│   ├── components/     # React コンポーネント
│   ├── store/          # Zustand ストア (mindMapStore.ts)
│   ├── types/          # 型定義 (IdeaFlowNode, IdeaFlowEdge)
│   ├── hooks/          # カスタムフック (useAIChat.ts)
│   ├── utils/          # autoArrange.ts, import/export
│   └── api/            # REST / SSE クライアント
├── server/src/
│   ├── db/             # SQLite 接続 & スキーマ
│   ├── routes/         # API ルート (projects, nodes, edges, ai)
│   └── services/       # Gemini API サービス
├── shared/src/         # 共有型定義 (types.ts)
└── test-data/          # テスト用データ (YAML, 画像)
```

## 重要ファイル

| ファイル | 役割 |
|---------|------|
| `client/src/store/mindMapStore.ts` | 中央ストア。ノード/エッジ CRUD、autoArrange 呼び出し |
| `client/src/utils/autoArrange.ts` | レイアウトエンジン (Force-directed + ツリー) |
| `client/src/types/index.ts` | IdeaFlowNode, IdeaFlowEdge 型定義 |
| `client/src/components/MindMapCanvas.tsx` | React Flow キャンバス本体 |
| `OVERVIEW.md` | 詳細なプロジェクト仕様書 |

## autoArrange.ts アーキテクチャ (1268行)

### レイアウトモード
- **radial**: Force-directed (バネ-反発モデル) → グループ横並び + ブリッジ上配置
- **horizontal / vertical**: BFS ツリーレイアウト

### 主要関数
| 関数 | 行 | 説明 |
|------|-----|------|
| `computeAutoLayout()` | 543 | エントリーポイント。方向に応じてレイアウト分岐 |
| `runForceSimulation()` | 352 | 共有 Force-directed シミュレーション (top-level/group 共用) |
| `computeGroupInternalLayout()` | 456 | グループ内メンバーのレイアウト |
| `buildBfsTree()` | 239 | BFS ツリー構築 |
| `placeRadially()` | 263 | 放射状初期配置 |
| `reduceCrossingsBySwap()` | 182 | エッジ交差削減 (貪欲スワップ) |
| `resolveOverlaps()` | 309 | AABB 重なり解消 |

### radial レイアウトのセクション構成 (computeAutoLayout 内)
```
1. 対象ノード決定
2. ツリー構造構築
A. グループメンバーマッピング
B. グループ内レイアウト事前計算
C. 仮想隣接グラフ構築（グループを1仮想ノードに縮約）
D. 仮想ノードサイズ
E. 連結成分の発見
F. ハブ検出（ブリッジノード優先）
G. 各連結成分を Force-directed シミュレーション
H. コンポーネント内再配置（グループ横並び + ブリッジ上配置）
H2. トップレベルのエッジ交差削減
I. ビューポートを考慮したコンポーネント配置
J. 孤立ノード配置
K. グループサイズ設定 & メンバー座標セット
L. 最終重なり解消
M. ビューポートアスペクト比補正
```

### Force-directed シミュレーション構成 (runForceSimulation)
```
(a) 反発力 (Coulomb)
(b) バネ力 (Hooke)
(c) 速度 & 位置更新
(d) 衝突解消 (AABB)
(e) 重心再センタリング
```

### 設計上の注意
- グループは仮想ノードに縮約してトップレベルシミュレーションに参加
- ハブノードは `data.isRoot` ではなくグラフ構造から自動検出
- `SimConfig` インターフェースで top-level / group のパラメータを分離
- エッジ交差削減はグループ内 + トップレベルの両方で適用

## 型定義
```typescript
type IdeaNodeData = {
  label: string; description: string; color: string; isRoot: boolean;
  treeParentId: string | null;
  aiConversation: { role: 'user' | 'assistant'; content: string }[];
  nodeType: 'idea' | 'group'; groupId: string | null;
  width: number | null; height: number | null;
};
type IdeaFlowNode = Node<IdeaNodeData, 'idea' | 'group'>;
type IdeaFlowEdge = RFEdge & { data?: { edgeType: 'tree' | 'crosslink' } };
```

## コーディング規約
- 日本語コメント推奨
- TypeScript strict モード
- Zustand ストアは楽観的 UI パターン (API + ローカル state 更新)
- React Flow の `parentId` と論理ツリー `treeParentId` は別概念
- グループ内ノードはグループローカル座標系
- 変更後は `npx tsc --noEmit --project client/tsconfig.json` でコンパイルチェック
