import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";

import { ActorGrantsCache } from "../data-access/actor-grants-cache";
import { ActorGrantsService } from "../services/actor-grants/service";
import { GroupService } from "../services/groups/service";
import { RoleService } from "../services/roles/service";
import { InMemoryGrantSeeder } from "./in-memory-grant-seeder";
import { inMemoryGrantTransactions, InMemoryGrantStore } from "./in-memory-grant-store";

// Access Control over an in-memory store, for tests of this domain and of others. The cache checks the fingerprint on
// every read, so what `seed` writes shows on the next call.
export const buildAccessControl = () => {
  const grantStore = new InMemoryGrantStore();
  return {
    grantStore,
    actorGrantsService: new ActorGrantsService(
      grantStore,
      new ActorGrantsCache(new InMemoryKeyStore(), 0),
      inMemoryGrantTransactions(grantStore)
    ),
    roleService: new RoleService(grantStore),
    groupService: new GroupService(grantStore),
    seed: new InMemoryGrantSeeder(grantStore)
  };
};
