-- A retried save must not store the same quote twice (as 0012 did for print jobs). The quick quote and "Guardar como
-- presupuesto" forms make a random key when they open and send it with every try of that save; the quote stores it,
-- and no two quotes can carry the same one. NULL for quotes saved without a key (several NULLs are allowed by a unique
-- index). Adding a nullable column leaves every row, id and number as it was.
ALTER TABLE quotes ADD COLUMN submission_key TEXT;

CREATE UNIQUE INDEX quotes_submission_key ON quotes (submission_key);
