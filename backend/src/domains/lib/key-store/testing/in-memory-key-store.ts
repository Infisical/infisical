import { TDomainKeyStore } from "../key-store";

type TEntry = { value: string; expiresAt: number };

// Mimics Redis for the calls we make: TTL in seconds, expiry on read, NX.
export class InMemoryKeyStore implements TDomainKeyStore {
  private readonly entries = new Map<string, TEntry>();

  // Postgres counters (pgIncrementBy), they never expire here.
  private readonly counters = new Map<string, number>();

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

  deleteItemIfValue = async (key: string, value: string) => {
    if (this.read(key) !== value) return false;
    return this.entries.delete(key);
  };

  incrementByWithExpiry = async (key: string, value: number, expiryInSeconds: number): Promise<number> => {
    const next = Number(this.read(key) ?? 0) + value;
    await this.setItemWithExpiry(key, expiryInSeconds, next);
    return next;
  };

  pgIncrementBy = async (key: string, { incr = 1 }: { incr?: number; expiry?: string; tx?: unknown }) => {
    const next = (this.counters.get(key) ?? 0) + incr;
    this.counters.set(key, next);
    return next;
  };

  pgGetIntItem = async (key: string, prefix?: string) => this.counters.get(InMemoryKeyStore.key(key, prefix));

  // Stream ids are "<ms>-<seq>" like Redis; here the seq counts up from one shared clock so order is total.
  streamAdd = async (key: string, _id: string, fieldValue: Record<string, string>): Promise<string | null> => {
    this.streamSeq += 1;
    const id = `${this.streamSeq}-0`;
    const stream = this.streams.get(key) ?? [];
    stream.push([id, Object.entries(fieldValue).flat()]);
    this.streams.set(key, stream);
    return id;
  };

  streamCollect = async (key: string, batchSize: number, maxEntries: number) => {
    const all = this.streams.get(key) ?? [];
    const limit = Math.min(maxEntries, Math.ceil(maxEntries / batchSize) * batchSize);
    const entries = all.slice(0, limit);
    return { entries, lastId: entries.length ? entries[entries.length - 1][0] : null };
  };

  // MINID trimming: inclusive drops minId itself too.
  streamTrim = async (key: string, minId: string, inclusive = false): Promise<number> => {
    const all = this.streams.get(key) ?? [];
    const cut = InMemoryKeyStore.streamSeqOf(minId);
    const kept = all.filter(([id]) => {
      const seq = InMemoryKeyStore.streamSeqOf(id);
      return inclusive ? seq > cut : seq >= cut;
    });
    this.streams.set(key, kept);
    return all.length - kept.length;
  };

  // A lock held elsewhere refuses at once, like a redlock acquire with retryCount 0.
  acquireLock = async (resources: string[]) => {
    const held = resources.filter((resource) => this.locks.has(resource));
    if (held.length) throw new Error(`lock held: ${held.join(",")}`);
    resources.forEach((resource) => this.locks.add(resource));
    return {
      release: async () => {
        resources.forEach((resource) => this.locks.delete(resource));
        return { attempts: [], start: 0 } as never;
      }
    };
  };

  private readonly streams = new Map<string, [string, string[]][]>();

  private streamSeq = 0;

  private readonly locks = new Set<string>();

  private static streamSeqOf(id: string): number {
    return Number(id.split("-")[0]);
  }
}
