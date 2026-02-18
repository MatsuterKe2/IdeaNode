import yaml from 'js-yaml';
import type {
  ExportStructure,
  ExportMetadata,
  ImportPlan,
  ImportNodeAction,
  ImportEdgeAction,
} from './importExportTypes';
import type { IdeaFlowNode, IdeaFlowEdge } from '../types';

/** YAML文字列を2ドキュメントにパース */
export function parseYaml(
  yamlString: string
): { structure: ExportStructure; metadata: ExportMetadata | null } {
  const documents: unknown[] = [];
  yaml.loadAll(yamlString, (doc) => {
    if (doc) documents.push(doc);
  });

  let structure: ExportStructure | null = null;
  let metadata: ExportMetadata | null = null;

  for (const doc of documents) {
    const d = doc as Record<string, unknown>;
    if (d.structure) {
      const s = d.structure as Partial<ExportStructure>;
      structure = {
        nodes: (s.nodes as ExportStructure['nodes']) || {},
        groups: (s.groups as ExportStructure['groups']) || {},
        edges: (s.edges as ExportStructure['edges']) || [],
      };
    }
    if (d.metadata) {
      const m = d.metadata as Partial<ExportMetadata>;
      metadata = {
        id_map: (m.id_map as ExportMetadata['id_map']) || {},
        positions: (m.positions as ExportMetadata['positions']) || {},
        colors: (m.colors as ExportMetadata['colors']) || {},
        edge_details: (m.edge_details as ExportMetadata['edge_details']) || {},
        ai_conversations: (m.ai_conversations as ExportMetadata['ai_conversations']) || {},
      };
    }
  }

  if (!structure) {
    throw new Error('構造ドキュメント(structure)が見つかりません');
  }

  return { structure, metadata };
}

/** インポート差分計画を構築 */
export function buildImportPlan(
  structure: ExportStructure,
  metadata: ExportMetadata | null,
  existingNodes: IdeaFlowNode[],
  existingEdges: IdeaFlowEdge[],
  mode: 'new_project' | 'merge'
): ImportPlan {
  const nodeActions: ImportNodeAction[] = [];
  const edgeActions: ImportEdgeAction[] = [];
  const groupActions: ImportNodeAction[] = [];

  const existingUuids = new Set(existingNodes.map((n) => n.id));
  const idMap = metadata?.id_map || {};

  if (mode === 'new_project') {
    // 全ノードを新規追加
    for (const [shortId, node] of Object.entries(structure.nodes)) {
      nodeActions.push({ type: 'add', shortId, label: node.label });
    }
    for (const [shortId, group] of Object.entries(structure.groups)) {
      groupActions.push({ type: 'add', shortId, label: group.label });
    }
    for (const edge of structure.edges) {
      edgeActions.push({ type: 'add', from: edge.from, to: edge.to, label: edge.label });
    }
  } else {
    // マージモード
    // ノード: UUIDが存在すれば更新、なければ追加
    for (const [shortId, node] of Object.entries(structure.nodes)) {
      const uuid = idMap[shortId];
      if (uuid && existingUuids.has(uuid)) {
        const existing = existingNodes.find((n) => n.id === uuid);
        if (existing && existing.data.label !== node.label) {
          nodeActions.push({
            type: 'update',
            shortId,
            uuid,
            label: node.label,
            oldLabel: existing.data.label,
          });
        }
      } else {
        nodeActions.push({ type: 'add', shortId, uuid, label: node.label });
      }
    }

    // グループ
    for (const [shortId, group] of Object.entries(structure.groups)) {
      const uuid = idMap[shortId];
      if (uuid && existingUuids.has(uuid)) {
        const existing = existingNodes.find((n) => n.id === uuid);
        if (existing && existing.data.label !== group.label) {
          groupActions.push({
            type: 'update',
            shortId,
            uuid,
            label: group.label,
            oldLabel: existing.data.label,
          });
        }
      } else {
        groupActions.push({ type: 'add', shortId, uuid, label: group.label });
      }
    }

    // 削除判定: 既存ノードのUUIDがid_mapに存在するのに構造に含まれていない場合
    const structureShortIds = new Set([
      ...Object.keys(structure.nodes),
      ...Object.keys(structure.groups),
    ]);
    for (const [shortId, uuid] of Object.entries(idMap)) {
      if (!structureShortIds.has(shortId) && existingUuids.has(uuid)) {
        const existing = existingNodes.find((n) => n.id === uuid);
        if (existing) {
          const isGroup = existing.type === 'group';
          const action: ImportNodeAction = {
            type: 'delete',
            shortId,
            uuid,
            label: existing.data.label,
          };
          if (isGroup) {
            groupActions.push(action);
          } else {
            nodeActions.push(action);
          }
        }
      }
    }

    // エッジ: crosslinkの差分
    for (const edge of structure.edges) {
      const fromUuid = idMap[edge.from];
      const toUuid = idMap[edge.to];
      if (fromUuid && toUuid) {
        const exists = existingEdges.some(
          (e) =>
            e.source === fromUuid &&
            e.target === toUuid &&
            e.data?.edgeType === 'crosslink'
        );
        if (!exists) {
          edgeActions.push({ type: 'add', from: edge.from, to: edge.to, label: edge.label });
        }
      } else {
        edgeActions.push({ type: 'add', from: edge.from, to: edge.to, label: edge.label });
      }
    }
  }

  return {
    nodes: nodeActions,
    edges: edgeActions,
    groups: groupActions,
    structure,
    metadata,
  };
}

