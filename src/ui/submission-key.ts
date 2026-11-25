// The key a form sends with every try of one save, so the API recognises a retried save instead of storing it twice.

type KeyCrypto = Pick<Crypto, 'getRandomValues'> & { randomUUID?: () => string };

/**
 * A random key, made once when a form opens: a UUID, or, where the browser has no `crypto.randomUUID` (it needs a
 * secure context, so a page served over plain http on the local network lacks it), 32 hex digits from 16 random
 * bytes. Either one is 8 to 64 letters, digits or dashes, as the API asks.
 */
export function newSubmissionKey(source: KeyCrypto = globalThis.crypto): string {
  if (typeof source.randomUUID === 'function') return source.randomUUID();
  const bytes = source.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
