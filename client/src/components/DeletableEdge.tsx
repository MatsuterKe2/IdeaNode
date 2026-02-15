import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';
import { useMindMapStore } from '../store/mindMapStore';

export default function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  selected,
}: EdgeProps) {
  const selectedEdgeId = useMindMapStore((s) => s.selectedEdgeId);
  const isSelected = selected || id === selectedEdgeId;

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <BaseEdge
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        ...style,
        ...(isSelected ? { stroke: '#ef4444' } : {}),
      }}
    />
  );
}
