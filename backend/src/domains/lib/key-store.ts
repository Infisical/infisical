import type { TKeyStoreFactory } from "@app/keystore/keystore";

// The part of the key store a domain's state holders use, so an in-memory one can stand in for Redis.
export type TDomainKeyStore = Pick<
  TKeyStoreFactory,
  "getItem" | "getItems" | "setItemWithExpiry" | "setItemWithExpiryNX" | "deleteItem" | "pgIncrementBy" | "pgGetIntItem"
>;
