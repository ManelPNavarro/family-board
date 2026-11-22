CREATE TABLE IF NOT EXISTS meals (
  date TEXT NOT NULL,
  meal TEXT NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'dinner')),
  notes TEXT NOT NULL CHECK (length(notes) BETWEEN 1 AND 500),
  PRIMARY KEY (date, meal)
);
