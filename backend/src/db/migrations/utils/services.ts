import { Knex } from "knex";

import { startStandaloneKmsCore } from "@app/domains/domains";

import { TMigrationEnvConfig } from "./env-config";

type TDependencies = {
  envConfig: TMigrationEnvConfig;
  db: Knex;
};

// KMS Core over the migration's own connection, with only the root key loaded. Every query runs on `db`, so the
// migration's transaction sees what it writes (KMS Core's own transactions nest as savepoints on it).
export const getMigrationEncryptionServices = async ({ envConfig, db }: TDependencies) => {
  const kmsCoreDomain = await startStandaloneKmsCore({
    db,
    envConfig: { ...envConfig, KMS_ROOT_KEY_RETENTION_DAYS: 7 }
  });
  return { kmsCoreDomain };
};
