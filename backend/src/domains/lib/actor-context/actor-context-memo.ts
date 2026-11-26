import type { TActorContext } from "./actor-context";

// Per-request memo for permission checks. Keyed on the context object itself, which lives as long as the request,
// so entries go away with it.
export class ActorContextMemo<T> {
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
    // Don't cache failures, the next check in the request retries.
    pending.catch(() => forActor.delete(key));
    return pending;
  }
}
