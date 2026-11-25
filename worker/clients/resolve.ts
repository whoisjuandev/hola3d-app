import { findClientByName, validateClient } from '../../shared/clients';
import type { ClientRepository } from './repository';

/**
 * The id of the client a request names: the one picked by id, or the one whose name matches, or a new client
 * with that name (and `newClient.phone`, when given). Returns field errors, having stored nothing, when the client
 * cannot be used. Shared by the new-order and new-quote routes and by accepting a quote without a client, so all of
 * them pick clients the same way. A client that already exists is never changed.
 */
export async function resolveClient(
  input: { client: string; clientId: number | null },
  clients: ClientRepository,
  newClient: { phone?: string } = {},
): Promise<{ id: number } | { errors: Record<string, string> }> {
  if (input.clientId !== null) {
    return (await clients.get(input.clientId)) ? { id: input.clientId } : { errors: { clientId: 'Ese cliente no existe.' } };
  }
  const match = findClientByName(await clients.list(), input.client);
  if (match) return { id: match.id };
  const draft = validateClient({ name: input.client, phone: newClient.phone ?? '' });
  if (!draft.ok) return { errors: { client: draft.errors.name ?? 'Revisá el nombre del cliente.' } };
  return { id: (await clients.create(draft.value)).id };
}
