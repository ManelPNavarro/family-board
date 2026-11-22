CREATE TABLE IF NOT EXISTS meal_dishes (
  date TEXT NOT NULL,
  meal TEXT NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'dinner')),
  dishes TEXT NOT NULL CHECK (json_valid(dishes) AND json_type(dishes) = 'array'),
  PRIMARY KEY (date, meal)
);

CREATE TABLE IF NOT EXISTS meal_dish_history (
  name_key TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  last_seen INTEGER NOT NULL
);
