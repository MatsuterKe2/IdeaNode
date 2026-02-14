import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { IdeaFlowNode } from '../types';
import { useMindMapStore } from '../store/mindMapStore';

function IdeaNode({ id, data, selected }: NodeProps<IdeaFlowNode>) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(data.label);
  const inputRef = useRef<HTMLInputElement>(null);
  const updateNodeLabel = useMindMapStore((s) => s.updateNodeLabel);
  const setContextMenu = useMindMapStore((s) => s.setContextMenu);
  const addNodeFromHandle = useMindMapStore((s) => s.addNodeFromHandle);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    setEditValue(data.label);
  }, [data.label]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    updateNodeLabel(id, editValue || 'Untitled');
  }, [id, editValue, updateNodeLabel]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(true);
    setEditValue(data.label);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId: id });
  };

  const handleHandleDoubleClick = useCallback((handleId: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    addNodeFromHandle(id, handleId);
  }, [id, addNodeFromHandle]);

  const color = data.color || '#3b82f6';

  return (
    <div
      className={`idea-node relative rounded-xl transition-shadow duration-150 ${
        selected ? 'shadow-lg idea-node--selected' : 'shadow-sm hover:shadow-md'
      }`}
      style={{
        background: selected ? color : '#fff',
        border: selected ? `3px solid ${color}` : `2px solid ${color}`,
        outline: selected ? '3px solid #fff' : 'none',
        outlineOffset: '-6px',
        minWidth: 140,
        maxWidth: 280,
        '--node-color': color,
      } as React.CSSProperties}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      {/* 4方向ハンドル — source兼targetで接続開始も受け入れも可能 */}
      <Handle type="source" position={Position.Top} id="top"
        isConnectableStart isConnectableEnd onDoubleClick={handleHandleDoubleClick('top')} />
      <Handle type="source" position={Position.Bottom} id="bottom"
        isConnectableStart isConnectableEnd onDoubleClick={handleHandleDoubleClick('bottom')} />
      <Handle type="source" position={Position.Left} id="left"
        isConnectableStart isConnectableEnd onDoubleClick={handleHandleDoubleClick('left')} />
      <Handle type="source" position={Position.Right} id="right"
        isConnectableStart isConnectableEnd onDoubleClick={handleHandleDoubleClick('right')} />

      <div className="px-5 py-3">
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit();
              if (e.key === 'Escape') { setEditing(false); setEditValue(data.label); }
            }}
            className="w-full border-none outline-none bg-transparent font-medium text-center"
            style={{ color: selected ? '#fff' : '#1e293b', fontSize: 18 }}
          />
        ) : (
          <div
            className="font-medium text-center truncate"
            style={{ color: selected ? '#fff' : '#1e293b', fontSize: 18 }}
          >
            {data.label || 'Untitled'}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(IdeaNode);