/** 自動ツリーレイアウト: メタデータなしインポート時の配置計算 */
export function autoLayout(
  structure: ExportStructure
): Record<string, { x: number; y: number; width?: number; height?: number }> {
  const positions: Record<string, { x: number; y: number; width?: number; height?: number }> = {};
  const allNodeIds = Object.keys(structure.nodes);

  // 親子関係マップ構築
  const childrenMap: Record<string, string[]> = {};
  const rootNodes: string[] = [];

  for (const [id, node] of Object.entries(structure.nodes)) {
    if (node.root || !node.parent) {
      rootNodes.push(id);
    } else {
      if (!childrenMap[node.parent]) childrenMap[node.parent] = [];
      childrenMap[node.parent].push(id);
    }
  }

  // 孤立ノード（parentが参照切れ）をルートとして扱う
  for (const [id, node] of Object.entries(structure.nodes)) {
    if (node.parent && !allNodeIds.includes(node.parent) && !Object.keys(structure.groups).includes(node.parent)) {
      if (!rootNodes.includes(id)) rootNodes.push(id);
    }
  }

  if (rootNodes.length === 0 && allNodeIds.length > 0) {
    rootNodes.push(allNodeIds[0]);
  }

  const X_SPACING = 250;
  const Y_SPACING = 120;

  /** サブツリーのリーフ数を計算 */
  function countLeaves(nodeId: string): number {
    const children = childrenMap[nodeId];
    if (!children || children.length === 0) return 1;
    return children.reduce((sum, c) => sum + countLeaves(c), 0);
  }

  /** BFSでツリーを配置 */
  function layoutSubtree(nodeId: string, depth: number, yOffset: number): number {
    const children = childrenMap[nodeId];
    const x = depth * X_SPACING;

    if (!children || children.length === 0) {
      positions[nodeId] = { x, y: yOffset };
      return yOffset + Y_SPACING;
    }

    let currentY = yOffset;
    for (const child of children) {
      currentY = layoutSubtree(child, depth + 1, currentY);
    }

    // 親ノードは子供の中央に配置
    const firstChildY = positions[children[0]]?.y ?? yOffset;
    const lastChildY = positions[children[children.length - 1]]?.y ?? yOffset;
    positions[nodeId] = { x, y: (firstChildY + lastChildY) / 2 };

    return currentY;
  }

  // 各ルートのサブツリーを配置
  let currentY = 0;
  for (const rootId of rootNodes) {
    currentY = layoutSubtree(rootId, 0, currentY);
    currentY += Y_SPACING; // ルート間の追加スペース
  }

  // グループ: メンバーのバウンディングボックス + パディング
  const GROUP_PADDING = 40;
  for (const [gId, group] of Object.entries(structure.groups)) {
    const memberPositions = group.members
      .map((m) => positions[m])
      .filter((p): p is { x: number; y: number } => !!p);

    if (memberPositions.length === 0) {
      positions[gId] = { x: 0, y: currentY, width: 300, height: 200 };
      currentY += 250;
      continue;
    }

    const minX = Math.min(...memberPositions.map((p) => p.x));
    const minY = Math.min(...memberPositions.map((p) => p.y));
    const maxX = Math.max(...memberPositions.map((p) => p.x));
    const maxY = Math.max(...memberPositions.map((p) => p.y));

    const gx = minX - GROUP_PADDING;
    const gy = minY - GROUP_PADDING - 30;
    const gw = maxX - minX + 180 + GROUP_PADDING * 2;
    const gh = maxY - minY + 50 + GROUP_PADDING * 2 + 30;

    positions[gId] = { x: gx, y: gy, width: gw, height: gh };

    // メンバーをグループローカル座標に変換
    for (const mId of group.members) {
      if (positions[mId]) {
        positions[mId] = {
          x: positions[mId].x - gx,
          y: positions[mId].y - gy,
        };
      }
    }
  }

  return positions;
}

/** ファイルから読み込み */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
    reader.readAsText(file);
  });
}
