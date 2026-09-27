import type { Replica } from './replica';
import type { Operation } from './types';

/** Send `to` everything `from` has that `to` may lack. Returns the ops `to` had not seen. */
export function pull(to: Replica, from: Replica): Operation[] {
  return to.receive(from.missingFor(to.versionVector()));
}

/** Two-way sync over a perfect connection. */
export function syncPair(a: Replica, b: Replica): void {
  pull(b, a);
  pull(a, b);
}
