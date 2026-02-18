import { useState, useRef } from 'react';
import { useMindMapStore } from '../store/mindMapStore';
import { parseYaml, buildImportPlan, readFileAsText } from '../utils/import';
import type { ImportPlan, ImportMode } from '../utils/importExportTypes';

interface Props {
  open: boolean;
  onClose: () => void;
  initialMode: 'file' | 'text';
}

export default function ImportPreviewDialog({ open, onClose, initialMode }: Props) {
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [textInput, setTextInput] = useState('');
  const [mode, setMode] = useState<ImportMode>('new_project');
  const [projectName, setProjectName] = useState('');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const nodes = useMindMapStore((s) => s.nodes);
  const edges = useMindMapStore((s) => s.edges);
  const importNodes = useMindMapStore((s) => s.importNodes);
  const currentProjectId = useMindMapStore((s) => s.currentProjectId);

  const reset = () => {
    setStep('input');
    setTextInput('');
    setMode('new_project');
    setProjectName('');
    setPlan(null);
    setError(null);
    setImporting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const processYaml = (yamlString: string) => {
    try {
      setError(null);
      const { structure, metadata } = parseYaml(yamlString);
      const importPlan = buildImportPlan(structure, metadata, nodes, edges, mode);
      setPlan(importPlan);
      setStep('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'YAMLの解析に失敗しました');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      setTextInput(text);
      processYaml(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ファイルの読み込みに失敗しました');
    }
  };

  const handleTextSubmit = () => {
    if (!textInput.trim()) return;
    processYaml(textInput);
  };

  const handleImport = async () => {
    if (!plan) return;
    setImporting(true);
    try {
      await importNodes(
        plan.structure,
        plan.metadata,
        mode,
        mode === 'new_project' ? (projectName || 'インポート') : undefined
      );
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'インポートに失敗しました');
      setImporting(false);
    }
  };

  if (!open) return null;

  const addCount = plan ? plan.nodes.filter((n) => n.type === 'add').length + plan.groups.filter((g) => g.type === 'add').length : 0;
  const updateCount = plan ? plan.nodes.filter((n) => n.type === 'update').length + plan.groups.filter((g) => g.type === 'update').length : 0;
  const deleteCount = plan ? plan.nodes.filter((n) => n.type === 'delete').length + plan.groups.filter((g) => g.type === 'delete').length : 0;
  const edgeAddCount = plan ? plan.edges.filter((e) => e.type === 'add').length : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-[560px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">
            {step === 'input' ? 'インポート' : 'インポートプレビュー'}
          </h2>
          <button
            onClick={handleClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {step === 'input' && (
            <>
              {/* モード選択 */}
              <div className="mb-4">
                <label className="text-sm font-medium text-gray-700 mb-2 block">インポート先</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="mode"
                      checked={mode === 'new_project'}
                      onChange={() => setMode('new_project')}
                      className="accent-blue-500"
                    />
                    <span className="text-sm text-gray-700">新規プロジェクト</span>
                  </label>
                  <label className={`flex items-center gap-2 ${currentProjectId ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                    <input
                      type="radio"
                      name="mode"
                      checked={mode === 'merge'}
                      onChange={() => setMode('merge')}
                      disabled={!currentProjectId}
                      className="accent-blue-500"
                    />
                    <span className="text-sm text-gray-700">現在のプロジェクトにマージ</span>
                  </label>
                </div>
              </div>

              {mode === 'new_project' && (
                <div className="mb-4">
                  <label className="text-sm font-medium text-gray-700 mb-1 block">プロジェクト名</label>
                  <input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="インポート"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              )}

              {/* ファイル入力 or テキスト入力 */}
              {initialMode === 'file' ? (
                <div className="mb-4">
                  <label className="text-sm font-medium text-gray-700 mb-1 block">YAMLファイル</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".yaml,.yml,.txt"
                    onChange={handleFileSelect}
                    className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  {textInput && (
                    <div className="mt-2 text-xs text-gray-500">
                      {textInput.split('\n').length} 行読み込み済み
                    </div>
                  )}
                </div>
              ) : (
                <div className="mb-4">
                  <label className="text-sm font-medium text-gray-700 mb-1 block">YAMLテキスト</label>
                  <textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder={`structure:\n  nodes:\n    n1:\n      label: "アイデア"\n      root: true`}
                    className="w-full h-48 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-400 resize-y"
                  />
                  <button
                    onClick={handleTextSubmit}
                    disabled={!textInput.trim()}
                    className="mt-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    解析
                  </button>
                </div>
              )}
            </>
          )}

          {step === 'preview' && plan && (
            <>
              {/* サマリー */}
              <div className="mb-4 flex gap-3">
                {addCount > 0 && (
                  <span className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm font-medium">
                    +{addCount} 追加
                  </span>
                )}
                {updateCount > 0 && (
                  <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
                    ~{updateCount} 更新
                  </span>
                )}
                {deleteCount > 0 && (
                  <span className="px-3 py-1 bg-red-50 text-red-700 rounded-full text-sm font-medium">
                    -{deleteCount} 削除
                  </span>
                )}
                {edgeAddCount > 0 && (
                  <span className="px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-sm font-medium">
                    +{edgeAddCount} エッジ
                  </span>
                )}
              </div>

              {/* 詳細リスト */}
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {plan.groups.map((action, i) => (
                  <div key={`g-${i}`} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded bg-gray-50">
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                      action.type === 'add' ? 'bg-green-100 text-green-700' :
                      action.type === 'update' ? 'bg-blue-100 text-blue-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {action.type === 'add' ? '追加' : action.type === 'update' ? '更新' : '削除'}
                    </span>
                    <span className="text-gray-400 text-xs">[G]</span>
                    <span className="text-gray-800 truncate">{action.label}</span>
                    {action.type === 'update' && action.oldLabel && (
                      <span className="text-gray-400 text-xs">← {action.oldLabel}</span>
                    )}
                  </div>
                ))}
                {plan.nodes.map((action, i) => (
                  <div key={`n-${i}`} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded bg-gray-50">
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                      action.type === 'add' ? 'bg-green-100 text-green-700' :
                      action.type === 'update' ? 'bg-blue-100 text-blue-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {action.type === 'add' ? '追加' : action.type === 'update' ? '更新' : '削除'}
                    </span>
                    <span className="text-gray-800 truncate">{action.label}</span>
                    {action.type === 'update' && action.oldLabel && (
                      <span className="text-gray-400 text-xs">← {action.oldLabel}</span>
                    )}
                  </div>
                ))}
                {plan.edges.map((action, i) => (
                  <div key={`e-${i}`} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded bg-gray-50">
                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                      エッジ
                    </span>
                    <span className="text-gray-800 truncate">
                      {action.from} → {action.to}
                      {action.label && ` (${action.label})`}
                    </span>
                  </div>
                ))}
              </div>

              {!plan.metadata && (
                <div className="mt-3 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700">
                  メタデータなし: 座標は自動レイアウトで配置されます
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200">
          {step === 'preview' && (
            <button
              onClick={() => { setStep('input'); setPlan(null); setError(null); }}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              戻る
            </button>
          )}
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            キャンセル
          </button>
          {step === 'preview' && plan && (
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-5 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
            >
              {importing ? 'インポート中...' : 'インポート実行'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
