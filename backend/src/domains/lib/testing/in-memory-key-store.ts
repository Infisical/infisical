import { TDomainKeyStore } from "../key-store";

type TEntry = { value: string; expiresAt: number };

// Redis semantics for the calls state holders make: TTL in seconds, expiry on read, NX.
export class InMemoryKeyStore implements TDomainKeyStore {
  private readonly entries = new Map<string, TEntry>();

  constructor(private readonly now: () => number = Date.now) {}

  private read(key: string): string | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  private static key(key: string, prefix?: string) {
    return prefix ? `${prefix}:${key}` : key;
  }

  getItem = async (key: string, prefix?: string) => this.read(InMemoryKeyStore.key(key, prefix));

  getItems = async (keys: string[], prefix?: string) => keys.map((key) => this.read(InMemoryKeyStore.key(key, prefix)));

  setItemWithExpiry = async (
    key: string,
    expiryInSeconds: number | string,
    value: string | number | Buffer,
    prefix?: string
  ): Promise<"OK"> => {
    this.entries.set(InMemoryKeyStore.key(key, prefix), {
      value: String(value),
      expiresAt: this.now() + Number(expiryInSeconds) * 1000
    });
    return "OK";
  };

  setItemWithExpiryNX = async (
    key: string,
    expiryInSeconds: number | string,
    value: string | number | Buffer,
    prefix?: string
  ): Promise<"OK" | null> => {
    if (this.read(InMemoryKeyStore.key(key, prefix)) !== null) return null;
    return this.setItemWithExpiry(key, expiryInSeconds, value, prefix);
  };

  deleteItem = async (key: string) => (this.entries.delete(key) ? 1 : 0);

  // The Postgres-backed counters (key_value_store) are a separate namespace from the Redis keys above.
  // Expiry is not modelled: the counters only ever grow, and a test never outlives one.
  private readonly counters = new Map<string, number>();

  pgIncrementBy = async (key: string, { incr = 1 }: { incr?: number; expiry?: string; tx?: unknown }) => {
    const next = (this.counters.get(key) ?? 0) + incr;
    this.counters.set(key, next);
    return next;
  };

  pgGetIntItem = async (key: string, prefix?: string) => this.counters.get(InMemoryKeyStore.key(key, prefix));
}
