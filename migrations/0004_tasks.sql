CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  due_date TEXT,
  priority TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high')),
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
);
