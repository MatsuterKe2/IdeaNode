export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface IdeaNode {
  id: string;
  projectId: string;
  parentId: string | null;
  label: string;
  description: string;
  color: string;
  isRoot: boolean;
  positionX: number;
  positionY: number;
  aiConversation: ChatMessage[];
}

export interface Edge {
  id: string;
  projectId: string;
  source: string;
  target: string;
  type: 'tree' | 'crosslink';
  label: string;
  sourceHandle: string;
  targetHandle: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIChatRequest {
  nodeId: string;
  projectId: string;
  message: string;
  context: {
    label: string;
    description: string;
    parentLabel?: string;
    siblingLabels?: string[];
  };
  history: ChatMessage[];
}
