import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { initDB } from './db/schema';
import projectsRouter from './routes/projects';
import nodesRouter from './routes/nodes';
import edgesRouter from './routes/edges';
import aiRouter from './routes/ai';

initDB();

if (!process.env.GEMINI_API_KEY) {
  console.warn('WARNING: GEMINI_API_KEY is not set. AI chat will not work.');
} else {
  console.log('GEMINI_API_KEY loaded.');
}

const app = new Hono();

app.use('*', cors());

app.route('/api/projects', projectsRouter);
app.route('/api', nodesRouter);
app.route('/api', edgesRouter);
app.route('/api/ai', aiRouter);

const port = 3001;
console.log(`Server running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });
