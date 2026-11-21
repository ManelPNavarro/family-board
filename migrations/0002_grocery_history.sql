CREATE TABLE grocery_history (
  name_key TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  times_added INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);

INSERT INTO grocery_history (name_key, title, times_added, last_seen)
SELECT lower(trim(title)), min(title), count(*), 0
FROM grocery_items
GROUP BY lower(trim(title));

CREATE TRIGGER grocery_history_on_add
AFTER INSERT ON grocery_items
BEGIN
  INSERT INTO grocery_history (name_key, title, times_added, last_seen)
  VALUES (lower(trim(NEW.title)), NEW.title, 1, unixepoch())
  ON CONFLICT(name_key) DO UPDATE SET
    title = excluded.title,
    times_added = grocery_history.times_added + 1,
    last_seen = excluded.last_seen;
END;

CREATE TRIGGER grocery_history_on_rename
AFTER UPDATE OF title ON grocery_items
WHEN lower(trim(NEW.title)) <> lower(trim(OLD.title))
BEGIN
  INSERT INTO grocery_history (name_key, title, times_added, last_seen)
  VALUES (lower(trim(NEW.title)), NEW.title, 1, unixepoch())
  ON CONFLICT(name_key) DO UPDATE SET
    title = excluded.title,
    times_added = grocery_history.times_added + 1,
    last_seen = excluded.last_seen;
END;
