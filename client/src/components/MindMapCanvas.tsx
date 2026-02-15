import { useCallback, useRef, useState } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  ConnectionMode,
  SelectionMode,
  type Connection,
  type Edge,
  type NodeMouseHandler,
  type OnNodeDrag,
  type OnReconnect,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import IdeaNode from './IdeaNode';
import GroupNode from './GroupNode';
import DeletableEdge from './DeletableEdge';
import TrashDropZone, { type TrashDropZoneHandle } from './TrashDropZone';
import { useMindMapStore } from '../store/mindMapStore';

const nodeTypes = { idea: IdeaNode, group: GroupNode };
const edgeTypes = { deletable: DeletableEdge };

export default function MindMapCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const edgeReconnectSuccessful = useRef(true);
  const { screenToFlowPosition } = useReactFlow();
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const trashRef = useRef<TrashDropZoneHandle>(null);

  const nodes = useMindMapStore((s) => s.nodes);
  const edges = useMindMapStore((s) => s.edges);
  const onNodesChange = useMindMapStore((s) => s.onNodesChange);
  const onEdgesChange = useMindMapStore((s) => s.onEdgesChange);
  const addRootNode = useMindMapStore((s) => s.addRootNode);
  const addCrossLink = useMindMapStore((s) => s.addCrossLink);
  const setSelectedNodeId = useMindMapStore((s) => s.setSelectedNodeId);
  const setContextMenu = useMindMapStore((s) => s.setContextMenu);
  const deleteEdgeById = useMindMapStore((s) => s.deleteEdgeById);
  const reconnectEdgeInStore = useMindMapStore((s) => s.reconnectEdge);
  const setSelectedEdgeId = useMindMapStore((s) => s.setSelectedEdgeId);
  const currentProjectId = useMindMapStore((s) => s.currentProjectId);

  // ダブルクリックで空白にノード作成
  const handlePaneDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      if (!currentProjectId) return;
      const target = event.target as HTMLElement;
      if (target.closest('.react-flow__controls') || target.closest('.react-flow__node') || target.closest('.react-flow__edge')) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addRootNode(position.x, position.y);
    },
    [screenToFlowPosition, addRootNode, currentProjectId]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      addCrossLink(connection);
    },
    [addCrossLink]
  );

  // エッジクリック: 選択済みなら削除、未選択なら選択
  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      const state = useMindMapStore.getState();
      if (state.selectedEdgeId === edge.id) {
        // 2回目クリック → 削除
        deleteEdgeById(edge.id);
        setSelectedEdgeId(null);
      } else {
        setSelectedEdgeId(edge.id);
      }
      setContextMenu(null);
    },
    [deleteEdgeById, setSelectedEdgeId, setContextMenu]
  );

  // 空白クリックで選択解除
  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setContextMenu(null);
  }, [setSelectedNodeId, setSelectedEdgeId, setContextMenu]);

  // ノードクリックで確実に選択
  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      setSelectedNodeId(node.id);
      setContextMenu(null);
    },
    [setSelectedNodeId, setContextMenu]
  );

  // ノードドラッグでゴミ箱表示
  const handleNodeDragStart: OnNodeDrag = useCallback((_event, node) => {
    setDraggingNodeId(node.id);
  }, []);

  const handleNodeDrag: OnNodeDrag = useCallback(() => {
    const el = document.querySelector('[data-trash-zone]');
    if (!el) return;
    const trashRect = el.getBoundingClientRect();
    // 選択中ノード（またはドラッグ中ノード）のいずれかがゴミ箱と重なっているか判定
    const state = useMindMapStore.getState();
    const selectedNodes = state.nodes.filter((n) => n.selected);
    let over = false;
    for (const n of selectedNodes) {
      const nodeEl = document.querySelector(`[data-id="${n.id}"]`) as HTMLElement | null;
      if (nodeEl) {
        const nr = nodeEl.getBoundingClientRect();
        if (nr.right >= trashRect.left && nr.left <= trashRect.right &&
            nr.bottom >= trashRect.top && nr.top <= trashRect.bottom) {
          over = true;
          break;
        }
      }
    }
    trashRef.current?.setHovering(over);
  }, []);

  const handleNodeDragStop: OnNodeDrag = useCallback((_event, node) => {
    // 選択中のノードを全て取得（ドラッグ中のノード含む）
    const state = useMindMapStore.getState();
    const selectedIds = state.nodes
      .filter((n) => n.selected)
      .map((n) => n.id);
    // ドラッグ中のノードが選択に含まれていなければ単独で渡す
    const targetIds = selectedIds.length > 0 && selectedIds.includes(node.id)
      ? selectedIds
      : [node.id];
    const dropped = trashRef.current?.checkDrop(targetIds);
    if (!dropped) {
      setDraggingNodeId(null);

      // グループへのドロップ判定（単一ノード、グループでないノード、まだグループに属していない場合）
      if (targetIds.length === 1 && node.type !== 'group' && !node.parentId) {
        const draggedNodeEl = document.querySelector(`[data-id="${node.id}"]`) as HTMLElement | null;
        if (draggedNodeEl) {
          const draggedRect = draggedNodeEl.getBoundingClientRect();
          const draggedCenter = {
            x: draggedRect.left + draggedRect.width / 2,
            y: draggedRect.top + draggedRect.height / 2,
          };

          // グループノードの上にドロップしたか判定
          for (const groupNode of state.nodes) {
            if (groupNode.type !== 'group' || groupNode.id === node.id) continue;
            const groupEl = document.querySelector(`[data-id="${groupNode.id}"]`) as HTMLElement | null;
            if (groupEl) {
              const groupRect = groupEl.getBoundingClientRect();
              if (draggedCenter.x >= groupRect.left && draggedCenter.x <= groupRect.right &&
                  draggedCenter.y >= groupRect.top && draggedCenter.y <= groupRect.bottom) {
                state.addNodeToGroup(node.id, groupNode.id);
                break;
              }
            }
          }
        }
      }
    } else {
      setTimeout(() => setDraggingNodeId(null), 400);
    }
  }, []);

  // エッジ付け替え開始
  const handleReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
  }, []);

  // エッジを別のノードに付け替え成功
  const handleReconnect: OnReconnect = useCallback(
    (oldEdge, newConnection) => {
      edgeReconnectSuccessful.current = true;
      reconnectEdgeInStore(oldEdge.id, newConnection);
    },
    [reconnectEdgeInStore]
  );

  // 何もないところでドロップ → エッジ削除
  const handleReconnectEnd = useCallback(
    (_event: MouseEvent | TouchEvent, edge: Edge) => {
      if (!edgeReconnectSuccessful.current) {
        deleteEdgeById(edge.id);
      }
      edgeReconnectSuccessful.current = true;
    },
    [deleteEdgeById]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const state = useMindMapStore.getState();

      // Ctrl+G: グループ化
      if ((event.ctrlKey || event.metaKey) && event.key === 'g' && !event.shiftKey) {
        event.preventDefault();
        const selectedIds = state.nodes.filter((n) => n.selected).map((n) => n.id);
        if (selectedIds.length >= 2) {
          state.groupSelectedNodes(selectedIds);
        }
        return;
      }

      // Ctrl+Shift+G: グループ解除
      if ((event.ctrlKey || event.metaKey) && event.key === 'G' && event.shiftKey) {
        event.preventDefault();
        if (state.selectedNodeId) {
          const selectedNode = state.nodes.find((n) => n.id === state.selectedNodeId);
          if (selectedNode?.data.nodeType === 'group') {
            state.ungroupNodes(state.selectedNodeId);
          }
        }
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (state.selectedEdgeId) {
          state.deleteEdgeById(state.selectedEdgeId);
          state.setSelectedEdgeId(null);
        } else if (state.selectedNodeId) {
          state.deleteNodeById(state.selectedNodeId);
        }
      }
      if (event.key === 'Tab' && state.selectedNodeId) {
        event.preventDefault();
        state.addChildNode(state.selectedNodeId);
      }
    },
    []
  );

  // isValidConnection: グループ内ノード↔所属グループ間のエッジを禁止
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (connection.source === connection.target) return false;
      const state = useMindMapStore.getState();
      const sourceNode = state.nodes.find((n) => n.id === connection.source);
      const targetNode = state.nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return false;

      // グループ内ノード↔所属グループ間のエッジを禁止
      if (sourceNode.data.groupId === connection.target) return false;
      if (targetNode.data.groupId === connection.source) return false;

      return true;
    },
    []
  );

  // シングルクリックでノード追加
  const handleAddNodeButton = useCallback(() => {
    if (!currentProjectId) return;
    const wrapper = reactFlowWrapper.current;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const position = screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
    addRootNode(position.x, position.y);
  }, [currentProjectId, screenToFlowPosition, addRootNode]);

  if (!currentProjectId) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', color: '#9ca3af', fontSize: 16 }}>
        プロジェクトを選択または作成してください
      </div>
    );
  }

  return (
    <div ref={reactFlowWrapper} style={{ width: '100%', height: '100%' }} onKeyDown={handleKeyDown} tabIndex={0}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onPaneClick={handlePaneClick}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onDoubleClick={handlePaneDoubleClick}
        onNodeDragStart={handleNodeDragStart}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        onReconnect={handleReconnect}
        onReconnectStart={handleReconnectStart}
        onReconnectEnd={handleReconnectEnd}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultViewport={{ x: 0, y: 0, zoom: 1.2 }}
        fitView={nodes.length > 0}
        fitViewOptions={{ padding: 0.4, maxZoom: 1.5, minZoom: 0.5 }}
        minZoom={0.3}
        maxZoom={2}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={20}
        connectOnClick={false}
        isValidConnection={isValidConnection}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        panOnDrag={[1]}
        deleteKeyCode={null}
        zoomOnDoubleClick={false}
        edgesReconnectable
        className="bg-gray-50"
      >
        <Controls position="bottom-left" />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
      </ReactFlow>

      <button
        onClick={handleAddNodeButton}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 bg-white border border-gray-300 rounded-full shadow-md text-lg text-gray-600 hover:bg-gray-50 hover:shadow-lg transition-all flex items-center gap-2 z-20"
      >
        <span className="text-blue-500 font-bold text-xl leading-none">+</span>
        ノードを追加
      </button>

      <TrashDropZone ref={trashRef} active={!!draggingNodeId} />
    </div>
  );
}
