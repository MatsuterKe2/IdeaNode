import { create } from 'zustand';
import {
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@xyflow/react';
import type { IdeaFlowNode, IdeaFlowEdge } from '../types';
import type { Project, ChatMessage, IdeaNode, Edge } from 'shared/src/types';
import * as api from '../api/client';
import type { ExportStructure, ExportMetadata } from '../utils/importExportTypes';
import { autoLayout } from '../utils/import';
import { computeAutoLayout, type ArrangeOptions } from '../utils/autoArrange';

const EDGE_STYLE = { stroke: '#64748b' };

function toFlowNode(n: IdeaNode): IdeaFlowNode {
  const isGroup = n.nodeType === 'group';
  return {
    id: n.id,
    type: isGroup ? 'group' : 'idea',
    position: { x: n.positionX, y: n.positionY },
    ...(isGroup && n.width && n.height ? { style: { width: n.width, height: n.height } } : {}),
    ...(n.groupId ? { parentId: n.groupId, extent: 'parent' as const } : {}),
    data: {
      label: n.label,
      description: n.description,
      color: n.color,
      isRoot: n.isRoot,
      treeParentId: n.treeParentId,
      aiConversation: n.aiConversation,
      nodeType: n.nodeType || 'idea',
      groupId: n.groupId || null,
      width: n.width || null,
      height: n.height || null,
    },
  };
}

/** 新規ノードにアニメーション用クラスを付与し、完了後にステートから除去 */
const _newNodeIds = new Set<string>();
function withNewAnimation(node: IdeaFlowNode, storeGet: () => MindMapState, storeSet: (fn: (s: MindMapState) => Partial<MindMapState>) => void): IdeaFlowNode {
  _newNodeIds.add(node.id);
  setTimeout(() => {
    _newNodeIds.delete(node.id);
    storeSet((s) => ({
      nodes: s.nodes.map((n) => n.id === node.id ? { ...n, className: undefined } : n),
    }));
  }, 300);
  return { ...node, className: 'node-new' };
}

/** グループノードを先、通常ノードを後に並べる */
function sortNodes(nodes: IdeaFlowNode[]): IdeaFlowNode[] {
  return [...nodes].sort((a, b) => {
    const aIsGroup = a.type === 'group' ? 0 : 1;
    const bIsGroup = b.type === 'group' ? 0 : 1;
    return aIsGroup - bIsGroup;
  });
}

function toFlowEdge(e: Edge): IdeaFlowEdge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle || 'right',
    targetHandle: e.targetHandle || 'left',
    type: 'deletable',
    style: EDGE_STYLE,
    data: { edgeType: e.type },
  };
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface MindMapState {
  // Project
  projects: Project[];
  currentProjectId: string | null;
  loadProjects: () => Promise<void>;
  createProject: (name: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  selectProject: (id: string) => Promise<void>;

  // Nodes & Edges
  nodes: IdeaFlowNode[];
  edges: IdeaFlowEdge[];
  onNodesChange: (changes: NodeChange<IdeaFlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<IdeaFlowEdge>[]) => void;

  // Actions
  addRootNode: (x: number, y: number) => Promise<void>;
  addChildNode: (parentId: string) => Promise<void>;
  addNodeFromHandle: (parentId: string, handleId: string) => Promise<void>;
  addCrossLink: (connection: Connection) => Promise<void>;
  updateNodeLabel: (id: string, label: string) => void;
  updateNodeColor: (id: string, color: string) => void;
  deleteNodeById: (id: string) => Promise<void>;
  deleteEdgeById: (id: string) => Promise<void>;
  reconnectEdge: (edgeId: string, newConnection: Connection) => Promise<void>;

  // Selection
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  selectedEdgeId: string | null;
  setSelectedEdgeId: (id: string | null) => void;

  // AI Chat
  chatPanelOpen: boolean;
  setChatPanelOpen: (open: boolean) => void;
  updateNodeConversation: (nodeId: string, conversation: ChatMessage[]) => void;

  // Save
  saveTimeout: ReturnType<typeof setTimeout> | null;
  scheduleSave: () => void;
  saveAll: () => Promise<void>;

  // Context menu
  contextMenu: { x: number; y: number; nodeId: string; selectedNodeIds?: string[] } | null;
  setContextMenu: (menu: { x: number; y: number; nodeId: string; selectedNodeIds?: string[] } | null) => void;

  // Auto arrange
  autoArrange: (options: ArrangeOptions) => Promise<void>;

  // Group actions
  groupSelectedNodes: (selectedNodeIds: string[]) => Promise<void>;
  ungroupNodes: (groupId: string) => Promise<void>;
  removeNodeFromGroup: (nodeId: string) => Promise<void>;
  addNodeToGroup: (nodeId: string, groupId: string) => Promise<void>;
  updateGroupSize: (id: string, width: number, height: number) => void;

  // Import/Export
  importNodes: (
    structure: ExportStructure,
    metadata: ExportMetadata | null,
    mode: 'new_project' | 'merge',
    projectName?: string
  ) => Promise<void>;

  // Toast
  toasts: Toast[];
  fitViewTrigger: number;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
}

let toastCounter = 0;

export const useMindMapStore = create<MindMapState>((set, get) => ({
  projects: [],
  currentProjectId: null,
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  chatPanelOpen: false,
  saveTimeout: null,
  contextMenu: null,
  toasts: [],
  fitViewTrigger: 0,

  loadProjects: async () => {
    const projects = await api.getProjects();
    set({ projects });
    if (projects.length > 0 && !get().currentProjectId) {
      await get().selectProject(projects[0].id);
    }
  },

  createProject: async (name: string) => {
    const project = await api.createProject(name);
    set((s) => ({ projects: [project, ...s.projects], currentProjectId: project.id, nodes: [], edges: [] }));
    get().addToast(`プロジェクト「${name}」を作成しました`, 'success');
  },

  deleteProject: async (id: string) => {
    const projectName = get().projects.find((p) => p.id === id)?.name;
    await api.deleteProject(id);
    const projects = get().projects.filter((p) => p.id !== id);
    set({ projects });
    if (get().currentProjectId === id) {
      if (projects.length > 0) {
        await get().selectProject(projects[0].id);
      } else {
        set({ currentProjectId: null, nodes: [], edges: [] });
      }
    }
    get().addToast(`プロジェクト「${projectName}」を削除しました`, 'info');
  },

  selectProject: async (id: string) => {
    set({ currentProjectId: id, selectedNodeId: null, chatPanelOpen: false });
    const [rawNodes, rawEdges] = await Promise.all([api.getNodes(id), api.getEdges(id)]);
    set((s) => ({ nodes: sortNodes(rawNodes.map(toFlowNode)), edges: rawEdges.map(toFlowEdge), fitViewTrigger: s.fitViewTrigger + 1 }));
  },

  onNodesChange: (changes) => {
    let newNodes = applyNodeChanges(changes, get().nodes);

    // 範囲選択でグループと子ノードが同時選択された場合、グループを選択解除
    const hasSelectionChange = changes.some((c) => c.type === 'select');
    if (hasSelectionChange) {
      const selectedIds = new Set(newNodes.filter((n) => n.selected).map((n) => n.id));
      const groupsToDeselect = new Set<string>();
      for (const node of newNodes) {
        if (node.selected && node.data.groupId && selectedIds.has(node.data.groupId)) {
          groupsToDeselect.add(node.data.groupId);
        }
      }
      if (groupsToDeselect.size > 0) {
        newNodes = newNodes.map((n) =>
          groupsToDeselect.has(n.id) ? { ...n, selected: false } : n
        );
      }
    }

    set({ nodes: newNodes });
    // Schedule save on position changes
    const hasPositionChange = changes.some((c) => c.type === 'position' && c.dragging === false);
    if (hasPositionChange) get().scheduleSave();
  },

  onEdgesChange: (changes) => {
    // エッジの選択はReact Flowに任せず selectedEdgeId で管理する
    const filtered = changes.filter((c) => c.type !== 'select');
    set((s) => ({ edges: applyEdgeChanges(filtered, s.edges) }));
  },

  addRootNode: async (x, y) => {
    const projectId = get().currentProjectId;
    if (!projectId) return;
    const node = await api.createNode(projectId, { label: 'New Idea', isRoot: true, positionX: x, positionY: y });
    set((s) => ({ nodes: sortNodes([...s.nodes, withNewAnimation(toFlowNode(node), get, set)]) }));
  },

  addChildNode: async (treeParentId) => {
    const projectId = get().currentProjectId;
    if (!projectId) return;
    const parent = get().nodes.find((n) => n.id === treeParentId);
    if (!parent) return;

    // グループの場合、グループ内にもポジション計算
    const parentPos = parent.position;
    const x = parentPos.x + 250;
    const siblings = get().nodes.filter((n) => n.data.treeParentId === treeParentId);
    const y = parentPos.y + siblings.length * 100;

    const node = await api.createNode(projectId, { label: '', treeParentId, positionX: x, positionY: y });
    const edge = await api.createEdge(projectId, { source: treeParentId, target: node.id, type: 'tree' });
    set((s) => ({
      nodes: sortNodes([...s.nodes, withNewAnimation(toFlowNode(node), get, set)]),
      edges: [...s.edges, toFlowEdge(edge)],
      selectedNodeId: node.id,
    }));
  },

  addNodeFromHandle: async (treeParentId, handleId) => {
    const projectId = get().currentProjectId;
    if (!projectId) return;
    const parent = get().nodes.find((n) => n.id === treeParentId);
    if (!parent) return;

    const offsetMap: Record<string, { dx: number; dy: number; targetHandle: string }> = {
      right:  { dx: 250,  dy: 0,    targetHandle: 'left' },
      left:   { dx: -250, dy: 0,    targetHandle: 'right' },
      bottom: { dx: 0,    dy: 150,  targetHandle: 'top' },
      top:    { dx: 0,    dy: -150, targetHandle: 'bottom' },
    };
    const offset = offsetMap[handleId] || offsetMap.right;
    const x = parent.position.x + offset.dx;
    const y = parent.position.y + offset.dy;

    const node = await api.createNode(projectId, { label: '', treeParentId, positionX: x, positionY: y });
    const edge = await api.createEdge(projectId, {
      source: treeParentId,
      target: node.id,
      type: 'tree',
      sourceHandle: handleId,
      targetHandle: offset.targetHandle,
    });
    set((s) => ({
      nodes: sortNodes([...s.nodes, withNewAnimation(toFlowNode(node), get, set)]),
      edges: [...s.edges, toFlowEdge(edge)],
      selectedNodeId: node.id,
    }));
  },

  addCrossLink: async (connection) => {
    const projectId = get().currentProjectId;
    if (!projectId || !connection.source || !connection.target) return;
    const existing = get().edges.find(
      (e) => e.source === connection.source && e.target === connection.target
    );
    if (existing) return;

    const edge = await api.createEdge(projectId, {
      source: connection.source,
      target: connection.target,
      type: 'crosslink',
      sourceHandle: connection.sourceHandle || 'right',
      targetHandle: connection.targetHandle || 'left',
    });
    set((s) => ({ edges: [...s.edges, toFlowEdge(edge)] }));
  },

  updateNodeLabel: (id, label) => {
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n)),
    }));
    get().scheduleSave();
  },

  updateNodeColor: (id, color) => {
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, color } } : n)),
    }));
    get().scheduleSave();
  },

  deleteNodeById: async (id) => {
    const node = get().nodes.find((n) => n.id === id);

    // グループ削除時: メンバーノードはグループから外す（残す）
    if (node?.data.nodeType === 'group') {
      const members = get().nodes.filter((n) => n.data.groupId === id);
      for (const member of members) {
        // グローバル座標に変換
        const globalX = (node.position.x || 0) + member.position.x;
        const globalY = (node.position.y || 0) + member.position.y;
        await api.updateNode(member.id, { groupId: null, positionX: globalX, positionY: globalY });
      }
      // メンバーノードのローカル状態を更新
      set((s) => ({
        nodes: s.nodes.map((n) => {
          if (n.data.groupId === id) {
            const globalX = (node.position.x || 0) + n.position.x;
            const globalY = (node.position.y || 0) + n.position.y;
            return {
              ...n,
              position: { x: globalX, y: globalY },
              parentId: undefined,
              extent: undefined,
              data: { ...n.data, groupId: null },
            };
          }
          return n;
        }),
      }));
    }

    await api.deleteNode(id);
    // Also remove child nodes recursively
    const children = get().nodes.filter((n) => n.data.treeParentId === id);
    for (const child of children) {
      await get().deleteNodeById(child.id);
    }
    set((s) => ({
      nodes: sortNodes(s.nodes.filter((n) => n.id !== id)),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
      chatPanelOpen: s.selectedNodeId === id ? false : s.chatPanelOpen,
    }));
    get().addToast('ノードを削除しました', 'info');
  },

  deleteEdgeById: async (id) => {
    await api.deleteEdge(id);
    set((s) => ({ edges: s.edges.filter((e) => e.id !== id) }));
  },

  reconnectEdge: async (edgeId, newConnection) => {
    const projectId = get().currentProjectId;
    if (!projectId || !newConnection.source || !newConnection.target) return;
    const oldEdge = get().edges.find((e) => e.id === edgeId);
    if (!oldEdge) return;
    // Delete old edge, create new one
    await api.deleteEdge(edgeId);
    const edgeType = oldEdge.data?.edgeType || 'tree';
    const newEdge = await api.createEdge(projectId, {
      source: newConnection.source,
      target: newConnection.target,
      type: edgeType,
      sourceHandle: newConnection.sourceHandle || 'right',
      targetHandle: newConnection.targetHandle || 'left',
    });
    set((s) => ({
      edges: [...s.edges.filter((e) => e.id !== edgeId), toFlowEdge(newEdge)],
    }));
  },

  setSelectedNodeId: (id) => {
    set({ selectedNodeId: id, selectedEdgeId: null, chatPanelOpen: id !== null });
  },

  setSelectedEdgeId: (id) => {
    set({ selectedEdgeId: id, selectedNodeId: id ? null : get().selectedNodeId });
  },

  setChatPanelOpen: (open) => set({ chatPanelOpen: open }),

  updateNodeConversation: (nodeId, conversation) => {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, aiConversation: conversation } } : n
      ),
    }));
    // Save conversation to backend
    api.updateNode(nodeId, { aiConversation: conversation });
  },

  scheduleSave: () => {
    const existing = get().saveTimeout;
    if (existing) clearTimeout(existing);
    const timeout = setTimeout(() => get().saveAll(), 500);
    set({ saveTimeout: timeout });
  },

  saveAll: async () => {
    const { nodes, currentProjectId } = get();
    if (!currentProjectId) return;
    await Promise.all(
      nodes.map((n) =>
        api.updateNode(n.id, {
          label: n.data.label,
          description: n.data.description,
          color: n.data.color,
          positionX: n.position.x,
          positionY: n.position.y,
          ...(n.data.nodeType === 'group' ? {
            width: n.data.width,
            height: n.data.height,
          } : {}),
        })
      )
    );
  },

  setContextMenu: (menu) => set({ contextMenu: menu }),

  // Auto arrange
  autoArrange: async (options) => {
    const { nodes, edges } = get();
    const optionsWithViewport = {
      ...options,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
    const result = computeAutoLayout(nodes, edges, optionsWithViewport);

    // ローカルstate更新（位置 + サイズ + 色）
    set((s) => ({
      nodes: sortNodes(s.nodes.map((n) => {
        const newPos = result.positions.get(n.id);
        const newSize = result.groupSizes.get(n.id);
        const newColor = result.nodeColors.get(n.id);
        if (!newPos && !newSize && !newColor) return n;
        return {
          ...n,
          ...(newPos ? { position: newPos } : {}),
          ...(newSize ? { style: { ...n.style, width: newSize.width, height: newSize.height } } : {}),
          data: {
            ...n.data,
            ...(newSize ? { width: newSize.width, height: newSize.height } : {}),
            ...(newColor ? { color: newColor } : {}),
          },
        };
      })),
      edges: s.edges.map((e) => {
        const newHandles = result.edgeHandles.get(e.id);
        if (!newHandles) return e;
        return { ...e, sourceHandle: newHandles.sourceHandle, targetHandle: newHandles.targetHandle };
      }),
    }));

    // バックエンドに永続化
    const updatePromises: Promise<any>[] = [];
    const updatedNodeIds = new Set<string>();
    for (const [nodeId, pos] of result.positions) {
      const node = get().nodes.find((n) => n.id === nodeId);
      const newSize = result.groupSizes.get(nodeId);
      const newColor = result.nodeColors.get(nodeId);
      updatedNodeIds.add(nodeId);
      updatePromises.push(api.updateNode(nodeId, {
        positionX: pos.x,
        positionY: pos.y,
        ...(newSize && node?.data.nodeType === 'group' ? { width: newSize.width, height: newSize.height } : {}),
        ...(newColor ? { color: newColor } : {}),
      }));
    }
    // 位置変更なしだが色だけ変更されたノード
    for (const [nodeId, color] of result.nodeColors) {
      if (!updatedNodeIds.has(nodeId)) {
        updatePromises.push(api.updateNode(nodeId, { color }));
      }
    }
    for (const [edgeId, handles] of result.edgeHandles) {
      updatePromises.push(api.updateEdge(edgeId, {
        sourceHandle: handles.sourceHandle,
        targetHandle: handles.targetHandle,
      }));
    }
    await Promise.all(updatePromises);

    const count = result.positions.size;
    get().addToast(`${count}個のノードを自動整列しました`, 'success');
    set((s) => ({ fitViewTrigger: s.fitViewTrigger + 1 }));
  },

  // Group actions
  groupSelectedNodes: async (selectedNodeIds: string[]) => {
    const projectId = get().currentProjectId;
    if (!projectId || selectedNodeIds.length < 2) return;

    const selectedNodes = get().nodes.filter((n) => selectedNodeIds.includes(n.id));
    if (selectedNodes.length < 2) return;

    // グループ化できないノードを除外（既にグループのノード）
    const validNodes = selectedNodes.filter((n) => n.data.nodeType !== 'group');
    if (validNodes.length < 2) return;

    // バウンディングボックス計算
    const padding = 40;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of validNodes) {
      const nodeEl = document.querySelector(`[data-id="${n.id}"]`) as HTMLElement | null;
      const w = nodeEl?.offsetWidth || 180;
      const h = nodeEl?.offsetHeight || 50;
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + w);
      maxY = Math.max(maxY, n.position.y + h);
    }

    const groupX = minX - padding;
    const groupY = minY - padding - 30; // 30px for header
    const groupWidth = maxX - minX + padding * 2;
    const groupHeight = maxY - minY + padding * 2 + 30;

    // API: グループノード作成
    const groupNode = await api.createNode(projectId, {
      label: 'グループ',
      nodeType: 'group',
      positionX: groupX,
      positionY: groupY,
      width: groupWidth,
      height: groupHeight,
    });

    // 各メンバーノードの groupId を更新 + 座標変換（グローバル→ローカル）
    for (const n of validNodes) {
      const localX = n.position.x - groupX;
      const localY = n.position.y - groupY;
      await api.updateNode(n.id, { groupId: groupNode.id, positionX: localX, positionY: localY });
    }

    // ローカル状態更新
    const validNodeIds = new Set(validNodes.map((n) => n.id));
    set((s) => {
      const updatedNodes = s.nodes.map((n) => {
        if (validNodeIds.has(n.id)) {
          return {
            ...n,
            position: { x: n.position.x - groupX, y: n.position.y - groupY },
            parentId: groupNode.id,
            extent: 'parent' as const,
            data: { ...n.data, groupId: groupNode.id },
          };
        }
        return n;
      });
      return { nodes: sortNodes([...updatedNodes, toFlowNode(groupNode)]) };
    });

    get().addToast(`${validNodes.length}個のノードをグループ化しました`, 'success');
  },

  ungroupNodes: async (groupId: string) => {
    const groupNode = get().nodes.find((n) => n.id === groupId);
    if (!groupNode) return;

    const members = get().nodes.filter((n) => n.data.groupId === groupId);

    // メンバーの座標をグローバルに戻す + groupId を null に
    for (const m of members) {
      const globalX = groupNode.position.x + m.position.x;
      const globalY = groupNode.position.y + m.position.y;
      await api.updateNode(m.id, { groupId: null, positionX: globalX, positionY: globalY });
    }

    // グループノード削除
    await api.deleteNode(groupId);

    // ローカル状態更新
    set((s) => {
      const updatedNodes = s.nodes
        .filter((n) => n.id !== groupId)
        .map((n) => {
          if (n.data.groupId === groupId) {
            return {
              ...n,
              position: {
                x: groupNode.position.x + n.position.x,
                y: groupNode.position.y + n.position.y,
              },
              parentId: undefined,
              extent: undefined,
              data: { ...n.data, groupId: null },
            };
          }
          return n;
        });
      return {
        nodes: sortNodes(updatedNodes),
        edges: s.edges.filter((e) => e.source !== groupId && e.target !== groupId),
      };
    });

    get().addToast('グループを解除しました', 'info');
  },

  removeNodeFromGroup: async (nodeId: string) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node || !node.data.groupId) return;

    const groupNode = get().nodes.find((n) => n.id === node.data.groupId);
    if (!groupNode) return;

    const globalX = groupNode.position.x + node.position.x;
    const globalY = groupNode.position.y + node.position.y;

    await api.updateNode(nodeId, { groupId: null, positionX: globalX, positionY: globalY });

    set((s) => ({
      nodes: sortNodes(s.nodes.map((n) => {
        if (n.id === nodeId) {
          return {
            ...n,
            position: { x: globalX, y: globalY },
            parentId: undefined,
            extent: undefined,
            data: { ...n.data, groupId: null },
          };
        }
        return n;
      })),
    }));

    get().addToast('ノードをグループから外しました', 'info');
  },

  addNodeToGroup: async (nodeId: string, groupId: string) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    const groupNode = get().nodes.find((n) => n.id === groupId);
    if (!node || !groupNode || node.data.nodeType === 'group') return;

    const localX = node.position.x - groupNode.position.x;
    const localY = node.position.y - groupNode.position.y;

    await api.updateNode(nodeId, { groupId, positionX: localX, positionY: localY });

    set((s) => ({
      nodes: sortNodes(s.nodes.map((n) => {
        if (n.id === nodeId) {
          return {
            ...n,
            position: { x: localX, y: localY },
            parentId: groupId,
            extent: 'parent' as const,
            data: { ...n.data, groupId },
          };
        }
        return n;
      })),
    }));

    get().addToast('ノードをグループに追加しました', 'success');
  },

  updateGroupSize: (id: string, width: number, height: number) => {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, width, height } } : n
      ),
    }));
    api.updateNode(id, { width, height });
  },

  // Import/Export
  importNodes: async (structure, metadata, mode, projectName) => {
    let projectId = get().currentProjectId;

    if (mode === 'new_project') {
      const name = projectName || 'インポート';
      const project = await api.createProject(name);
      set((s) => ({ projects: [project, ...s.projects], currentProjectId: project.id, nodes: [], edges: [] }));
      projectId = project.id;
    }

    if (!projectId) return;

    // ポジション計算: メタデータがあればそこから、なければ自動レイアウト
    const positions = metadata?.positions || autoLayout(structure);
    const colors = metadata?.colors || {};
    const conversations = metadata?.ai_conversations || {};
    const edgeDetails = metadata?.edge_details || {};

    // 短縮ID → 新UUID マッピング
    const shortToUuid = new Map<string, string>();

    // id_mapがあればUUID復元を試みる（マージ時）
    if (metadata?.id_map && mode === 'merge') {
      for (const [shortId, uuid] of Object.entries(metadata.id_map)) {
        shortToUuid.set(shortId, uuid);
      }
    }

    // グループノードを先に作成
    for (const [shortId, group] of Object.entries(structure.groups)) {
      const existingUuid = shortToUuid.get(shortId);
      const existingNode = existingUuid ? get().nodes.find((n) => n.id === existingUuid) : null;
      const pos = positions[shortId] || { x: 0, y: 0 };

      if (existingNode && mode === 'merge') {
        // 既存グループを更新
        await api.updateNode(existingNode.id, { label: group.label });
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === existingNode.id ? { ...n, data: { ...n.data, label: group.label } } : n
          ),
        }));
      } else {
        // 新規グループ作成
        const node = await api.createNode(projectId, {
          label: group.label,
          nodeType: 'group',
          positionX: pos.x,
          positionY: pos.y,
          width: pos.width || 300,
          height: pos.height || 200,
          color: colors[shortId] || '#8b5cf6',
        });
        shortToUuid.set(shortId, node.id);
        set((s) => ({ nodes: sortNodes([...s.nodes, toFlowNode(node)]) }));
      }
    }

    // 通常ノードを作成（親ノードが先に存在する必要があるので、ルートから順に処理）
    const nodeEntries = Object.entries(structure.nodes);
    const created = new Set<string>();
    const createNode = async (shortId: string, nodeData: typeof structure.nodes[string]) => {
      if (created.has(shortId)) return;
      created.add(shortId);

      // 親が構造内にいるなら先に作成
      if (nodeData.parent && structure.nodes[nodeData.parent] && !created.has(nodeData.parent)) {
        await createNode(nodeData.parent, structure.nodes[nodeData.parent]);
      }

      const existingUuid = shortToUuid.get(shortId);
      const existingNode = existingUuid ? get().nodes.find((n) => n.id === existingUuid) : null;
      const pos = positions[shortId] || { x: 0, y: 0 };

      if (existingNode && mode === 'merge') {
        // 既存ノードを更新
        const updates: Partial<IdeaNode> = { label: nodeData.label };
        if (nodeData.description !== undefined) updates.description = nodeData.description;
        await api.updateNode(existingNode.id, updates);
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === existingNode.id
              ? { ...n, data: { ...n.data, label: nodeData.label, ...(nodeData.description !== undefined ? { description: nodeData.description } : {}) } }
              : n
          ),
        }));
      } else {
        // 新規ノード作成
        const treeParentId = nodeData.parent ? (shortToUuid.get(nodeData.parent) || null) : null;
        // グループ所属確認
        let groupId: string | null = null;
        for (const [gId, group] of Object.entries(structure.groups)) {
          if (group.members.includes(shortId)) {
            groupId = shortToUuid.get(gId) || null;
            break;
          }
        }

        const conv = conversations[shortId];
        const node = await api.createNode(projectId, {
          label: nodeData.label,
          description: nodeData.description || '',
          isRoot: nodeData.root || false,
          positionX: pos.x,
          positionY: pos.y,
          treeParentId,
          color: colors[shortId] || '#3b82f6',
          groupId,
          ...(conv ? { aiConversation: conv as { role: 'user' | 'assistant'; content: string }[] } : {}),
        });
        shortToUuid.set(shortId, node.id);
        set((s) => ({ nodes: sortNodes([...s.nodes, toFlowNode(node)]) }));

        // 親がある場合はtreeエッジを作成
        if (treeParentId) {
          const edge = await api.createEdge(projectId, {
            source: treeParentId,
            target: node.id,
            type: 'tree',
            sourceHandle: 'right',
            targetHandle: 'left',
          });
          set((s) => ({ edges: [...s.edges, toFlowEdge(edge)] }));
        }
      }
    };

    for (const [shortId, nodeData] of nodeEntries) {
      await createNode(shortId, nodeData);
    }

    // Crosslink エッジを作成
    for (let i = 0; i < structure.edges.length; i++) {
      const edgeDef = structure.edges[i];
      const sourceUuid = shortToUuid.get(edgeDef.from);
      const targetUuid = shortToUuid.get(edgeDef.to);
      if (!sourceUuid || !targetUuid) continue;

      // 既存チェック（マージ時）
      if (mode === 'merge') {
        const exists = get().edges.some(
          (e) => e.source === sourceUuid && e.target === targetUuid
        );
        if (exists) continue;
      }

      const detail = edgeDetails[i];
      const edge = await api.createEdge(projectId, {
        source: sourceUuid,
        target: targetUuid,
        type: 'crosslink',
        sourceHandle: detail?.sourceHandle || 'right',
        targetHandle: detail?.targetHandle || 'left',
      });
      set((s) => ({ edges: [...s.edges, toFlowEdge(edge)] }));
    }

    // 削除処理（マージモードで、id_mapに含まれるがstructureにないノード）
    if (mode === 'merge' && metadata?.id_map) {
      const structureIds = new Set([
        ...Object.keys(structure.nodes),
        ...Object.keys(structure.groups),
      ]);
      for (const [shortId, uuid] of Object.entries(metadata.id_map)) {
        if (!structureIds.has(shortId)) {
          const existing = get().nodes.find((n) => n.id === uuid);
          if (existing) {
            await api.deleteNode(uuid);
            set((s) => ({
              nodes: sortNodes(s.nodes.filter((n) => n.id !== uuid)),
              edges: s.edges.filter((e) => e.source !== uuid && e.target !== uuid),
            }));
          }
        }
      }
    }

    const totalNodes = Object.keys(structure.nodes).length + Object.keys(structure.groups).length;
    get().addToast(`${totalNodes}個のノードをインポートしました`, 'success');
  },

  // Toast
  addToast: (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = `toast-${++toastCounter}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => get().removeToast(id), 3000);
  },

  removeToast: (id: string) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));
