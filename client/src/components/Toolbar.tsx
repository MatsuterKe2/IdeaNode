import { useState } from 'react';
import { useMindMapStore } from '../store/mindMapStore';

export default function Toolbar() {
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  const projects = useMindMapStore((s) => s.projects);
  const currentProjectId = useMindMapStore((s) => s.currentProjectId);
  const createProject = useMindMapStore((s) => s.createProject);
  const deleteProject = useMindMapStore((s) => s.deleteProject);
  const selectProject = useMindMapStore((s) => s.selectProject);

  const currentProject = projects.find((p) => p.id === currentProjectId);

  const handleCreate = async () => {
    if (!newProjectName.trim()) return;
    await createProject(newProjectName.trim());
    setNewProjectName('');
    setShowProjectMenu(false);
  };

  return (
    <div className="h-full bg-white border-b border-gray-200 flex items-center px-5 z-30 shadow-sm flex-shrink-0">
      <h1 style={{ fontSize: 36 }} className="font-bold text-gray-800 mr-5 leading-none">IdeaGraph</h1>

      <div className="relative">
        <button
          onClick={() => setShowProjectMenu(!showProjectMenu)}
          className="px-4 py-2 border border-gray-300 rounded-lg text-base hover:bg-gray-50 flex items-center gap-2"
        >
          <span>{currentProject?.name || 'プロジェクト選択'}</span>
          <span className="text-gray-400">▼</span>
        </button>

        {showProjectMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowProjectMenu(false)} />
            <div className="absolute top-full left-0 mt-1 w-72 bg-white rounded-lg shadow-xl border border-gray-200 z-50 py-1">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className={`px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 cursor-pointer ${
                    p.id === currentProjectId ? 'bg-blue-50' : ''
                  }`}
                >
                  <span
                    className="text-base flex-1 truncate"
                    onClick={() => { selectProject(p.id); setShowProjectMenu(false); }}
                  >
                    {p.name}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }}
                    className="text-gray-400 hover:text-red-500 text-sm ml-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <div className="border-t border-gray-100 mt-1 pt-1 px-4 py-2">
                <div className="flex gap-2">
                  <input
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                    placeholder="新しいプロジェクト"
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-base focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  <button
                    onClick={handleCreate}
                    className="px-4 py-1.5 bg-blue-500 text-white rounded text-base hover:bg-blue-600"
                  >
                    作成
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="ml-auto text-base text-gray-400">
        ダブルクリックでノード追加 | 右クリックでメニュー
      </div>
    </div>
  );
}
