import { useRef, useEffect } from 'react';
import { useMindMapStore } from '../store/mindMapStore';

const COLORS = [
  // Row 1: 高彩度・基本色相 (0°→330°+ 無彩色)
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b',
  '#8b5cf6', '#ec4899', '#06b6d4', '#64748b',
  // Row 2: 色相ギャップ埋め + アーストーン + ダークバリエーション
  '#ea580c', '#65a30d', '#0d9488', '#4f46e5',
  '#d946ef', '#92400e', '#be185d', '#1e293b',
];

export default function NodeContextMenu() {
  const colorInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const contextMenu = useMindMapStore((s) => s.contextMenu);
  const setContextMenu = useMindMapStore((s) => s.setContextMenu);
  const addChildNode = useMindMapStore((s) => s.addChildNode);
  const deleteNodeById = useMindMapStore((s) => s.deleteNodeById);
  const updateNodeColor = useMindMapStore((s) => s.updateNodeColor);
  const setSelectedNodeId = useMindMapStore((s) => s.setSelectedNodeId);
  const groupSelectedNodes = useMindMapStore((s) => s.groupSelectedNodes);
  const ungroupNodes = useMindMapStore((s) => s.ungroupNodes);
  const removeNodeFromGroup = useMindMapStore((s) => s.removeNodeFromGroup);
  const nodes = useMindMapStore((s) => s.nodes);

  useEffect(() => {
    if (!contextMenu) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [contextMenu, setContextMenu]);

  if (!contextMenu) return null;

  const { x, y, nodeId, selectedNodeIds } = contextMenu;
  const node = nodes.find((n) => n.id === nodeId);
  const isGroup = node?.data.nodeType === 'group';
  const isInGroup = !!node?.data.groupId;
  const hasMultiSelection = selectedNodeIds && selectedNodeIds.length >= 2;
  const currentColor = node?.data.color || '#3b82f6';

  const handleAction = (action: () => void) => {
    action();
    setContextMenu(null);
  };

  return (
      <div
        ref={menuRef}
        className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[180px]"
        style={{ left: x, top: y }}
      >
        {/* 複数選択時: グループ化 */}
        {hasMultiSelection && (
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
            onClick={() => handleAction(() => groupSelectedNodes(selectedNodeIds))}
          >
            <span>📦</span> グループ化
            <span className="ml-auto text-xs text-gray-400">Ctrl+G</span>
          </button>
        )}

        {/* グループノードの場合: グループ解除 */}
        {isGroup && (
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
            onClick={() => handleAction(() => ungroupNodes(nodeId))}
          >
            <span>📤</span> グループ解除
            <span className="ml-auto text-xs text-gray-400">Ctrl+Shift+G</span>
          </button>
        )}

        {/* グループ内ノードの場合: グループから外す */}
        {isInGroup && !isGroup && (
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
            onClick={() => handleAction(() => removeNodeFromGroup(nodeId))}
          >
            <span>↗</span> グループから外す
          </button>
        )}

        {(hasMultiSelection || isGroup || isInGroup) && (
          <div className="border-t border-gray-100 my-1" />
        )}

        <button
          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
          onClick={() => handleAction(() => addChildNode(nodeId))}
        >
          <span>+</span> 子ノード追加
        </button>
        <button
          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
          onClick={() => handleAction(() => setSelectedNodeId(nodeId))}
        >
          <span>💬</span> AIと対話
        </button>
        <div className="border-t border-gray-100 my-1" />
        <div className="px-4 py-2">
          <div className="text-xs text-gray-500 mb-1.5">色を変更</div>
          <div className="grid grid-cols-9 gap-1.5 items-center">
            {COLORS.map((color) => (
              <button
                key={color}
                className={`w-5 h-5 rounded-full border-2 hover:scale-125 transition-transform ${
                  currentColor === color ? 'border-gray-800 scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: color, boxShadow: '0 0 0 1px rgba(0,0,0,0.1)' }}
                onClick={() => handleAction(() => updateNodeColor(nodeId, color))}
              />
            ))}
            {/* カスタムカラーピッカー */}
            <button
              className="w-5 h-5 rounded-full border-2 border-dashed border-gray-300 hover:scale-125 hover:border-gray-500 transition-all flex items-center justify-center"
              style={{
                background: `conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)`,
              }}
              onClick={() => colorInputRef.current?.click()}
              title="カスタムカラー"
            />
            <input
              ref={colorInputRef}
              type="color"
              value={currentColor}
              className="sr-only"
              onChange={(e) => {
                updateNodeColor(nodeId, e.target.value);
              }}
              onBlur={() => setContextMenu(null)}
            />
          </div>
        </div>
        <div className="border-t border-gray-100 my-1" />
        <button
          className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
          onClick={() => handleAction(() => deleteNodeById(nodeId))}
        >
          <span>🗑</span> 削除
        </button>
      </div>
  );
}
