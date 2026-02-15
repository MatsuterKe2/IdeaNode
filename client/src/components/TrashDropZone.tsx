import { useRef, forwardRef, useImperativeHandle, useState } from 'react';
import { useMindMapStore } from '../store/mindMapStore';

export interface TrashDropZoneHandle {
  checkDrop: (nodeIds: string[]) => boolean;
  setHovering: (v: boolean) => void;
}

const TrashDropZone = forwardRef<TrashDropZoneHandle, { active: boolean }>(
  (_props, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [hovering, setHoveringState] = useState(false);
    const deleteNodeById = useMindMapStore((s) => s.deleteNodeById);
    const chatPanelOpen = useMindMapStore((s) => s.chatPanelOpen);

    useImperativeHandle(ref, () => ({
      checkDrop(nodeIds: string[]) {
        const el = containerRef.current;
        if (!el) return false;

        // グループノードはゴミ箱で削除しない
        const state = useMindMapStore.getState();
        const filteredIds = nodeIds.filter((nid) => {
          const node = state.nodes.find((n) => n.id === nid);
          return node?.type !== 'group';
        });
        if (filteredIds.length === 0) return false;

        const trashRect = el.getBoundingClientRect();
        // いずれかのノードがゴミ箱と重なっているか判定
        let anyOverlap = false;
        for (const nid of filteredIds) {
          const nodeEl = document.querySelector(`[data-id="${nid}"]`) as HTMLElement | null;
          if (nodeEl) {
            const nr = nodeEl.getBoundingClientRect();
            if (nr.right >= trashRect.left && nr.left <= trashRect.right &&
                nr.bottom >= trashRect.top && nr.top <= trashRect.bottom) {
              anyOverlap = true;
              break;
            }
          }
        }
        if (anyOverlap) {
          const nodeIdSet = new Set(filteredIds);

          // 各ノードについてその場で中心に向かって縮小するアニメーション
          for (const nodeId of filteredIds) {
            const nodeEl = document.querySelector(`[data-id="${nodeId}"]`) as HTMLElement | null;
            if (nodeEl) {
              const nodeRect = nodeEl.getBoundingClientRect();
              const cx = nodeRect.left + nodeRect.width / 2;
              const cy = nodeRect.top + nodeRect.height / 2;
              // 元ノードを即非表示
              nodeEl.style.opacity = '0';
              // ノードの見た目を模したシンプルなdivを作成
              const ghost = document.createElement('div');
              const inner = nodeEl.querySelector('.idea-node') as HTMLElement | null;
              const bg = inner ? getComputedStyle(inner).backgroundColor : '#fff';
              const border = inner ? getComputedStyle(inner).border : '2px solid #3b82f6';
              Object.assign(ghost.style, {
                position: 'fixed',
                left: `${cx}px`,
                top: `${cy}px`,
                width: `${nodeRect.width}px`,
                height: `${nodeRect.height}px`,
                background: bg,
                border: border,
                borderRadius: '12px',
                opacity: '1',
                zIndex: '9999',
                pointerEvents: 'none',
                transform: 'translate(-50%, -50%) scale(1)',
              });
              document.body.appendChild(ghost);
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  ghost.style.transition = 'transform 0.4s ease-in, opacity 0.4s ease-in';
                  ghost.style.transform = 'translate(-50%, -50%) scale(0)';
                  ghost.style.opacity = '0';
                });
              });
              setTimeout(() => ghost.remove(), 500);
            }
          }

          // 関連エッジをフェードアウトしてから削除
          const store = useMindMapStore.getState();
          const connectedEdges = store.edges.filter(
            (e) => nodeIdSet.has(e.source) || nodeIdSet.has(e.target)
          );
          for (const edge of connectedEdges) {
            const edgeEl = document.querySelector(`[data-testid="rf__edge-${edge.id}"]`) as HTMLElement | null;
            if (edgeEl) {
              edgeEl.style.transition = 'opacity 0.3s linear';
              edgeEl.style.opacity = '0';
            }
          }
          setTimeout(() => {
            for (const edge of connectedEdges) {
              store.deleteEdgeById(edge.id);
            }
          }, 300);
          setTimeout(() => {
            for (const nodeId of filteredIds) {
              deleteNodeById(nodeId);
            }
            setHoveringState(false);
          }, 420);
          return true;
        }
        return false;
      },
      setHovering(v: boolean) {
        setHoveringState(v);
      },
    }));

    return (
      <div
        ref={containerRef}
        data-trash-zone
        className={`absolute z-30 flex items-center justify-center rounded-2xl border-2 transition-transform duration-200 border-gray-200 bg-white shadow-md ${
          hovering ? 'scale-110' : 'scale-100'
        }`}
        style={{ width: 64, height: 64, bottom: 68, right: chatPanelOpen ? 88 + 380 : 88, transition: 'right 0.2s ease' }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ef4444"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-colors duration-200"
        >
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
      </div>
    );
  }
);

export default TrashDropZone;
