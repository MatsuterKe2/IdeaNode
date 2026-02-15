import type { Node, Edge as RFEdge } from '@xyflow/react';
import type { IdeaNode } from 'shared/src/types';

export type IdeaNodeData = {
  label: string;
  description: string;
  color: string;
  isRoot: boolean;
  treeParentId: string | null;
  aiConversation: { role: 'user' | 'assistant'; content: string }[];
  nodeType: 'idea' | 'group';
  groupId: string | null;
  width: number | null;
  height: number | null;
};

export type IdeaFlowNode = Node<IdeaNodeData, 'idea' | 'group'>;

export type IdeaFlowEdge = RFEdge & {
  data?: {
    edgeType: 'tree' | 'crosslink';
  };
};
