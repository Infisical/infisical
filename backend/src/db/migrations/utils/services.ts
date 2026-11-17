import { Knex } from "knex";

import { startStandaloneKmsCore } from "@app/domains/domains";

import { TMigrationEnvConfig } from "./env-config";

type TDependencies = {
  envConfig: TMigrationEnvConfig;
  db: Knex;
};

// Every query runs on `db` so the migration's transaction sees its own writes (KMS Core's transactions nest as
// savepoints on it). Only the root key is loaded.
export const getMigrationEncryptionServices = ({ envConfig, db }: TDependencies) =>
  startStandaloneKmsCore({ db, envConfig: { ...envConfig, KMS_ROOT_KEY_RETENTION_DAYS: 7 } });
