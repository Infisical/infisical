import { Lock } from "@app/lib/red-lock";

import { TKeyStoreFactory } from "./keystore";

export const inMemoryKeyStore = (): TKeyStoreFactory => {
  const store: Record<string, string | number | Buffer> = {};

  return {
    setItem: async (key, value) => {
      store[key] = value;
      return "OK";
    },
    setItemWithExpiry: async (key, value) => {
      store[key] = value;
      return "OK";
    },
    deleteItem: async (key) => {
      delete store[key];
      return 1;
    },
    getItem: async (key) => {
      const value = store[key];
      if (typeof value === "string") {
        return value;
      }
      return null;
    },
    incrementBy: async () => 1,
    acquireLock: () =>
      Promise.resolve({
        release: () => {}
      }) as Promise<Lock>,
    waitTillReady: async () => {}
  };
};
