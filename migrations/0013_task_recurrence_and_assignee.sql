ALTER TABLE tasks ADD COLUMN assignee TEXT CHECK (assignee IN ('manel', 'marina'));
ALTER TABLE tasks ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none'
  CHECK (recurrence IN ('none', 'daily', 'weekly', 'fortnightly', 'monthly'));
ALTER TABLE tasks ADD COLUMN recurrence_day INTEGER CHECK (recurrence_day BETWEEN 1 AND 31);
ALTER TABLE tasks ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
