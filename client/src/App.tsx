import { useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import MindMapCanvas from './components/MindMapCanvas';
import AIChatPanel from './components/AIChatPanel';
import Toolbar from './components/Toolbar';
import NodeContextMenu from './components/NodeContextMenu';
import ToastContainer from './components/ToastContainer';
import { useMindMapStore } from './store/mindMapStore';

export default function App() {
  const loadProjects = useMindMapStore((s) => s.loadProjects);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ height: 56, flexShrink: 0 }}>
        <Toolbar />
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <ReactFlowProvider>
          <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
            <MindMapCanvas />
          </div>
        </ReactFlowProvider>
        <AIChatPanel />
      </div>

      <NodeContextMenu />
      <ToastContainer />
    </div>
  );
}
