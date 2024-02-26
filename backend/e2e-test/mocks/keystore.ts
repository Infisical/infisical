import { TKeyStoreFactory } from "@app/keystore/keystore";

export const mockKeyStore = (): TKeyStoreFactory => {
  const store: Record<string, string | number | Buffer> = {};

  return {
    setItem: async (key, value) => {
      store[key] = value;
      return "OK";
    },
    getItem: async (key) => {
      const value = store[key];
      if (typeof value === "string") {
        return value;
      }
      return null;
    }
  };
};
