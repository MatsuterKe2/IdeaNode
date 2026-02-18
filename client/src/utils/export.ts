import yaml from 'js-yaml';
import type { IdeaFlowNode, IdeaFlowEdge } from '../types';
import type {
  ExportStructure,
  ExportMetadata,
  ExportOptions,
  ExportNodeEntry,
  ExportGroupEntry,
  ExportEdgeEntry,
} from './importExportTypes';

/** UUID → 短縮ID マッピングを構築 */
export function buildShortIdMap(
  nodes: IdeaFlowNode[],
  edges: IdeaFlowEdge[]
): { uuidToShort: Map<string, string>; shortToUuid: Map<string, string> } {
  const uuidToShort = new Map<string, string>();
  const shortToUuid = new Map<string, string>();

  let nCounter = 1;
  let gCounter = 1;

  // ノード: idea は n1, n2..., group は g1, g2...
  for (const node of nodes) {
    const isGroup = node.type === 'group';
    const shortId = isGroup ? `g${gCounter++}` : `n${nCounter++}`;
    uuidToShort.set(node.id, shortId);
    shortToUuid.set(shortId, node.id);
  }

  return { uuidToShort, shortToUuid };
}

/** 構造ドキュメントを生成 */
export function buildStructureDoc(
  nodes: IdeaFlowNode[],
  edges: IdeaFlowEdge[],
  uuidToShort: Map<string, string>
): ExportStructure {
  const structureNodes: Record<string, ExportNodeEntry> = {};
  const structureGroups: Record<string, ExportGroupEntry> = {};
  const structureEdges: ExportEdgeEntry[] = [];

  // 通常ノード
  for (const node of nodes) {
    const shortId = uuidToShort.get(node.id);
    if (!shortId) continue;

    if (node.type === 'group') {
      // グループノード
      const members = nodes
        .filter((n) => n.data.groupId === node.id)
        .map((n) => uuidToShort.get(n.id))
        .filter((id): id is string => !!id);
      structureGroups[shortId] = {
        label: node.data.label,
        members,
      };
    } else {
      // 通常ノード
      const entry: ExportNodeEntry = { label: node.data.label };
      if (node.data.isRoot) entry.root = true;
      if (node.data.treeParentId) {
        const parentShort = uuidToShort.get(node.data.treeParentId);
        if (parentShort) entry.parent = parentShort;
      }
      if (node.data.description) entry.description = node.data.description;
      structureNodes[shortId] = entry;
    }
  }

  // エッジ（crosslink のみ。tree はparent関係で表現済み）
  for (const edge of edges) {
    if (edge.data?.edgeType === 'tree') continue;
    const fromShort = uuidToShort.get(edge.source);
    const toShort = uuidToShort.get(edge.target);
    if (!fromShort || !toShort) continue;
    const edgeEntry: ExportEdgeEntry = { from: fromShort, to: toShort };
    // label を取得（React Flowのedge.labelか data から）
    if (edge.label && typeof edge.label === 'string') {
      edgeEntry.label = edge.label;
    }
    structureEdges.push(edgeEntry);
  }

  return {
    nodes: structureNodes,
    groups: structureGroups,
    edges: structureEdges,
  };
}

