import { TDbClient } from "@app/db";
import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";

import { AccessControlModule } from "../module";

// The services another domain's integration tests take from Access Control, on Postgres, with caches off.
export const accessControlServices = (db: TDbClient) => {
  const { actorGrantsService, roleService, groupService } = new AccessControlModule({
    db,
    keyStore: new InMemoryKeyStore(),
    cacheMarkerTtlSeconds: 0
  });
  return { actorGrantsService, roleService, groupService };
};
