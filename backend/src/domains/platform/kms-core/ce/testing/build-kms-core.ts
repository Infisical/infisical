import type { TDbClient } from "@app/db";

import { KmsCoreModule } from "../module";
import { TKmsCoreHooks } from "../services/dependencies";
import { TKmsCoreEnv } from "../services/root-key/service";
import { InMemoryKmsCoreStores } from "./in-memory-kms-core-stores";
import { rootKeyTestEnv } from "./root-key-fixture";

type TBuildOptions = { env?: Partial<TKmsCoreEnv>; hooks?: TKmsCoreHooks; isFipsEnabled?: () => boolean };

// KMS Core over in-memory stores. Load fixture rows into `memory` first: the root key is loaded while building.
export const buildInMemoryKmsCore = async ({
  env,
  hooks = {},
  isFipsEnabled = () => false,
  memory = new InMemoryKmsCoreStores()
}: TBuildOptions & { memory?: InMemoryKmsCoreStores } = {}) => {
  const module = await KmsCoreModule.create({
    transactionRunner: memory.transactionRunner,
    stores: memory.stores,
    env: rootKeyTestEnv(env),
    hooks,
    isFipsEnabled
  });
  return { module, memory };
};

// KMS Core on an integration database. The template database's migrations already bootstrapped a root key with the
// test encryption key, which this loads.
export const buildPostgresKmsCore = (db: TDbClient, { env, hooks = {} }: TBuildOptions = {}) =>
  KmsCoreModule.create({
    db,
    readKnex: () => db,
    env: rootKeyTestEnv(env),
    hooks,
    isFipsEnabled: () => false
  });
