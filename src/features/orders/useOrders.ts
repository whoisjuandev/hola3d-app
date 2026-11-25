import { useCallback, useEffect, useState } from 'react';
import type { Order, Stage } from '../../../shared/orders';
import { STAGE_LABEL } from '../../../shared/orders';
import { createOrder, fetchOrders, saveStage, type NewOrderInput } from './api';

export interface StageChange { id: string; from: Stage; to: Stage; text: string }

type Status = 'loading' | 'ready' | 'error';

/** Orders state with optimistic stage moves. A failed save puts the order back and reports why. */
export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [lastChange, setLastChange] = useState<StageChange | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      setOrders(await fetchOrders());
      setStatus('ready');
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetchOrders().then(
      (list) => { if (alive) { setOrders(list); setStatus('ready'); } },
      (e: Error) => { if (alive) { setError(e.message); setStatus('error'); } },
    );
    return () => { alive = false; };
  }, []);

  const replace = (id: string, patch: Partial<Order>) =>
    setOrders((list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  const move = useCallback(async (order: Order, to: Stage, recordUndo = true) => {
    const from = order.stage;
    replace(order.id, { stage: to });
    setLastChange(recordUndo ? { id: order.id, from, to, text: `#${order.id} pasó a ${STAGE_LABEL[to]}` } : null);
    try {
      const saved = await saveStage(order.id, to);
      replace(order.id, saved);
    } catch (e) {
      replace(order.id, { stage: from });
      setLastChange(null);
      setError(`No se pudo mover #${order.id}: ${(e as Error).message}`);
    }
  }, []);

  const undo = useCallback(async () => {
    if (!lastChange) return;
    const order = orders.find((o) => o.id === lastChange.id);
    if (order) await move(order, lastChange.from, false);
  }, [lastChange, orders, move]);

  const create = useCallback(async (input: NewOrderInput) => {
    const order = await createOrder(input);
    setOrders((list) => [...list, order]);
    return order;
  }, []);

  /** Put a saved order in the list, as the API answered it (a logged print job changes its real cost). */
  const update = useCallback((order: Order) => setOrders((list) => list.map((o) => (o.id === order.id ? order : o))), []);

  return {
    orders, status, error, lastChange, load, move, undo, create, update,
    dismissError: () => setError(null),
    dismissChange: () => setLastChange(null),
  };
}
