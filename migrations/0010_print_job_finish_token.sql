-- Finishing a planned job is one D1 batch. Its first statement turns the job into a finished one under the full guard
-- (still planned on the printer the request read, order, printer and spools exist, enough grams) and stamps it with a
-- random token made for that request; every later statement of the batch (grams rows, printer minutes, spool grams)
-- runs only while the job carries that token. So the counters move only when the batch's own first statement applied.
-- NULL for jobs logged directly and for planned jobs.

ALTER TABLE print_jobs ADD COLUMN finish_token TEXT;
