import RE2 from "re2";

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
    deleteItems: async (pattern) => {
      const regex = new RE2(pattern.replace(/\*/g, ".*"));
      let deletedCount = 0;
      for (const key of Object.keys(store)) {
        if (regex.test(key)) {
          delete store[key];
          deletedCount += 1;
        }
      }
      return deletedCount;
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
