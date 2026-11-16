import type { TKeyStoreFactory } from "@app/keystore/keystore";

// Just the key store calls domains use, so tests can swap in an in-memory one for Redis.
export type TDomainKeyStore = Pick<
  TKeyStoreFactory,
  "getItem" | "getItems" | "setItemWithExpiry" | "setItemWithExpiryNX" | "deleteItem"
>;
