-- When an order was delivered, so the home screen can add up what was delivered this month. The stage route sets it
-- when an order moves to `entregado` (keeping the first one if it is moved there again) and clears it when it moves
-- back. NULL while the order is not delivered.

ALTER TABLE orders ADD COLUMN delivered_at TEXT;

-- Orders delivered before this column existed: their last change is the best date there is.
UPDATE orders SET delivered_at = updated_at WHERE stage = 'entregado';
