import { Hono } from 'hono';
import { v4 as uuid } from 'uuid';
import db from '../db/connection';

const app = new Hono();

app.get('/projects/:projectId/edges', (c) => {
  const { projectId } = c.req.param();
  const rows = db.prepare('SELECT * FROM edges WHERE project_id = ?').all(projectId);
  return c.json(rows.map(formatEdge));
});

app.post('/projects/:projectId/edges', async (c) => {
  const { projectId } = c.req.param();
  const body = await c.req.json();
  const id = body.id || uuid();
  db.prepare('INSERT INTO edges (id, project_id, source, target, type, label, source_handle, target_handle) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, projectId, body.source, body.target, body.type ?? 'tree', body.label ?? '', body.sourceHandle ?? 'right', body.targetHandle ?? 'left');
  const edge = db.prepare('SELECT * FROM edges WHERE id = ?').get(id);
  return c.json(formatEdge(edge), 201);
});

app.patch('/edges/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const sets: string[] = [];
  const vals: any[] = [];
  if (body.sourceHandle !== undefined) { sets.push('source_handle = ?'); vals.push(body.sourceHandle); }
  if (body.targetHandle !== undefined) { sets.push('target_handle = ?'); vals.push(body.targetHandle); }
  if (body.label !== undefined) { sets.push('label = ?'); vals.push(body.label); }
  if (sets.length > 0) {
    vals.push(id);
    db.prepare(`UPDATE edges SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  const row = db.prepare('SELECT * FROM edges WHERE id = ?').get(id);
  return c.json(formatEdge(row));
});

app.delete('/edges/:id', (c) => {
  const { id } = c.req.param();
  db.prepare('DELETE FROM edges WHERE id = ?').run(id);
  return c.json({ ok: true });
});

function formatEdge(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    source: row.source,
    target: row.target,
    type: row.type,
    label: row.label,
    sourceHandle: row.source_handle,
    targetHandle: row.target_handle,
  };
}

export default app;
