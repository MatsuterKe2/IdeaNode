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

const EDGE_STYLE = { stroke: '#64748b' };

function toFlowNode(n: IdeaNode): IdeaFlowNode {
  return {
    id: n.id,
    type: 'idea',
    position: { x: n.positionX, y: n.positionY },
    data: {
      label: n.label,
      description: n.description,
      color: n.color,
      isRoot: n.isRoot,
      parentId: n.parentId,
      aiConversation: n.aiConversation,
    },
  };
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
  contextMenu: { x: number; y: number; nodeId: string } | null;
  setContextMenu: (menu: { x: number; y: number; nodeId: string } | null) => void;
}

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
  },

  deleteProject: async (id: string) => {
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
  },

  selectProject: async (id: string) => {
    set({ currentProjectId: id, selectedNodeId: null, chatPanelOpen: false });
    const [rawNodes, rawEdges] = await Promise.all([api.getNodes(id), api.getEdges(id)]);
    set({ nodes: rawNodes.map(toFlowNode), edges: rawEdges.map(toFlowEdge) });
  },

  onNodesChange: (changes) => {
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) }));
    // Schedule save on position changes
    const hasPositionChange = changes.some((c) => c.type === 'position' && c.dragging === false);
    if (hasPositionChange) get().scheduleSave();
  },

  onEdgesChange: (changes) => {
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) }));
  },

  addRootNode: async (x, y) => {
    const projectId = get().currentProjectId;
    if (!projectId) return;
    const node = await api.createNode(projectId, { label: 'New Idea', isRoot: true, positionX: x, positionY: y });
    set((s) => ({ nodes: [...s.nodes, toFlowNode(node)] }));
  },

  addChildNode: async (parentId) => {
    const projectId = get().currentProjectId;
    if (!projectId) return;
    const parent = get().nodes.find((n) => n.id === parentId);
    if (!parent) return;
    const x = parent.position.x + 250;
    const siblings = get().nodes.filter((n) => n.data.parentId === parentId);
    const y = parent.position.y + siblings.length * 100;

    const node = await api.createNode(projectId, { label: '', parentId, positionX: x, positionY: y });
    const edge = await api.createEdge(projectId, { source: parentId, target: node.id, type: 'tree' });
    set((s) => ({
      nodes: [...s.nodes, toFlowNode(node)],
      edges: [...s.edges, toFlowEdge(edge)],
      selectedNodeId: node.id,
    }));
  },

  addNodeFromHandle: async (parentId, handleId) => {
    const projectId = get().currentProjectId;
    if (!projectId) return;
    const parent = get().nodes.find((n) => n.id === parentId);
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

    const node = await api.createNode(projectId, { label: '', parentId, positionX: x, positionY: y });
    const edge = await api.createEdge(projectId, {
      source: parentId,
      target: node.id,
      type: 'tree',
      sourceHandle: handleId,
      targetHandle: offset.targetHandle,
    });
    set((s) => ({
      nodes: [...s.nodes, toFlowNode(node)],
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
    await api.deleteNode(id);
    // Also remove child nodes recursively
    const children = get().nodes.filter((n) => n.data.parentId === id);
    for (const child of children) {
      await get().deleteNodeById(child.id);
    }
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
      chatPanelOpen: s.selectedNodeId === id ? false : s.chatPanelOpen,
    }));
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
        })
      )
    );
  },

  setContextMenu: (menu) => set({ contextMenu: menu }),
}));
