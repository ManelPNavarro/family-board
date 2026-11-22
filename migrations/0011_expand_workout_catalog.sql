INSERT INTO workout_exercises (id, title, movement, equipment) VALUES
  ('push-up', 'Push-ups', 'push', '[]'),
  ('slow-push-up', 'Slow Push-ups', 'push', '[]'),
  ('pull-up', 'Pull-ups', 'pull', '["pull-up-bar"]'),
  ('chin-up', 'Chin-ups', 'pull', '["pull-up-bar"]'),
  ('dumbbell-curl', 'Dumbbell Bicep Curl', 'pull', '["dumbbell-5","dumbbell-12"]'),
  ('bird-dog', 'Bird Dog', 'core', '[]'),
  ('hammer-curl', 'Dumbbell Hammer Curl', 'pull', '["dumbbell-5","dumbbell-12"]'),
  ('dumbbell-lunge', 'Dumbbell Lunges', 'legs', '["dumbbell-12"]'),
  ('dumbbell-squat', 'Dumbbell Squats', 'legs', '["dumbbell-12"]'),
  ('toe-taps', 'Toe Taps', 'core', '[]'),
  ('crunches', 'Crunches', 'core', '[]'),
  ('triceps-dip', 'Triceps Dips', 'push', '["bench"]'),
  ('dumbbell-triceps-extension', 'Dumbbell Triceps Extension', 'push', '["dumbbell-12"]'),
  ('resistance-band-row', 'Seated Resistance Band Row', 'pull', '["bands"]'),
  ('glute-bridge', 'Glute Bridge', 'legs', '[]')
ON CONFLICT(id) DO UPDATE SET title = excluded.title, movement = excluded.movement, equipment = excluded.equipment;
