ALTER TABLE grocery_history
ADD COLUMN produce INTEGER NOT NULL DEFAULT 0 CHECK (produce IN (0, 1));
