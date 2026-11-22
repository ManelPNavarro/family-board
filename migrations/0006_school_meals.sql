CREATE TABLE IF NOT EXISTS meal_school_slots (
  date TEXT NOT NULL,
  meal TEXT NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'dinner')),
  PRIMARY KEY (date, meal)
);

CREATE TABLE IF NOT EXISTS meal_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
