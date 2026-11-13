import { TDomainKeyStore } from "../key-store";

type TEntry = { value: string; expiresAt: number };

// Mimics Redis for the calls we make: TTL in seconds, expiry on read, NX.
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
}
