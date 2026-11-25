-- A retried save must not log the same print twice. The log and finish forms make a random key when they open and send
-- it with every try of that save; the job stores it, and no two jobs can carry the same one. NULL for jobs saved
-- without a key (several NULLs are allowed by a unique index).
ALTER TABLE print_jobs ADD COLUMN submission_key TEXT;

CREATE UNIQUE INDEX print_jobs_submission_key ON print_jobs (submission_key);

-- A finished job always has its result. The CHECK of 0006 lets a NULL result through (a comparison with NULL is not
-- false), and SQLite cannot change a CHECK in place, so two triggers refuse it on insert and on update. Rows written
-- before this migration have their result already (the app always writes it); any that do not get the one their
-- status means, so every row stays valid.
UPDATE print_jobs SET result = CASE status WHEN 'terminada' THEN 'ok' ELSE 'fallida' END
WHERE status IN ('terminada', 'fallida') AND result IS NULL;

CREATE TRIGGER print_jobs_result_on_insert BEFORE INSERT ON print_jobs
WHEN NEW.status IN ('terminada', 'fallida') AND NEW.result IS NULL
BEGIN
  SELECT RAISE(ABORT, 'a finished print job needs a result');
END;

CREATE TRIGGER print_jobs_result_on_update BEFORE UPDATE ON print_jobs
WHEN NEW.status IN ('terminada', 'fallida') AND NEW.result IS NULL
BEGIN
  SELECT RAISE(ABORT, 'a finished print job needs a result');
END;
