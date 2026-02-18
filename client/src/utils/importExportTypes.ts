// === 構造ドキュメントの型 ===

export interface ExportNodeEntry {
  label: string;
  root?: boolean;
  parent?: string;
  description?: string;
}

export interface ExportGroupEntry {
  label: string;
  members: string[];
}

export interface ExportEdgeEntry {
  from: string;
  to: string;
  label?: string;
}

export interface ExportStructure {
  nodes: Record<string, ExportNodeEntry>;
  groups: Record<string, ExportGroupEntry>;
  edges: ExportEdgeEntry[];
}

// === メタデータドキュメントの型 ===

export interface ExportPosition {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface ExportMetadata {
  id_map: Record<string, string>;  // shortId → UUID
  positions: Record<string, ExportPosition>;
  colors: Record<string, string>;
  edge_details: Record<number, { sourceHandle: string; targetHandle: string; type: string }>;
  ai_conversations: Record<string, Array<{ role: string; content: string }>>;
}

// === エクスポートオプション ===

export interface ExportOptions {
  scope: 'project' | 'selection';
  selectedNodeIds?: string[];
  includeMetadata?: boolean;
}

// === インポート用の型 ===

export type ImportMode = 'new_project' | 'merge';

export interface ImportNodeAction {
  type: 'add' | 'update' | 'delete';
  shortId: string;
  uuid?: string;
  label: string;
  oldLabel?: string;
}

export interface ImportEdgeAction {
  type: 'add' | 'delete';
  from: string;
  to: string;
  label?: string;
}

export interface ImportPlan {
  nodes: ImportNodeAction[];
  edges: ImportEdgeAction[];
  groups: ImportNodeAction[];
  structure: ExportStructure;
  metadata: ExportMetadata | null;
}
