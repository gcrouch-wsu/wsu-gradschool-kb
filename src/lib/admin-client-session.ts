/**
 * Client-side admin session chrome sync.
 *
 * The admin shell renders email / Sign out from the server session at page load.
 * When a long-lived page (the editor) learns the cookie has expired via a 401, the
 * top bar would still look signed-in unless something pushes that state here.
 */

export type AdminClientSessionListener = (signedIn: boolean) => void;

const listeners = new Set<AdminClientSessionListener>();

/** Notify shell chrome that the cookie is valid again or has expired. */
export function publishAdminClientSession(signedIn: boolean) {
  for (const listener of listeners) {
    listener(signedIn);
  }
}

export function subscribeAdminClientSession(listener: AdminClientSessionListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
