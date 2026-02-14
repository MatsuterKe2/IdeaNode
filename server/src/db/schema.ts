import db from './connection';

export function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      parent_id TEXT,
      label TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#3b82f6',
      is_root INTEGER NOT NULL DEFAULT 0,
      position_x REAL NOT NULL DEFAULT 0,
      position_y REAL NOT NULL DEFAULT 0,
      ai_conversation TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS edges (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source TEXT NOT NULL,
      target TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'tree',
      label TEXT NOT NULL DEFAULT '',
      source_handle TEXT NOT NULL DEFAULT 'right',
      target_handle TEXT NOT NULL DEFAULT 'left',
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);

  // マイグレーション: 既存DBにカラム追加
  try {
    db.exec(`ALTER TABLE edges ADD COLUMN source_handle TEXT NOT NULL DEFAULT 'right'`);
  } catch {}
  try {
    db.exec(`ALTER TABLE edges ADD COLUMN target_handle TEXT NOT NULL DEFAULT 'left'`);
  } catch {}
}
