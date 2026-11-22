CREATE TABLE IF NOT EXISTS meal_entries (
  date TEXT NOT NULL,
  meal TEXT NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'snack', 'dinner')),
  dishes TEXT NOT NULL CHECK (json_valid(dishes) AND json_type(dishes) = 'array'),
  school INTEGER NOT NULL CHECK (school IN (0, 1)),
  PRIMARY KEY (date, meal)
);
