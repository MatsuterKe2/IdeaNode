import { useState, useRef, useEffect } from 'react';
import { useMindMapStore } from '../store/mindMapStore';
import { useAIChat } from '../hooks/useAIChat';

const PRESETS = [
  { label: '深掘り', prompt: 'このアイデアをさらに深掘りしてください。具体的な側面や詳細を探ってください。' },
  { label: '関連提案', prompt: 'このアイデアに関連する新しいアイデアを3〜5個提案してください。箇条書きで簡潔にお願いします。' },
  { label: '批評', prompt: 'このアイデアのメリット、デメリット、改善案を教えてください。' },
];

export default function AIChatPanel() {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { sendMessage, loading } = useAIChat();

  const chatPanelOpen = useMindMapStore((s) => s.chatPanelOpen);
  const setChatPanelOpen = useMindMapStore((s) => s.setChatPanelOpen);
  const selectedNodeId = useMindMapStore((s) => s.selectedNodeId);
  const nodes = useMindMapStore((s) => s.nodes);
  const addChildNode = useMindMapStore((s) => s.addChildNode);
  const updateNodeLabel = useMindMapStore((s) => s.updateNodeLabel);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const conversation = selectedNode?.data.aiConversation || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  if (!chatPanelOpen || !selectedNode) return null;

  const handleSend = async (message: string) => {
    if (!message.trim() || !selectedNodeId || loading) return;
    setInput('');
    await sendMessage(selectedNodeId, message);
  };

  const handleAddSuggestionsAsNodes = async (text: string) => {
    if (!selectedNodeId) return;
    // Extract bullet points from the AI response
    const lines = text.split('\n');
    const bullets = lines
      .map((l) => l.replace(/^[\s]*[-•*\d.]+[\s.):]*/, '').trim())
      .filter((l) => l.length > 0 && l.length < 100);

    // Take unique, non-empty suggestions (max 5)
    const suggestions = [...new Set(bullets)].slice(0, 5);
    for (const suggestion of suggestions) {
      await addChildNode(selectedNodeId);
      const newNodes = useMindMapStore.getState().nodes;
      const lastNode = newNodes[newNodes.length - 1];
      if (lastNode) {
        updateNodeLabel(lastNode.id, suggestion);
      }
    }
  };

  return (
    <div className="w-[380px] flex-shrink-0 h-full bg-white border-l border-gray-200 flex flex-col shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">AI対話</h3>
          <p className="text-xs text-gray-500 truncate max-w-[250px]">{selectedNode.data.label}</p>
        </div>
        <button
          onClick={() => setChatPanelOpen(false)}
          className="text-gray-400 hover:text-gray-600 text-lg"
        >
          ✕
        </button>
      </div>

      {/* Preset actions */}
      <div className="px-4 py-2 border-b border-gray-100 flex gap-2 flex-wrap">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => handleSend(preset.prompt)}
            disabled={loading}
            className="px-3 py-1 text-xs rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50 transition-colors"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {conversation.length === 0 && (
          <div className="text-center text-gray-400 text-sm mt-8">
            AIにアイデアについて質問してみましょう
          </div>
        )}
        {conversation.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {msg.content}
              {msg.role === 'assistant' && i === conversation.length - 1 && !loading && (
                <button
                  onClick={() => handleAddSuggestionsAsNodes(msg.content)}
                  className="block mt-2 text-xs text-blue-500 hover:text-blue-700"
                >
                  💡 提案をノードに追加
                </button>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-500 px-3 py-2 rounded-lg text-sm animate-pulse">
              考え中...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-200">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input); } }}
            placeholder="質問を入力..."
            disabled={loading}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
          />
          <button
            onClick={() => handleSend(input)}
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            送信
          </button>
        </div>
      </div>
    </div>
  );
}
