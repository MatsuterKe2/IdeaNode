import { Hono } from 'hono';
import { v4 as uuid } from 'uuid';
import db from '../db/connection';

const app = new Hono();

// Get all nodes for a project
app.get('/projects/:projectId/nodes', (c) => {
  const { projectId } = c.req.param();
  const rows = db.prepare('SELECT * FROM nodes WHERE project_id = ?').all(projectId);
  return c.json(rows.map(formatNode));
});

// Create a node
app.post('/projects/:projectId/nodes', async (c) => {
  const { projectId } = c.req.param();
  const body = await c.req.json();
  const id = body.id || uuid();
  db.prepare(`
    INSERT INTO nodes (id, project_id, parent_id, label, description, color, is_root, position_x, position_y, ai_conversation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, projectId, body.parentId ?? null, body.label ?? '', body.description ?? '',
    body.color ?? '#3b82f6', body.isRoot ? 1 : 0, body.positionX ?? 0, body.positionY ?? 0,
    JSON.stringify(body.aiConversation ?? [])
  );
  updateProjectTimestamp(projectId);
  const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(id);
  return c.json(formatNode(node), 201);
});

// Update a node
app.patch('/nodes/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const existing = db.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as any;
  if (!existing) return c.json({ error: 'Not found' }, 404);

  const updates: string[] = [];
  const values: any[] = [];

  if (body.label !== undefined) { updates.push('label = ?'); values.push(body.label); }
  if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description); }
  if (body.color !== undefined) { updates.push('color = ?'); values.push(body.color); }
  if (body.positionX !== undefined) { updates.push('position_x = ?'); values.push(body.positionX); }
  if (body.positionY !== undefined) { updates.push('position_y = ?'); values.push(body.positionY); }
  if (body.parentId !== undefined) { updates.push('parent_id = ?'); values.push(body.parentId); }
  if (body.aiConversation !== undefined) { updates.push('ai_conversation = ?'); values.push(JSON.stringify(body.aiConversation)); }

  if (updates.length > 0) {
    values.push(id);
    db.prepare(`UPDATE nodes SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    updateProjectTimestamp(existing.project_id);
  }

  const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(id);
  return c.json(formatNode(node));
});

// Delete a node
app.delete('/nodes/:id', (c) => {
  const { id } = c.req.param();
  const existing = db.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as any;
  if (!existing) return c.json({ error: 'Not found' }, 404);

  // Delete related edges
  db.prepare('DELETE FROM edges WHERE source = ? OR target = ?').run(id, id);
  db.prepare('DELETE FROM nodes WHERE id = ?').run(id);
  updateProjectTimestamp(existing.project_id);
  return c.json({ ok: true });
});

function formatNode(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    parentId: row.parent_id,
    label: row.label,
    description: row.description,
    color: row.color,
    isRoot: !!row.is_root,
    positionX: row.position_x,
    positionY: row.position_y,
    aiConversation: JSON.parse(row.ai_conversation || '[]'),
  };
}

function updateProjectTimestamp(projectId: string) {
  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), projectId);
}

export default app;
