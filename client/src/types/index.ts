import type { Node, Edge as RFEdge } from '@xyflow/react';
import type { IdeaNode } from 'shared/src/types';

export type IdeaNodeData = {
  label: string;
  description: string;
  color: string;
  isRoot: boolean;
  parentId: string | null;
  aiConversation: { role: 'user' | 'assistant'; content: string }[];
};

export type IdeaFlowNode = Node<IdeaNodeData, 'idea'>;

export type IdeaFlowEdge = RFEdge & {
  data?: {
    edgeType: 'tree' | 'crosslink';
  };
};