/** メタデータドキュメントを生成 */
export function buildMetadataDoc(
  nodes: IdeaFlowNode[],
  edges: IdeaFlowEdge[],
  uuidToShort: Map<string, string>
): ExportMetadata {
  const idMap: Record<string, string> = {};
  const positions: Record<string, { x: number; y: number; width?: number; height?: number }> = {};
  const colors: Record<string, string> = {};
  const edgeDetails: Record<number, { sourceHandle: string; targetHandle: string; type: string }> = {};
  const aiConversations: Record<string, Array<{ role: string; content: string }>> = {};

  for (const node of nodes) {
    const shortId = uuidToShort.get(node.id);
    if (!shortId) continue;

    idMap[shortId] = node.id;

    const pos: { x: number; y: number; width?: number; height?: number } = {
      x: Math.round(node.position.x),
      y: Math.round(node.position.y),
    };
    if (node.type === 'group' && node.data.width && node.data.height) {
      pos.width = node.data.width;
      pos.height = node.data.height;
    }
    positions[shortId] = pos;

    if (node.data.color) {
      colors[shortId] = node.data.color;
    }

    if (node.data.aiConversation && node.data.aiConversation.length > 0) {
      aiConversations[shortId] = node.data.aiConversation.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
    }
  }

  // crosslink エッジの詳細情報
  let edgeIndex = 0;
  for (const edge of edges) {
    if (edge.data?.edgeType === 'tree') continue;
    const fromShort = uuidToShort.get(edge.source);
    const toShort = uuidToShort.get(edge.target);
    if (!fromShort || !toShort) continue;
    edgeDetails[edgeIndex] = {
      sourceHandle: edge.sourceHandle || 'right',
      targetHandle: edge.targetHandle || 'left',
      type: edge.data?.edgeType || 'crosslink',
    };
    edgeIndex++;
  }

  return {
    id_map: idMap,
    positions,
    colors,
    edge_details: edgeDetails,
    ai_conversations: aiConversations,
  };
}

/** 選択ノードのフィルタリング */
function filterBySelection(
  nodes: IdeaFlowNode[],
  edges: IdeaFlowEdge[],
  selectedNodeIds: string[]
): { nodes: IdeaFlowNode[]; edges: IdeaFlowEdge[] } {
  const selectedSet = new Set(selectedNodeIds);

  // グループが選択されていたらメンバーも含む
  for (const node of nodes) {
    if (selectedSet.has(node.id) && node.type === 'group') {
      for (const member of nodes) {
        if (member.data.groupId === node.id) {
          selectedSet.add(member.id);
        }
      }
    }
  }

  const filteredNodes = nodes.filter((n) => selectedSet.has(n.id));
  // 両端が選択範囲内のエッジのみ
  const filteredEdges = edges.filter(
    (e) => selectedSet.has(e.source) && selectedSet.has(e.target)
  );

  return { nodes: filteredNodes, edges: filteredEdges };
}

/** YAML文字列を生成 */
export function generateYaml(
  nodes: IdeaFlowNode[],
  edges: IdeaFlowEdge[],
  projectName: string,
  options: ExportOptions
): string {
  let targetNodes = nodes;
  let targetEdges = edges;

  if (options.scope === 'selection' && options.selectedNodeIds) {
    const filtered = filterBySelection(nodes, edges, options.selectedNodeIds);
    targetNodes = filtered.nodes;
    targetEdges = filtered.edges;
  }

  const { uuidToShort } = buildShortIdMap(targetNodes, targetEdges);
  const structure = buildStructureDoc(targetNodes, targetEdges, uuidToShort);
  const metadata = buildMetadataDoc(targetNodes, targetEdges, uuidToShort);

  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  // ヘッダーコメント
  const header = [
    `# === IdeaNode Export ===`,
    `# project: "${projectName}"`,
    `# exported: ${now}`,
    `# scope: ${options.scope}`,
    '',
  ].join('\n');

  // 構造ドキュメント
  const structureYaml = yaml.dump(
    { structure },
    { lineWidth: -1, quotingType: '"', forceQuotes: false, sortKeys: false }
  );

  // メタデータドキュメント
  const metadataYaml = yaml.dump(
    { metadata },
    { lineWidth: -1, quotingType: '"', forceQuotes: false, sortKeys: false }
  );

  return `${header}${structureYaml}\n---\n\n${metadataYaml}`;
}

/** YAMLをダウンロード */
export function downloadYaml(yamlContent: string, projectName: string): void {
  const blob = new Blob([yamlContent], { type: 'text/yaml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${projectName || 'ideanode-export'}.yaml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
