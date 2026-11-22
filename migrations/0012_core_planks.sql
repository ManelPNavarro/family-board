INSERT INTO workout_exercises (id, title, movement, equipment) VALUES
  ('plank', 'Plank', 'core', '[]'),
  ('side-plank', 'Side Plank', 'core', '[]')
ON CONFLICT(id) DO NOTHING;
