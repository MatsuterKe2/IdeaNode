import { useMindMapStore } from '../store/mindMapStore';

const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];

export default function NodeContextMenu() {
  const contextMenu = useMindMapStore((s) => s.contextMenu);
  const setContextMenu = useMindMapStore((s) => s.setContextMenu);
  const addChildNode = useMindMapStore((s) => s.addChildNode);
  const deleteNodeById = useMindMapStore((s) => s.deleteNodeById);
  const updateNodeColor = useMindMapStore((s) => s.updateNodeColor);
  const setSelectedNodeId = useMindMapStore((s) => s.setSelectedNodeId);

  if (!contextMenu) return null;

  const { x, y, nodeId } = contextMenu;

  const handleAction = (action: () => void) => {
    action();
    setContextMenu(null);
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
      <div
        className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[180px]"
        style={{ left: x, top: y }}
      >
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
          <div className="text-xs text-gray-500 mb-1">色を変更</div>
          <div className="flex gap-1 flex-wrap">
            {COLORS.map((color) => (
              <button
                key={color}
                className="w-5 h-5 rounded-full border border-gray-300 hover:scale-110 transition-transform"
                style={{ backgroundColor: color }}
                onClick={() => handleAction(() => updateNodeColor(nodeId, color))}
              />
            ))}
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
    </>
  );
}
