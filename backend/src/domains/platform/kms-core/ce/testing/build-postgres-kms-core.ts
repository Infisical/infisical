import type { TDbClient } from "@app/db";
import { DataAccessDb } from "@app/domains/lib/data-access-db";

import { KmsCoreModule } from "../module";
import { TKmsCoreHooks } from "../service/kms-core-hooks";
import { TKmsCoreEnv } from "../service/root-key-service";
import { testKmsCoreEnv } from "./build-kms-core";

// KMS Core on an integration database. The template database's migrations already bootstrapped a root key with
// TEST_ENCRYPTION_KEY, so start() loads that key.
export const buildPostgresKmsCore = (
  db: TDbClient,
  { env, hooks = {} }: { env?: Partial<TKmsCoreEnv>; hooks?: TKmsCoreHooks } = {}
) =>
  new KmsCoreModule({
    db: DataAccessDb.fromClient(db),
    env: testKmsCoreEnv(env),
    hooks,
    isFipsEnabled: () => false
  });
