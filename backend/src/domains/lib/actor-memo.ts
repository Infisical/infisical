import type { TActorContext } from "./actor-context";

// Remembers a value per actor context and key, so repeated permission checks in one request compute once. Keyed on
// the context object itself: it lives as long as the request does, and the entry goes with it.
export class ActorMemo<T> {
  private readonly entries = new WeakMap<TActorContext, Map<string, Promise<T>>>();

  getOrCompute(actor: TActorContext, key: string, compute: () => Promise<T>): Promise<T> {
    let forActor = this.entries.get(actor);
    if (!forActor) {
      forActor = new Map();
      this.entries.set(actor, forActor);
    }
    const existing = forActor.get(key);
    if (existing) return existing;
    const pending = compute();
    forActor.set(key, pending);
    // A failure is not remembered: the next check in the request tries again.
    pending.catch(() => forActor.delete(key));
    return pending;
  }
}
