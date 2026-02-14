import { Hono } from 'hono';
import { v4 as uuid } from 'uuid';
import db from '../db/connection';

const app = new Hono();

app.get('/', (c) => {
  const rows = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all();
  return c.json(rows);
});

app.post('/', async (c) => {
  const { name } = await c.req.json();
  const id = uuid();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, name || 'New Project', now, now);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  return c.json(project, 201);
});

app.delete('/:id', (c) => {
  const { id } = c.req.param();
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  return c.json({ ok: true });
});

app.patch('/:id', async (c) => {
  const { id } = c.req.param();
  const { name } = await c.req.json();
  const now = new Date().toISOString();
  db.prepare('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?').run(name, now, id);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  return c.json(project);
});

export default app;
