import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import type { IdeaFlowNode } from '../types';
import { useMindMapStore } from '../store/mindMapStore';

function GroupNode({ id, data, selected }: NodeProps<IdeaFlowNode>) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(data.label);
  const inputRef = useRef<HTMLInputElement>(null);
  const updateNodeLabel = useMindMapStore((s) => s.updateNodeLabel);
  const setContextMenu = useMindMapStore((s) => s.setContextMenu);
  const addNodeFromHandle = useMindMapStore((s) => s.addNodeFromHandle);
  const updateGroupSize = useMindMapStore((s) => s.updateGroupSize);

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
    updateNodeLabel(id, editValue || 'グループ');
  }, [id, editValue, updateNodeLabel]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(true);
    setEditValue(data.label);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const state = useMindMapStore.getState();
    const selectedIds = state.nodes.filter((n) => n.selected).map((n) => n.id);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      nodeId: id,
      selectedNodeIds: selectedIds.length > 1 ? selectedIds : undefined,
    });
  };

  const handleResizeEnd = useCallback((_event: unknown, params: { width: number; height: number }) => {
    updateGroupSize(id, params.width, params.height);
  }, [id, updateGroupSize]);

  const handleHandleDoubleClick = useCallback((handleId: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    addNodeFromHandle(id, handleId);
  }, [id, addNodeFromHandle]);

  const color = data.color || '#3b82f6';

  return (
    <div
      className={`group-node ${selected ? 'group-node--selected' : ''}`}
      style={{
        '--node-color': color,
        width: '100%',
        height: '100%',
        background: `${color}12`,
        borderColor: color,
      } as React.CSSProperties}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      <NodeResizer
        color="transparent"
        handleStyle={{ opacity: 0 }}
        lineStyle={{ borderColor: 'transparent' }}
        isVisible={true}
        minWidth={150}
        minHeight={100}
        onResizeEnd={handleResizeEnd}
      />

      {/* 4方向ハンドル */}
      <Handle type="source" position={Position.Top} id="top"
        isConnectableStart isConnectableEnd onDoubleClick={handleHandleDoubleClick('top')} />
      <Handle type="source" position={Position.Bottom} id="bottom"
        isConnectableStart isConnectableEnd onDoubleClick={handleHandleDoubleClick('bottom')} />
      <Handle type="source" position={Position.Left} id="left"
        isConnectableStart isConnectableEnd onDoubleClick={handleHandleDoubleClick('left')} />
      <Handle type="source" position={Position.Right} id="right"
        isConnectableStart isConnectableEnd onDoubleClick={handleHandleDoubleClick('right')} />

      {/* ヘッダー */}
      <div className="group-node__header" onDoubleClick={handleDoubleClick}>
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
            className="group-node__input"
          />
        ) : (
          <span className="group-node__label">
            {data.label || 'グループ'}
          </span>
        )}
      </div>
    </div>
  );
}

export default memo(GroupNode);
