import RE2 from "re2";

import { TKeyStoreFactory } from "@app/keystore/keystore";
import { applyJitter } from "@app/lib/dates";
import { delay as delayMs } from "@app/lib/delay";
import { Lock } from "@app/lib/red-lock";

export const mockKeyStore = (): TKeyStoreFactory => {
  const store: Record<string, string | number | Buffer> = {};
  const hashStore: Record<string, Record<string, string>> = {};

  const getRegex = (pattern: string) =>
    new RE2(`^${pattern.replace(/[-[\]/{}()+?.\\^$|]/g, "\\$&").replace(/\*/g, ".*")}$`);

  return {
    setItem: async (key, value) => {
      store[key] = value;
      return "OK";
    },
    setExpiry: async () => 0,
    ttl: async () => -1,
    setItemWithExpiry: async (key, _expiryInSeconds, value) => {
      store[key] = value;
      return "OK";
    },
    setItemWithExpiryNX: async (key, _expiryInSeconds, value) => {
      if (store[key] !== undefined) return null;
      store[key] = value;
      return "OK";
    },
    deleteItem: async (key) => {
      delete store[key];
      delete hashStore[key];
      return 1;
    },
    deleteItems: async ({ pattern, batchSize = 500, delay = 1500, jitter = 200 }) => {
      const regex = getRegex(pattern);
      let totalDeleted = 0;
      const keys = Object.keys(store);

      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);

        for (const key of batch) {
          if (regex.test(key)) {
            delete store[key];
            totalDeleted += 1;
          }
        }

        // eslint-disable-next-line no-await-in-loop
        await delayMs(Math.max(0, applyJitter(delay, jitter)));
      }

      return totalDeleted;
    },
    getItem: async (key) => {
      const value = store[key];
      if (typeof value === "string") {
        return value;
      }
      return null;
    },
    getItemPrimary: async (key) => {
      const value = store[key];
      if (typeof value === "string") {
        return value;
      }
      return null;
    },
    incrementBy: async (key, value) => {
      const current = typeof store[key] === "string" ? parseInt(store[key] as string, 10) : 0;
      const next = current + value;
      store[key] = String(next);
      return next;
    },
    incrementByAndRefreshExpiryIfUnderLimit: async () => {
      return 1;
    },
    claimLeastLoaded: async (keys, baseOccupancies) => {
      if (keys.length === 0) return 0;
      if (keys.length !== baseOccupancies.length) {
        throw new Error("claimLeastLoaded: baseOccupancies must have one entry per key");
      }
      let bestIdx = 0;
      let bestTotal: number | null = null;
      keys.forEach((key, i) => {
        const reserved = typeof store[key] === "string" ? parseInt(store[key] as string, 10) : 0;
        const total = baseOccupancies[i] + reserved;
        if (bestTotal === null || total < bestTotal) {
          bestTotal = total;
          bestIdx = i + 1;
        }
      });
      const chosen = keys[bestIdx - 1];
      const current = typeof store[chosen] === "string" ? parseInt(store[chosen] as string, 10) : 0;
      store[chosen] = String(current + 1);
      return bestIdx;
    },
    decrementByOrDelete: async (key) => {
      const current = typeof store[key] === "string" ? parseInt(store[key] as string, 10) : 0;
      const next = current - 1;
      if (next <= 0) {
        delete store[key];
        return 0;
      }
      store[key] = String(next);
      return next;
    },
    incrementByWithExpiry: async (key, value) => {
      const current = typeof store[key] === "string" ? parseInt(store[key] as string, 10) : 0;
      const next = current + value;
      store[key] = String(next);
      return next;
    },
    incrementSeededWithExpiry: async (key, seed) => {
      const existing = store[key];
      if (existing === undefined) {
        const seeded = 1 + seed;
        store[key] = String(seeded);
        return seeded;
      }
      const next = (typeof existing === "string" ? parseInt(existing, 10) : 0) + 1;
      store[key] = String(next);
      return next;
    },
    pgGetIntItem: async (key) => {
      const value = store[key];
      if (typeof value === "number") {
        return Number(value);
      }
    },
    hashSet: async (key, field, value) => {
      if (!hashStore[key]) hashStore[key] = {};
      hashStore[key][field] = value;
      return 1;
    },
    hashGet: async (key, field) => {
      return hashStore[key]?.[field] ?? null;
    },
    pgIncrementBy: async () => {
      return 1;
    },
    getItemsPrimary: async (keys) => {
      return keys.map((key) => {
        const value = store[key];
        return typeof value === "string" ? value : null;
      });
    },
    getItems: async (keys) => {
      const values = keys.map((key) => {
        const value = store[key];
        if (typeof value === "string") {
          return value;
        }
        return null;
      });
      return values;
    },
    getKeysByPattern: async (pattern) => {
      const regex = getRegex(pattern);
      const keys = Object.keys(store);
      return keys.filter((key) => regex.test(key));
    },
    deleteItemsByKeyIn: async (keys) => {
      for (const key of keys) {
        delete store[key];
      }
      return keys.length;
    },
    acquireLock: () => {
      return Promise.resolve({
        release: () => {}
      }) as Promise<Lock>;
    },
    waitTillReady: async () => {},
    listPush: async (key, value) => {
      const existing = store[key];
      let list: string[] = [];
      if (typeof existing === "string") {
        list = JSON.parse(existing) as string[];
      }
      list.push(value);
      store[key] = JSON.stringify(list);
      return list.length;
    },
    listRange: async (key, start, stop) => {
      const existing = store[key];
      let list: string[] = [];
      if (typeof existing === "string") {
        list = JSON.parse(existing) as string[];
      }
      return list.slice(start, stop + 1);
    },
    listRemove: async (key: string, count: number, value: string) => {
      const existing = store[key];
      let list: string[] = [];
      if (typeof existing === "string") {
        list = JSON.parse(existing) as string[];
      }

      let removed = 0;
      const filtered = list.filter((item) => {
        const shouldRemove = item === value && (count === 0 || removed < count);
        if (shouldRemove) removed += 1;
        return !shouldRemove;
      });

      store[key] = JSON.stringify(filtered);
      return removed;
    },
    listLength: async (key) => {
      const existing = store[key];
      let list: string[] = [];
      if (typeof existing === "string") {
        list = JSON.parse(existing) as string[];
      }
      return list.length;
    },
    streamAdd: async () => null,
    streamLength: async () => 0,
    streamRange: async () => [],
    streamTrim: async () => 0,
    streamCollect: async () => ({ entries: [], lastId: null })
  };
};
