import { useState, useCallback } from 'react';
import { streamAIChat } from '../api/client';
import { useMindMapStore } from '../store/mindMapStore';
import type { ChatMessage } from 'shared/src/types';

export function useAIChat() {
  const [loading, setLoading] = useState(false);
  const nodes = useMindMapStore((s) => s.nodes);
  const edges = useMindMapStore((s) => s.edges);
  const currentProjectId = useMindMapStore((s) => s.currentProjectId);
  const updateNodeConversation = useMindMapStore((s) => s.updateNodeConversation);

  const sendMessage = useCallback(
    async (nodeId: string, message: string) => {
      if (!currentProjectId) return;
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const parentNode = node.data.parentId
        ? nodes.find((n) => n.id === node.data.parentId)
        : null;

      const siblingIds = edges
        .filter((e) => e.source === node.data.parentId && e.target !== nodeId)
        .map((e) => e.target);
      const siblingLabels = nodes
        .filter((n) => siblingIds.includes(n.id))
        .map((n) => n.data.label);

      const history = node.data.aiConversation || [];
      const newHistory: ChatMessage[] = [...history, { role: 'user', content: message }];
      updateNodeConversation(nodeId, newHistory);

      setLoading(true);
      let assistantText = '';

      try {
        const stream = streamAIChat({
          nodeId,
          projectId: currentProjectId,
          message,
          context: {
            label: node.data.label,
            description: node.data.description,
            parentLabel: parentNode?.data.label,
            siblingLabels,
          },
          history,
        });

        for await (const chunk of stream) {
          assistantText += chunk;
          updateNodeConversation(nodeId, [
            ...newHistory,
            { role: 'assistant', content: assistantText },
          ]);
        }
      } catch (err: any) {
        assistantText = `Error: ${err.message}`;
        updateNodeConversation(nodeId, [
          ...newHistory,
          { role: 'assistant', content: assistantText },
        ]);
      } finally {
        setLoading(false);
      }

      return assistantText;
    },
    [nodes, edges, currentProjectId, updateNodeConversation]
  );

  return { sendMessage, loading };
}
