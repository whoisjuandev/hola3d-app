// The client picker shared by the new-order, save-quote and accept-quote forms: pick a client from the list or type a new name.
import { useEffect, useState } from 'react';
import type { ClientSummary } from '../../../shared/clients';
import { findClientByName } from '../../../shared/clients';
import { fetchClients } from './api';

/** The clients to pick from, loaded once. Without them the form still works: the API matches the typed name. */
export function usePickerClients(): ClientSummary[] {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  useEffect(() => {
    let alive = true;
    fetchClients().then((list) => { if (alive) setClients(list); }, () => undefined);
    return () => { alive = false; };
  }, []);
  return clients;
}

export type ClientReference = { clientId: number } | { client: string };

/** A name from the list links that client; any other name creates a new one when the form is saved. */
export function clientReference(clients: ClientSummary[], text: string): ClientReference {
  const picked = findClientByName(clients, text);
  return picked ? { clientId: picked.id } : { client: text };
}

export function clientPickerHint(clients: ClientSummary[], text: string, saving: string): string {
  const picked = findClientByName(clients, text);
  if (picked) return `Cliente de la lista: ${picked.name} · ${picked.orderCount} ${picked.orderCount === 1 ? 'pedido' : 'pedidos'}`;
  return text.trim() ? `Cliente nuevo: se crea al guardar ${saving}.` : 'Elegí uno de la lista o escribí un nombre nuevo.';
}
