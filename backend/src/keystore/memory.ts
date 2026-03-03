import RE2 from "re2";

import { applyJitter } from "@app/lib/dates";
import { delay as delayMs } from "@app/lib/delay";
import { Lock } from "@app/lib/red-lock";

import { TKeyStoreFactory } from "./keystore";

export const inMemoryKeyStore = (): TKeyStoreFactory => {
  const store: Record<string, string | number | Buffer> = {};
  const listStore: Record<string, string[]> = {};
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
    pgGetIntItem: async (key) => {
      const value = store[key];
      if (typeof value === "number") {
        return Number(value);
      }
    },
    pgIncrementBy: async () => {
      return 1;
    },
    incrementBy: async () => {
      return 1;
    },
    acquireLock: () => {
      return Promise.resolve({
        release: () => {}
      }) as Promise<Lock>;
    },
    waitTillReady: async () => {},
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
    listPush: async (key, value) => {
      if (!listStore[key]) listStore[key] = [];
      listStore[key].push(value);
      return listStore[key].length;
    },
    listRange: async (key, start, stop) => {
      if (!listStore[key]) return [];
      const list = listStore[key];
      const end = stop === -1 ? list.length : stop + 1;
      return list.slice(start, end);
    },
    listRemove: async (key, _count, value) => {
      if (!listStore[key]) return 0;
      const originalLength = listStore[key].length;
      listStore[key] = listStore[key].filter((v) => v !== value);
      return originalLength - listStore[key].length;
    },
    listLength: async (key) => {
      return listStore[key]?.length ?? 0;
    }
  };
};
