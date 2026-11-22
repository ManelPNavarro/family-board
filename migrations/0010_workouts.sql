CREATE TABLE IF NOT EXISTS workout_exercises (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  movement TEXT NOT NULL CHECK (movement IN ('push', 'pull', 'core', 'legs')),
  equipment TEXT NOT NULL CHECK (json_valid(equipment) AND json_type(equipment) = 'array')
);

INSERT INTO workout_exercises (id, title, movement, equipment) VALUES
  ('push-up', 'Flexions', 'push', '[]'),
  ('slow-push-up', 'Flexions lentes', 'push', '[]'),
  ('pull-up', 'Dominades', 'pull', '["pull-up-bar"]'),
  ('chin-up', 'Chin-ups', 'pull', '["pull-up-bar"]'),
  ('dumbbell-curl', 'Curl de bíceps amb manuella', 'pull', '["dumbbell-5","dumbbell-12"]'),
  ('bird-dog', 'Bird dog', 'core', '[]')
ON CONFLICT(id) DO NOTHING;
