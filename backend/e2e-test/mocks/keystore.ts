import RE2 from "re2";

import { TKeyStoreFactory } from "@app/keystore/keystore";
import { applyJitter } from "@app/lib/dates";
import { delay as delayMs } from "@app/lib/delay";
import { Lock } from "@app/lib/red-lock";

export const mockKeyStore = (): TKeyStoreFactory => {
  const store: Record<string, string | number | Buffer> = {};

  const getRegex = (pattern: string) =>
    new RE2(`^${pattern.replace(/[-[\]/{}()+?.\\^$|]/g, "\\$&").replace(/\*/g, ".*")}$`);

  return {
    setItem: async (key, value) => {
      store[key] = value;
      return "OK";
    },
    setExpiry: async () => 0,
    setItemWithExpiry: async (key, value) => {
      store[key] = value;
      return "OK";
    },
    deleteItem: async (key) => {
      delete store[key];
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
    incrementBy: async () => {
      return 1;
    },
    pgGetIntItem: async (key) => {
      const value = store[key];
      if (typeof value === "number") {
        return Number(value);
      }
    },
    pgIncrementBy: async () => {
      return 1;
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
    isRedisClusterMode: () => false
  };
};
