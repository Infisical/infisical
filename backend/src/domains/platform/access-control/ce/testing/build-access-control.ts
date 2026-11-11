import { DataAccessDb } from "@app/domains/lib/data-access-db";
import { InMemoryKeyStore } from "@app/domains/lib/testing/in-memory-key-store";

import { AccessControlModule, TAccessControlDomain } from "../module";
import { InMemoryAccessControlDataAccess } from "./in-memory-access-control-data-access";

// Access Control for another domain's tests: on Postgres when given a db, in memory otherwise. Events are dropped;
// a test that checks them builds the module itself.
export const buildAccessControlForTests = ({ db }: { db?: DataAccessDb } = {}): {
  service: TAccessControlDomain;
  inMemory?: InMemoryAccessControlDataAccess;
} => {
  const keyStore = new InMemoryKeyStore();
  const eventEmitter = { emit: async () => {} };
  if (db) return { service: new AccessControlModule({ db, keyStore, eventEmitter }).service };
  const inMemory = new InMemoryAccessControlDataAccess();
  return {
    service: new AccessControlModule({ ...inMemory, keyStore, eventEmitter }).service,
    inMemory
  };
};
