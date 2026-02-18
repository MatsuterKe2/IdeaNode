import type { Project, IdeaNode, Edge, AIChatRequest } from 'shared/src/types';

const BASE = '/api';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// Projects
export const getProjects = () => fetch(`${BASE}/projects`).then(r => json<Project[]>(r));
export const createProject = (name: string) =>
  fetch(`${BASE}/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }).then(r => json<Project>(r));
export const deleteProject = (id: string) =>
  fetch(`${BASE}/projects/${id}`, { method: 'DELETE' }).then(r => json<any>(r));
export const updateProject = (id: string, name: string) =>
  fetch(`${BASE}/projects/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }).then(r => json<Project>(r));

// Nodes
export const getNodes = (projectId: string) =>
  fetch(`${BASE}/projects/${projectId}/nodes`).then(r => json<IdeaNode[]>(r));
export const createNode = (projectId: string, node: Partial<IdeaNode>) =>
  fetch(`${BASE}/projects/${projectId}/nodes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(node) }).then(r => json<IdeaNode>(r));
export const updateNode = (id: string, data: Partial<IdeaNode>) =>
  fetch(`${BASE}/nodes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => json<IdeaNode>(r));
export const deleteNode = (id: string) =>
  fetch(`${BASE}/nodes/${id}`, { method: 'DELETE' }).then(r => json<any>(r));

// Edges
export const getEdges = (projectId: string) =>
  fetch(`${BASE}/projects/${projectId}/edges`).then(r => json<Edge[]>(r));
export const createEdge = (projectId: string, edge: Partial<Edge>) =>
  fetch(`${BASE}/projects/${projectId}/edges`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(edge) }).then(r => json<Edge>(r));
export const updateEdge = (id: string, data: Partial<Edge>) =>
  fetch(`${BASE}/edges/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => json<Edge>(r));
export const deleteEdge = (id: string) =>
  fetch(`${BASE}/edges/${id}`, { method: 'DELETE' }).then(r => json<any>(r));

// AI Chat (SSE)
export async function* streamAIChat(req: AIChatRequest): AsyncGenerator<string> {
  const res = await fetch(`${BASE}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`AI API error: ${res.status}`);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop()!;
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.text) yield parsed.text;
        } catch (e) {
          if (e instanceof Error && e.message !== 'Unexpected end of JSON input') throw e;
        }
      }
    }
  }
}
