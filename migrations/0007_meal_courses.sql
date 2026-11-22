CREATE TABLE IF NOT EXISTS meal_courses (
  date TEXT NOT NULL,
  meal TEXT NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'dinner')),
  first_course TEXT NOT NULL,
  second_course TEXT NOT NULL,
  dessert TEXT NOT NULL,
  PRIMARY KEY (date, meal)
);

CREATE TABLE IF NOT EXISTS meal_course_history (
  course INTEGER NOT NULL CHECK (course BETWEEN 0 AND 2),
  name_key TEXT NOT NULL,
  title TEXT NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (course, name_key)
);
