import { TDbClient } from "@app/db";
import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";

import { AccessControlModule } from "../module";

// For other domains' integration tests: real Postgres, caches off.
export const accessControlServices = (db: TDbClient) => {
  const { actorGrantsService, roleService, groupService } = new AccessControlModule({
    db,
    keyStore: new InMemoryKeyStore(),
    cacheMarkerTtlSeconds: 0
  });
  return { actorGrantsService, roleService, groupService };
};
