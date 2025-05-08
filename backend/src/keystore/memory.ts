import RE2 from "re2";

import { applyJitter } from "@app/lib/dates";
import { delay as delayMs } from "@app/lib/delay";
import { Lock } from "@app/lib/red-lock";

import { TKeyStoreFactory } from "./keystore";

export const inMemoryKeyStore = (): TKeyStoreFactory => {
  const store: Record<string, string | number | Buffer> = {};

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
      const regex = new RE2(`^${pattern.replace(/[-[\]/{}()+?.\\^$|]/g, "\\$&").replace(/\*/g, ".*")}$`);
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
    acquireLock: () => {
      return Promise.resolve({
        release: () => {}
      }) as Promise<Lock>;
    },
    waitTillReady: async () => {}
  };
};
